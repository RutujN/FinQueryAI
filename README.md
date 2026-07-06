# FinQuery AI: Stock & Financial RAG Terminal

FinQuery AI is a lightweight, responsive, and robust Retrieval-Augmented Generation (RAG) terminal tailored for stock market and financial document analysis. 

Built specifically to be **100% compatible with Python 3.14**, it eliminates the compile-time and installation overhead of heavy, binary database packages (such as ChromaDB, PyTorch, or FAISS). Instead, it utilizes built-in `sqlite3` for document index management and calculates vector cosine similarity in pure Python.

---

## Key Features
- **Upload Financial Reports**: Support for PDF (`.pdf`), text (`.txt`), and markdown (`.md`) files.
- **Auto-Ingested Market Data**: Automatically loads pre-populated stock analysis reports for Apple (AAPL), Nvidia (NVDA), and Tesla (TSLA) on startup.
- **Hybrid Search Retrieval**: Combines semantic cosine similarity search (70% weight) with keyword token frequency matching (30% weight) for high retrieval precision.
- **Grounded Responses**: Groq LLM-synthesized answers strictly grounded in the document context.
- **Interactive Citations**: Immediate citation markers (e.g. `[1]`, `[2]`) in chat bubbles. Clicking a badge opens a sliding side-drawer containing the exact snippet of source text matching the score.
- **Premium Terminal Theme**: Sleek dark slate/charcoal aesthetics with ice-blue accents (no purple/green).

---

## Technical Architecture

```
                                  +-----------------------+
                                  |     User Question     |
                                  +-----------+-----------+
                                              |
                                              v
                                   +----------+----------+
                                   |   Web Browser UI    |
                                   +----------+----------+
                                              | (API Request)
                                              v
                                   +----------+----------+
                                   | FastAPI Server      |
                                   +----------+----------+
                                              |
                     +------------------------+------------------------+
                     | (RAG Hybrid Search)                             | (Synthesize LLM Context)
                     v                                                 v
        +------------+------------+                       +------------+------------+
        |   HuggingFace Inference  |                       |   Groq Chat Completion   |
        |   (Embedding Vector)     |                       |   (Llama 3.3 70B Model)  |
        +------------+------------+                       +------------+------------+
                     |                                                 |
                     v                                                 v
        +------------+------------+                       +------------+------------+
        | SQLite DB Cosine Match  |                       | User Grounded Response  |
        |  (Hybrid Similarity)    |                       |    (with Citations)     |
        +-------------------------+                       +-------------------------+
```

1. **Document Ingestion**: PyPDF extracts document content. A boundary-aware text splitter breaks it down into overlapping 800-character chunks.
2. **Embedding Generation**: Text chunks are passed to the HuggingFace Inference API to obtain 384-dimension vectors using the `sentence-transformers/all-MiniLM-L6-v2` model.
3. **Storage**: Vectors (as JSON float arrays) and texts are indexed in `data/rag_database.db`.
4. **Hybrid Search Querying**: The query is embedded, and an SQLite-level sweep is performed, scoring each chunk with $0.7 \times \text{Cosine Similarity} + 0.3 \times \text{Word Overlap}$.
5. **Grounded Generation**: The top matching text snippets are packed into a professional financial system prompt and sent to Groq's API for reasoning.

---

## Prerequisites
- **Python 3.8 to 3.14+**
- **Groq API Key**: Obtain a free key at [console.groq.com](https://console.groq.com)
- **HuggingFace Access Token** (Optional but recommended to avoid rate limits): Obtain a free token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

---

## Setup & Running the Application

### 1. Install Dependencies
Install the required lightweight, pure-python dependencies:
```bash
pip install -r requirements.txt
```

### 2. Configure Environment (Optional)
You can configure your keys directly inside a `.env` file, or enter them in the application UI settings:
```bash
copy .env.example .env
```
Open `.env` and fill in:
```ini
GROQ_API_KEY=gsk_YourActualGroqApiKeyHere
HF_TOKEN=hf_YourActualHuggingFaceTokenHere
```

### 3. Run the Server
Launch the FastAPI server using Uvicorn:
```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 4. Access Dashboard
Open your web browser and navigate to:
```text
http://127.0.0.1:8000
```
If you did not configure your API keys in the `.env` file, click **"Configure API Keys"** in the sidebar, input your keys, and hit **"Save Keys"** to begin analyzing financial reports immediately!
