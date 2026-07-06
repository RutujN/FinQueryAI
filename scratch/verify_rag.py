import os
import sqlite3
import json
import sys

# Add parent directory to path so we can import rag_engine
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import rag_engine

DB_PATH = os.path.join("data", "rag_database.db")

def test_text_splitting():
    print("Testing text splitter...")
    sample_text = (
        "This is sentence one. This is sentence two. This is sentence three. "
        "Here is a paragraph split.\n\nNow we have a new paragraph. It should be "
        "split nicely, keeping sentences together. Let's make this text long enough "
        "to trigger multiple chunks if we use a small chunk size of 100 characters "
        "with some overlap."
    )
    chunks = rag_engine.split_text(sample_text, chunk_size=120, chunk_overlap=30)
    print(f"Generated {len(chunks)} chunks:")
    for i, c in enumerate(chunks, 1):
        print(f"  Chunk {i}: '{c}'")
    assert len(chunks) > 1, "Should generate multiple chunks!"
    print("Text splitter test passed.\n")

def test_db_setup():
    print(f"Testing database initialization at '{DB_PATH}'...")
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        
    rag_engine.init_db(DB_PATH)
    assert os.path.exists(DB_PATH), "Database file was not created!"
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row[0] for row in cursor.fetchall()}
    assert "documents" in tables, "Documents table is missing!"
    assert "chunks" in tables, "Chunks table is missing!"
    
    conn.close()
    print("Database setup test passed.\n")

def test_local_hybrid_search():
    print("Testing hybrid search (keyword fallback mode)...")
    # Manually insert mock document and chunks
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("INSERT INTO documents (filename, file_size) VALUES ('test_report.txt', 500)")
    doc_id = cursor.lastrowid
    
    # Chunk 1: contains "revenue growth Apple"
    cursor.execute(
        "INSERT INTO chunks (doc_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?)",
        (doc_id, 0, "Apple recorded massive revenue growth in its latest fiscal quarter.", None)
    )
    # Chunk 2: contains "Tesla Gigafactory energy storage"
    cursor.execute(
        "INSERT INTO chunks (doc_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?)",
        (doc_id, 1, "Tesla Megapack deployment in the Lathrop Gigafactory has reached scale.", None)
    )
    
    conn.commit()
    conn.close()
    
    # Query for "Apple revenue"
    results = rag_engine.hybrid_search("Apple revenue", DB_PATH, hf_token=None, top_k=2)
    print(f"Query: 'Apple revenue'")
    for res in results:
        print(f"  Doc: {res['filename']} | Score: {res['score']:.4f} | Content: '{res['content']}'")
        
    assert len(results) > 0, "Should return results!"
    assert "Apple" in results[0]["content"], "First result should contain Apple!"
    print("Local keyword hybrid search test passed.\n")

if __name__ == "__main__":
    print("================================")
    print("RAG System Verification Suite")
    print("================================\n")
    try:
        test_text_splitting()
        test_db_setup()
        test_local_hybrid_search()
        print("All local tests PASSED successfully!")
    except AssertionError as ae:
        print(f"Assertion failed: {ae}")
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        sys.exit(1)
