import os
import io
import re
import time
import json
import sqlite3
import requests
from pypdf import PdfReader

# Default Embedding Model Info
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
HF_API_URL = f"https://api-inference.huggingface.co/models/{EMBEDDING_MODEL}"

# Default LLM Model Info
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

def init_db(db_path: str):
    """Initializes the SQLite tables for documents and chunks."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create documents table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE,
            file_size INTEGER,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create chunks table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id INTEGER,
            chunk_index INTEGER,
            content TEXT,
            embedding TEXT, -- JSON array of floats
            FOREIGN KEY(doc_id) REFERENCES documents(id) ON DELETE CASCADE
        )
    """)
    
    conn.commit()
    conn.close()

def split_text(text: str, chunk_size: int = 800, chunk_overlap: int = 150) -> list[str]:
    """Splits a document text into overlapping chunks, respecting sentence boundaries if possible."""
    if chunk_overlap >= chunk_size:
        chunk_overlap = chunk_size // 2
        
    chunks = []
    start = 0
    text_len = len(text)
    
    while start < text_len:
        end = min(start + chunk_size, text_len)
        
        # Try to align chunk end with sentence or paragraph boundaries
        if end < text_len:
            boundary = -1
            # Search backward in the last 100 characters of the window for a boundary
            for i in range(end, max(start, end - 100), -1):
                if text[i] in ('\n', '.', '?', '!'):
                    boundary = i + 1
                    break
            if boundary != -1:
                end = boundary
                
        chunk = text[start:end].strip()
        if chunk:
            # Clean up extra double spaces or redundant newlines
            chunk = re.sub(r' +', ' ', chunk)
            chunks.append(chunk)
            
        # Move window
        new_start = end - chunk_overlap
        if new_start <= start:
            # Force advance if boundary adjustments cause start not to progress
            start = end
        else:
            start = new_start
            
        if start >= text_len or end >= text_len:
            break
        if start < 0:
            start = 0
            
    return chunks

def get_embedding(text: str, hf_token: str = None) -> list[float]:
    """
    Fetches embedding vector from HuggingFace Inference API.
    Handles rate-limits and cold-starts (loading states) with retry logic.
    """
    # Truncate text to avoid model limits
    text_truncated = text[:2000]
    
    headers = {}
    if hf_token:
        headers["Authorization"] = f"Bearer {hf_token}"
        
    for attempt in range(5):
        try:
            response = requests.post(
                HF_API_URL, 
                headers=headers, 
                json={"inputs": text_truncated}, 
                timeout=20
            )
            
            # Handle loading state
            if response.status_code == 503 or "estimated_time" in response.text:
                res_json = response.json()
                wait_time = res_json.get("estimated_time", 10.0)
                # Cap the sleep to avoid timeouts
                wait_time = min(wait_time, 15.0)
                print(f"HuggingFace model is loading. Waiting {wait_time:.1f}s before retry (attempt {attempt + 1}/5)...")
                time.sleep(wait_time)
                continue
                
            if response.status_code == 200:
                res_json = response.json()
                if isinstance(res_json, list):
                    if len(res_json) > 0 and isinstance(res_json[0], list):
                        return res_json[0]
                    return res_json
                elif isinstance(res_json, dict) and "embedding" in res_json:
                    return res_json["embedding"]
                else:
                    raise ValueError(f"Unrecognized response shape: {res_json}")
            else:
                raise Exception(f"HF API returned status {response.status_code}: {response.text}")
                
        except Exception as e:
            # Check for DNS resolution or connection errors to fail fast when offline
            err_str = str(e).lower()
            if "getaddrinfo" in err_str or "nameresolutionerror" in err_str or "connectionerror" in err_str:
                print("HuggingFace API domain could not be resolved (offline or sandbox mode). Bypassing embedding retries.")
                raise e
            if attempt == 4:
                raise e
            time.sleep(2)
            
    raise Exception("Hugging Face API timed out or model failed to load after 5 attempts.")

def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    """Computes cosine similarity between two float vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    mag1 = sum(a * a for a in v1) ** 0.5
    mag2 = sum(b * b for b in v2) ** 0.5
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot / (mag1 * mag2)

def add_document_to_index(filename: str, file_bytes: bytes, file_extension: str, db_path: str, hf_token: str = None):
    """Parses text/PDF content, creates document & chunks, and indexes them in SQLite."""
    text = ""
    
    if file_extension.lower() == '.pdf':
        pdf = PdfReader(io.BytesIO(file_bytes))
        text_list = []
        for i, page in enumerate(pdf.pages):
            page_text = page.extract_text()
            if page_text:
                text_list.append(f"--- Page {i+1} ---\n{page_text}")
        text = "\n".join(text_list)
    else:
        # Assume text/markdown
        text = file_bytes.decode('utf-8', errors='ignore')
        
    if not text.strip():
        raise ValueError("The uploaded document contains no readable text content.")
        
    # Split document
    chunks = split_text(text)
    if not chunks:
        raise ValueError("Could not extract any chunks from the document text.")
        
    # 1. Fetch embeddings for all chunks BEFORE opening the SQLite connection
    chunks_data = []
    for i, chunk_text in enumerate(chunks):
        embedding_str = None
        try:
            emb = get_embedding(chunk_text, hf_token)
            embedding_str = json.dumps(emb)
        except Exception as e:
            print(f"Warning: Failed to fetch embedding for chunk {i} of '{filename}': {e}. Falling back to keyword search indexing.")
        
        chunks_data.append((i, chunk_text, embedding_str))
        
    # 2. Write to SQLite in a quick, single transaction
    conn = sqlite3.connect(db_path, timeout=30.0)
    cursor = conn.cursor()
    
    try:
        # If file exists, overwrite (cascade delete old chunks)
        cursor.execute("SELECT id FROM documents WHERE filename = ?", (filename,))
        row = cursor.fetchone()
        if row:
            doc_id = row[0]
            cursor.execute("DELETE FROM chunks WHERE doc_id = ?", (doc_id,))
            cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
            
        # Insert new document metadata
        cursor.execute("INSERT INTO documents (filename, file_size) VALUES (?, ?)", (filename, len(file_bytes)))
        doc_id = cursor.lastrowid
        
        # Insert all chunks
        for idx, chunk_text, embedding_str in chunks_data:
            cursor.execute("""
                INSERT INTO chunks (doc_id, chunk_index, content, embedding)
                VALUES (?, ?, ?, ?)
            """, (doc_id, idx, chunk_text, embedding_str))
            
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def hybrid_search(query: str, db_path: str, hf_token: str = None, top_k: int = 4) -> list[dict]:
    """
    Executes hybrid search across all chunks:
    1. Semantic Similarity using cosine similarity of query/chunk embeddings (70% weight).
    2. Keyword overlap frequency score (30% weight).
    """
    # 1. Fetch query embedding
    query_emb = None
    try:
        query_emb = get_embedding(query, hf_token)
    except Exception as e:
        print(f"Skipping semantic search: Embedding generation failed: {e}")
        
    # 2. Retrieve all documents and chunks from DB
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.id, c.content, c.embedding, c.chunk_index, d.filename 
        FROM chunks c
        JOIN documents d ON c.doc_id = d.id
    """)
    rows = cursor.fetchall()
    conn.close()
    
    # 3. Score chunks
    results = []
    # Normalize query term tokens
    query_terms = set(re.findall(r'\w+', query.lower()))
    
    for chunk_id, content, emb_str, idx, filename in rows:
        # A. Keyword matching score
        chunk_terms = re.findall(r'\w+', content.lower())
        term_count = len(chunk_terms)
        keyword_score = 0.0
        if query_terms and term_count > 0:
            overlap = sum(1 for term in query_terms if term in chunk_terms)
            keyword_score = overlap / len(query_terms)
            
        # B. Semantic matching score
        semantic_score = 0.0
        has_semantic = False
        if query_emb and emb_str:
            try:
                emb = json.loads(emb_str)
                semantic_score = cosine_similarity(query_emb, emb)
                has_semantic = True
            except Exception as e:
                print(f"Failed parsing chunk embedding {chunk_id}: {e}")
                
        # C. Combined scoring (weights: 0.7 Semantic, 0.3 Keyword)
        if has_semantic:
            # Shift cosine similarity from [-1, 1] to [0, 1] for scaling with keyword score
            norm_semantic = (semantic_score + 1.0) / 2.0
            hybrid_score = 0.7 * norm_semantic + 0.3 * keyword_score
        else:
            hybrid_score = keyword_score
            
        results.append({
            "chunk_id": chunk_id,
            "content": content,
            "filename": filename,
            "chunk_index": idx,
            "score": hybrid_score,
            "semantic_score": semantic_score if has_semantic else None,
            "keyword_score": keyword_score
        })
        
    # 4. Rank results descending
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]

def generate_grounded_response(
    query: str, 
    context_chunks: list[dict], 
    groq_key: str, 
    model: str = GROQ_MODEL
) -> str:
    """Invokes Groq API to synthesize a response grounded in retrieved chunks, including citations."""
    if not groq_key:
        raise ValueError("Groq API Key is not set or provided.")
        
    # Build prompt structure
    context_str = ""
    for i, chunk in enumerate(context_chunks, 1):
        context_str += f"--- CONTEXT DOCUMENT [{i}] (Source: {chunk['filename']}) ---\n{chunk['content']}\n\n"
        
    system_prompt = (
        "You are an advanced financial analyst advisor. Your goal is to answer the user's query "
        "using ONLY the information provided in the Context Documents. Do NOT make up facts.\n"
        "Citation Guidelines:\n"
        "- Every single claim or data point you fetch from a document MUST be immediately followed by a citation badge "
        "like [1], [2], corresponding to the index of the Context Document it came from.\n"
        "- You may group citations if needed (e.g. [1, 3] or [2]).\n"
        "- If multiple parts of your answer refer to the same document, include the citation after each point.\n"
        "Formatting:\n"
        "- Use bullet points, bold key stats, and standard markdown tables where it helps legibility.\n"
        "- Do not use green or purple styling descriptions in text.\n"
        "Constraint:\n"
        "- If the context documents do not contain enough details to fully answer the query, state exactly: "
        "'Based on the uploaded documents, I do not have enough information to answer that completely.' "
        "Then present whatever partial facts are available in the context."
    )
    
    user_prompt = f"Here is the context data:\n\n{context_str}\nUser Question: {query}\n\nAnswer:"
    
    headers = {
        "Authorization": f"Bearer {groq_key}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.2
    }
    
    response = requests.post(GROQ_API_URL, headers=headers, json=data, timeout=30)
    
    if response.status_code == 200:
        res_json = response.json()
        return res_json["choices"][0]["message"]["content"]
    else:
        raise Exception(f"Groq API returned an error ({response.status_code}): {response.text}")
