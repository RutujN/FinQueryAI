import os
import shutil
import sqlite3
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import rag_engine

# Load initial environment variables from .env
load_dotenv()

DB_PATH = os.path.join("data", "rag_database.db")
UPLOAD_DIR = os.path.join("data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory dictionary to support dynamic API key updates from the browser
DYNAMIC_KEYS = {
    "groq_api_key": os.getenv("GROQ_API_KEY", ""),
    "hf_token": os.getenv("HF_TOKEN", "")
}

def get_effective_keys():
    """Returns keys either set dynamically in the UI or fallback to the system environment."""
    return {
        "groq_api_key": DYNAMIC_KEYS["groq_api_key"] or os.getenv("GROQ_API_KEY", ""),
        "hf_token": DYNAMIC_KEYS["hf_token"] or os.getenv("HF_TOKEN", "")
    }

def ingest_samples():
    """Scans the data/samples folder and auto-ingests documents into the database if not fully embedded."""
    sample_dir = os.path.join("data", "samples")
    if not os.path.exists(sample_dir):
        return
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Only skip documents that are indexed AND have valid embeddings generated
    cursor.execute("""
        SELECT DISTINCT d.filename 
        FROM documents d
        JOIN chunks c ON d.id = c.doc_id
        WHERE c.embedding IS NOT NULL
    """)
    valid_indexed_files = {row[0] for row in cursor.fetchall()}
    conn.close()
    
    for filename in os.listdir(sample_dir):
        if filename not in valid_indexed_files:
            file_path = os.path.join(sample_dir, filename)
            ext = os.path.splitext(filename)[1]
            print(f"--- Ingesting default stock report: {filename} ---")
            try:
                with open(file_path, "rb") as f:
                    file_bytes = f.read()
                keys = get_effective_keys()
                rag_engine.add_document_to_index(
                    filename, 
                    file_bytes, 
                    ext, 
                    DB_PATH, 
                    keys["hf_token"]
                )
                print(f"Successfully indexed sample: {filename}")
            except Exception as e:
                print(f"Failed to auto-index sample {filename}: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup tasks
    rag_engine.init_db(DB_PATH)
    ingest_samples()
    yield
    # Shutdown tasks (if any)

app = FastAPI(
    title="FinQuery AI Terminal",
    description="A lightweight RAG server for Financial Stock Analysis",
    lifespan=lifespan
)

# Enable CORS for development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Request/Response Schemas
class ChatRequest(BaseModel):
    query: str
    model: str = rag_engine.GROQ_MODEL
    top_k: int = 4

class KeysRequest(BaseModel):
    groq_api_key: str
    hf_token: str = ""

@app.post("/api/keys")
async def configure_keys(req: KeysRequest):
    """Saves API keys in-memory for the duration of the server session."""
    DYNAMIC_KEYS["groq_api_key"] = req.groq_api_key.strip()
    DYNAMIC_KEYS["hf_token"] = req.hf_token.strip()
    
    # Return status of configurations
    return {
        "status": "configured",
        "groq_api_key_configured": bool(DYNAMIC_KEYS["groq_api_key"] or os.getenv("GROQ_API_KEY")),
        "hf_token_configured": bool(DYNAMIC_KEYS["hf_token"] or os.getenv("HF_TOKEN"))
    }

@app.get("/api/keys/status")
async def get_keys_status():
    """Checks whether the environment or in-memory settings have valid keys."""
    keys = get_effective_keys()
    return {
        "groq_api_key_configured": bool(keys["groq_api_key"]),
        "hf_token_configured": bool(keys["hf_token"])
    }

@app.post("/api/chat")
async def chat_query(req: ChatRequest):
    """Processes user query, retrieves relevant document chunks, and queries Groq LLM."""
    keys = get_effective_keys()
    if not keys["groq_api_key"]:
        raise HTTPException(
            status_code=400, 
            detail="Groq API Key is missing. Please set it in your environment or via the Terminal Dashboard Settings."
        )
        
    # Perform retrieval
    try:
        retrieved_chunks = rag_engine.hybrid_search(
            req.query, 
            DB_PATH, 
            keys["hf_token"], 
            req.top_k
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retrieval pipeline error: {str(e)}")
        
    if not retrieved_chunks:
        # Fallback response when database is empty
        return {
            "answer": "There are no documents uploaded or indexed in the system yet. Please upload files or ensure samples are loaded.",
            "citations": []
        }
        
    # Query LLM
    try:
        answer = rag_engine.generate_grounded_response(
            req.query, 
            retrieved_chunks, 
            keys["groq_api_key"], 
            req.model
        )
        
        # Clean up data structures to return to the UI for citations
        citations = []
        for i, chunk in enumerate(retrieved_chunks, 1):
            citations.append({
                "index": i,
                "filename": chunk["filename"],
                "content": chunk["content"],
                "score": round(chunk["score"], 4),
                "semantic_score": round(chunk["semantic_score"], 4) if chunk["semantic_score"] is not None else None,
                "keyword_score": round(chunk["keyword_score"], 4)
            })
            
        return {
            "answer": answer,
            "citations": citations
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM synthesis error: {str(e)}")

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """Receives user file, saves to uploads directory, splits text, and indexes chunks."""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.txt', '.pdf', '.md'):
        raise HTTPException(
            status_code=400, 
            detail="Invalid file format. Only PDF (.pdf), Text (.txt), and Markdown (.md) are supported."
        )
        
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
            
        # Re-read file to ingest
        with open(file_path, "rb") as f:
            file_bytes = f.read()
            
        keys = get_effective_keys()
        rag_engine.add_document_to_index(
            file.filename, 
            file_bytes, 
            ext, 
            DB_PATH, 
            keys["hf_token"]
        )
        
        return {"status": "success", "filename": file.filename}
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Document indexing failed: {str(e)}")

@app.get("/api/documents")
async def list_documents():
    """Lists metadata for all currently indexed files."""
    if not os.path.exists(DB_PATH):
        return []
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT filename, file_size, uploaded_at 
        FROM documents 
        ORDER BY uploaded_at DESC
    """)
    rows = cursor.fetchall()
    
    # Count chunks per document
    cursor.execute("SELECT doc_id, COUNT(*) FROM chunks GROUP BY doc_id")
    chunk_counts = dict(cursor.fetchall())
    
    cursor.execute("SELECT filename, id FROM documents")
    doc_ids = dict(cursor.fetchall())
    conn.close()
    
    docs = []
    for filename, size, uploaded_at in rows:
        doc_id = doc_ids.get(filename)
        chunks = chunk_counts.get(doc_id, 0)
        docs.append({
            "filename": filename,
            "file_size": size,
            "uploaded_at": uploaded_at,
            "chunks_count": chunks
        })
    return docs

@app.delete("/api/documents/{name}")
async def delete_document(name: str):
    """Deletes a document and cascades deletion of its text chunks."""
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database not found.")
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM documents WHERE filename = ?", (name,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Document '{name}' not found in database.")
        
    doc_id = row[0]
    cursor.execute("DELETE FROM chunks WHERE doc_id = ?", (doc_id,))
    cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()
    
    # Try deleting actual file from uploads directory if exists
    upload_file_path = os.path.join(UPLOAD_DIR, name)
    if os.path.exists(upload_file_path):
        os.remove(upload_file_path)
        
    return {"status": "success", "message": f"Document '{name}' and its indexed vectors were deleted."}

@app.post("/api/reset")
async def reset_database():
    """Wipes the database tables and upload folders, then re-ingests default stock samples."""
    try:
        # Clear database rows safely (prevents Windows file lock violations)
        if os.path.exists(DB_PATH):
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM chunks")
            cursor.execute("DELETE FROM documents")
            conn.commit()
            conn.close()
            
        # Clean custom uploads folder
        if os.path.exists(UPLOAD_DIR):
            shutil.rmtree(UPLOAD_DIR)
            os.makedirs(UPLOAD_DIR, exist_ok=True)
            
        # Re-ingest the default stock samples
        ingest_samples()
        return {
            "status": "success", 
            "message": "Terminal database successfully reset and default stock reports re-indexed."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database clean reset failed: {str(e)}")


# Serve Frontend static assets
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_landing():
    """Serves the professional landing page."""
    landing_path = os.path.join("static", "index.html")
    if os.path.exists(landing_path):
        return FileResponse(landing_path)
    raise HTTPException(status_code=404, detail="static/index.html not found.")

@app.get("/terminal")
async def read_terminal():
    """Serves the core stock RAG terminal chat interface."""
    terminal_path = os.path.join("static", "terminal.html")
    if os.path.exists(terminal_path):
        return FileResponse(terminal_path)
    raise HTTPException(status_code=404, detail="static/terminal.html not found.")

