# 📊 FinQuery AI: Algorithmic Stock & Financial RAG Terminal

<div align="center">

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![Python 3.14](https://img.shields.io/badge/Python-3.14-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![SQLite3](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Render](https://img.shields.io/badge/Render-46E3B7?style=for-the-badge&logo=render&logoColor=black)](https://render.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**A high-performance, containerized RAG dashboard built to analyze quarterly reports, plot real-time financial metrics, and review weekly candlestick price charts.**

[🌐 Live Production Demo](https://finqueryai.onrender.com/) • [🖥️ GitHub Repository](https://github.com/RutujN/FinQueryAI)

</div>

---

## 📖 Project Overview

**FinQuery AI** is an advanced Retrieval-Augmented Generation (RAG) terminal tailored specifically for investment banking, wealth management, and securities analysis. 

Built from the ground up to be **100% compatible with Python 3.14**, it sidesteps the heavy installation and compile-time overhead of binary database dependencies (e.g. ChromaDB, PyTorch, or FAISS). Instead, it runs a proprietary, multi-stage hybrid search scoring algorithm on a lightweight, built-in SQLite database, making the entire deployment self-contained, fast, and secure.

---

## 🛠️ The Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **API Backend** | `FastAPI` (Python 3.14) | Serves endpoints, routes files, and handles LLM contexts. |
| **Vector Database** | `SQLite3` (`sqlite3`) | Persistent storage of metadata, text slices, and serialized float coordinate vectors. |
| **Semantic Embeddings** | HuggingFace Inference API | Generates 384-dimension vectors using the `all-MiniLM-L6-v2` transformer. |
| **LLM Inference** | Groq Cloud API | Processes grounded prompts via `llama-3.3-70b-versatile` (70B model). |
| **Visual Charts** | `Chart.js` | Plots numeric metrics (currency, margins) extracted from chat responses. |
| **Stock Canvas** | HTML5 Canvas 2D | Renders weekly stock price candlestick charts offline without third-party CDNs. |
| **Frontend UI** | HTML5 / CSS3 / ES6 Javascript | Glassmorphic design with a premium, luxury **Golden Bronze & Warm Stone** palette. |

---

## 📂 Project Directory Structure

```text
Rag_task/
│
├── data/
│   ├── samples/                     # Pre-populated quarterly earnings statements
│   │   ├── apple_q2_2026.txt        # Apple Inc. Q2 2026 earnings & margins
│   │   ├── nvidia_market_outlook_2026.txt # Nvidia platforms & GPU cloud growth
│   │   └── tesla_growth_analysis_2026.txt # Tesla vehicle deliveries & energy storage
│   └── rag_database.db              # SQLite index file (generated at runtime, Git-ignored)
│
├── static/                          # Static web client folders
│   ├── index.html                   # Professional product landing page & RAG blueprint
│   ├── terminal.html                # Main stock analysis dashboard workspace
│   ├── style.css                    # Main dashboard stylesheet (Luxury Stone & Gold)
│   ├── landing-style.css            # Landing page layout & scrolling marquee animations
│   └── app.js                       # Frontend chart engines, local sessions, and API client hooks
│
├── scratch/                         # Verification scripts
│   └── verify_rag.py                # Standalone test runner for SQLite hybrid searches
│
├── main.py                          # Server endpoints & database lifecycles
├── rag_engine.py                    # Text chunking, cosine similarities, & Groq LLM pipelines
├── requirements.txt                 # Application Python package dependencies
├── Dockerfile                       # Production Docker container image config
├── .gitignore                       # File exclusion list for Git repository
├── .env.example                     # Environment template file
└── README.md                        # Project documentation
```

---

## ✨ Key Capabilities & Features

### 🔍 1. Context-Grounded Hybrid Search Engine
We merge vector-space semantic models with keyword lookup matching. The database performs an SQLite sweep scoring each text slice by:
$$\text{Relevance Score} = 0.7 \times \text{Cosine Similarity} + 0.3 \times \text{Keyword Overlap}$$
If HuggingFace embeddings are blocked or rate-limited, the system seamlessly transitions to keyword frequency parsing, maintaining uninterrupted service.

### 📊 2. Dynamic Click-to-Chart Analytics
Any currency statistic (in billions/millions) or percentage in an AI response is wrapped in an interactive element. Clicking it instantly plots it on a side-by-side comparison bar chart in the sliding drawer panel.

### 🕯️ 3. Native Candlestick Stock Charts
Includes a procedural HTML5 Canvas candlestick charting utility. Allows zoom-and-pan inspection of weekly stock price histories (AAPL, NVDA, TSLA) offline with standard green (`#10b981`) bullish indicators.

### 🗄️ 4. Chat Preservation & Markdown Exporter
All chat histories and sessions are preserved in the browser's `localStorage` and can be switched dynamically in the sidebar. Sessions can be compiled and downloaded as clean Markdown logs instantly.

---

## ⚙️ Quick Start Installation

### Prerequisites
* **Python**: Version 3.8 up to 3.14+
* **Groq API Key**: Get a free key at [console.groq.com](https://console.groq.com)
* **HuggingFace Access Token**: Get a read token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

### 1. Clone & Set Up Directory
```bash
git clone https://github.com/RutujN/FinQueryAI.git
cd FinQueryAI
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Set Environment variables
Create a `.env` file in the root directory:
```env
GROQ_API_KEY=gsk_YourActualGroqKeyHere
HF_TOKEN=hf_YourActualHuggingFaceTokenHere
```
*(You can also skip this step and configure keys directly inside the Dashboard UI).*

### 4. Start Server locally
```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

---

## 🐳 Containerized Docker Build
To build and run the application locally inside Docker:
```bash
docker build -t finquery-ai .
docker run -p 8000:8000 --env GROQ_API_KEY="gsk_..." finquery-ai
```

---

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
