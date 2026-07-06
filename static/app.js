// FinQuery RAG Dashboard Logic
document.addEventListener("DOMContentLoaded", () => {
    // API States & Data Storage
    let activeMessageCitations = {}; // Maps messageId -> citations array
    let messageCounter = 0;
    
    // Chat Sessions (History Preservation)
    let chatSessions = []; // Array of { id, title, messages: [] }
    let activeSessionId = null;

    // Chart.js State (Plotted Numbers)
    let myChart = null;
    let chartDataPoints = []; // List of { label, value }

    // DOM Elements
    const groqStatus = document.getElementById("groq-status");
    const hfStatus = document.getElementById("hf-status");
    const toggleKeysBtn = document.getElementById("toggle-keys-btn");
    const keysPanel = document.getElementById("keys-panel");
    const groqKeyInput = document.getElementById("groq-key-input");
    const hfTokenInput = document.getElementById("hf-token-input");
    const saveKeysBtn = document.getElementById("save-keys-btn");

    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");
    const docList = document.getElementById("doc-list");
    const docCount = document.getElementById("doc-count");

    const modelSelector = document.getElementById("model-selector");
    const chatViewport = document.getElementById("chat-viewport");
    const chatForm = document.getElementById("chat-form");
    const chatInput = document.getElementById("chat-input");
    const chatLoader = document.getElementById("chat-loader");
    const sendBtn = document.getElementById("send-btn");

    const citationDrawer = document.getElementById("citation-drawer");
    const closeDrawerBtn = document.getElementById("close-drawer-btn");
    const toggleDrawerBtn = document.getElementById("toggle-drawer-btn");
    
    // Citations Tab Elements
    const citationFilename = document.getElementById("citation-filename");
    const citationIndex = document.getElementById("citation-index");
    const citationScore = document.getElementById("citation-score");
    const citationSemantic = document.getElementById("citation-semantic");
    const citationKeyword = document.getElementById("citation-keyword");
    const citationText = document.getElementById("citation-text");

    // Drawer Tabs
    const tabCitationsBtn = document.getElementById("tab-citations-btn");
    const tabChartBtn = document.getElementById("tab-chart-btn");
    const tabMarketBtn = document.getElementById("tab-market-btn");
    const tabCompareBtn = document.getElementById("tab-compare-btn");

    const tabContentCitations = document.getElementById("tab-content-citations");
    const tabContentChart = document.getElementById("tab-content-chart");
    const tabContentMarket = document.getElementById("tab-content-market");
    const tabContentCompare = document.getElementById("tab-content-compare");
    
    const clearChartBtn = document.getElementById("clear-chart-btn");
    const chartDataList = document.getElementById("chart-data-list");

    // Chat Sessions Elements
    const newChatBtn = document.getElementById("new-chat-btn");
    const exportChatBtn = document.getElementById("export-chat-btn");
    const chatsHistoryList = document.getElementById("chats-history-list");

    // Left Sidebar Interactive Widgets
    const resetDbBtn = document.getElementById("reset-db-btn");
    const statDocCount = document.getElementById("stat-doc-count");
    const docSearchInput = document.getElementById("doc-search-input");
    const marketTickerSelect = document.getElementById("market-ticker-select");

    // Initialize Page
    checkKeysStatus();
    loadDocuments();
    initChatSessions();
    setupWatchlistClicks();
    startWatchlistTicks();
    setupFiltersAndExporters();

    // 1. Drawer Toggle & Tab Switching Logic
    toggleDrawerBtn.addEventListener("click", () => {
        citationDrawer.classList.toggle("drawer-collapsed");
    });

    closeDrawerBtn.addEventListener("click", () => {
        citationDrawer.classList.add("drawer-collapsed");
    });

    tabCitationsBtn.addEventListener("click", () => switchTab("citations"));
    tabChartBtn.addEventListener("click", () => switchTab("chart"));
    tabMarketBtn.addEventListener("click", () => switchTab("market"));
    tabCompareBtn.addEventListener("click", () => switchTab("compare"));

    function switchTab(tabName) {
        tabCitationsBtn.classList.remove("active");
        tabChartBtn.classList.remove("active");
        tabMarketBtn.classList.remove("active");
        tabCompareBtn.classList.remove("active");
        
        tabContentCitations.classList.add("hidden");
        tabContentChart.classList.add("hidden");
        tabContentMarket.classList.add("hidden");
        tabContentCompare.classList.add("hidden");

        if (tabName === "citations") {
            tabCitationsBtn.classList.add("active");
            tabContentCitations.classList.remove("hidden");
        } else if (tabName === "chart") {
            tabChartBtn.classList.add("active");
            tabContentChart.classList.remove("hidden");
            if (myChart) {
                myChart.resize();
            }
        } else if (tabName === "market") {
            tabMarketBtn.classList.add("active");
            tabContentMarket.classList.remove("hidden");
            setTimeout(() => {
                renderCandlestickChart(marketTickerSelect.value);
            }, 50);
        } else if (tabName === "compare") {
            tabCompareBtn.classList.add("active");
            tabContentCompare.classList.remove("hidden");
        }
    }

    // 2. Chat History (Session Management) Logic
    function initChatSessions() {
        const saved = localStorage.getItem("finquery_sessions");
        if (saved) {
            try {
                chatSessions = JSON.parse(saved);
            } catch (e) {
                chatSessions = [];
            }
        }

        if (chatSessions.length === 0) {
            createNewSession(true);
        } else {
            activeSessionId = chatSessions[0].id;
            renderSessionsList();
            loadActiveSessionMessages();
        }
    }

    newChatBtn.addEventListener("click", () => {
        createNewSession(false);
    });

    function createNewSession(isDefault = false) {
        const id = "session_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        const newSession = {
            id: id,
            title: isDefault ? "New Stock Chat" : `Stock Query #${chatSessions.length + 1}`,
            messages: []
        };
        chatSessions.unshift(newSession);
        activeSessionId = id;
        
        saveSessions();
        renderSessionsList();
        loadActiveSessionMessages();
    }

    function saveSessions() {
        localStorage.setItem("finquery_sessions", JSON.stringify(chatSessions));
    }

    function renderSessionsList() {
        if (chatSessions.length === 0) {
            chatsHistoryList.innerHTML = `<div class="empty-docs" style="padding:0.6rem; font-size:0.75rem; text-align:center;">No saved chats.</div>`;
            return;
        }

        chatsHistoryList.innerHTML = chatSessions.map(session => {
            const activeClass = session.id === activeSessionId ? "active" : "";
            return `
                <div class="chat-session-item ${activeClass}" data-session-id="${session.id}">
                    <span class="chat-session-name" title="${session.title}">${session.title}</span>
                    <button class="chat-session-delete" data-session-id="${session.id}" title="Delete session">&times;</button>
                </div>
            `;
        }).join("");

        chatsHistoryList.querySelectorAll(".chat-session-item").forEach(item => {
            item.addEventListener("click", (e) => {
                if (e.target.classList.contains("chat-session-delete")) return;
                const sessionId = item.getAttribute("data-session-id");
                if (sessionId !== activeSessionId) {
                    activeSessionId = sessionId;
                    renderSessionsList();
                    loadActiveSessionMessages();
                }
            });
        });

        chatsHistoryList.querySelectorAll(".chat-session-delete").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-session-id");
                deleteSession(id);
            });
        });
    }

    function deleteSession(id) {
        chatSessions = chatSessions.filter(s => s.id !== id);
        saveSessions();
        
        if (activeSessionId === id) {
            if (chatSessions.length > 0) {
                activeSessionId = chatSessions[0].id;
            } else {
                createNewSession(true);
                return;
            }
        }
        renderSessionsList();
        loadActiveSessionMessages();
    }

    function loadActiveSessionMessages() {
        chatViewport.innerHTML = "";
        const activeSession = chatSessions.find(s => s.id === activeSessionId);
        if (!activeSession) return;

        if (activeSession.messages.length === 0) {
            renderSystemWelcome();
            return;
        }

        activeSession.messages.forEach(msg => {
            const msgId = msg.sender === "ai" ? `ai-msg-${messageCounter++}` : null;
            if (msgId && msg.citations) {
                activeMessageCitations[msgId] = msg.citations;
            }
            appendMessageUI(msg.sender, msg.text, msgId, false);
        });
        chatViewport.scrollTop = chatViewport.scrollHeight;
    }

    function renderSystemWelcome() {
        chatViewport.innerHTML = `
            <div class="message system-message">
                <div class="message-avatar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                </div>
                <div class="message-content">
                    <p><strong>System Initialized.</strong></p>
                    <p>Welcome to <strong>FinQuery Stock & Financial RAG Terminal</strong>.</p>
                    <p>I have preloaded market outlook analyses and Q2 2026 reports for <strong>Apple (AAPL)</strong>, <strong>Nvidia (NVDA)</strong>, and <strong>Tesla (TSLA)</strong>. Ask me anything about revenues, profit margins, GPU backlogs, or energy storage deployments.</p>
                    <p>You can also upload your own documents or delete indexed files from the sidebar.</p>
                </div>
            </div>
        `;
    }

    // 3. API Keys Management
    toggleKeysBtn.addEventListener("click", () => {
        keysPanel.classList.toggle("hidden");
    });

    saveKeysBtn.addEventListener("click", async () => {
        const groqKey = groqKeyInput.value.trim();
        const hfToken = hfTokenInput.value.trim();

        if (!groqKey) {
            alert("Groq API Key is required to chat.");
            return;
        }

        try {
            saveKeysBtn.disabled = true;
            saveKeysBtn.textContent = "Saving...";
            
            const response = await fetch("/api/keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    groq_api_key: groqKey,
                    hf_token: hfToken
                })
            });

            if (response.ok) {
                const data = await response.json();
                updateKeysUI(data.groq_api_key_configured, data.hf_token_configured);
                keysPanel.classList.add("hidden");
                groqKeyInput.value = "";
                hfTokenInput.value = "";
                loadDocuments();
            } else {
                alert("Failed to save keys.");
            }
        } catch (err) {
            console.error(err);
            alert("Error saving API keys.");
        } finally {
            saveKeysBtn.disabled = false;
            saveKeysBtn.textContent = "Save Keys";
        }
    });

    async function checkKeysStatus() {
        try {
            const response = await fetch("/api/keys/status");
            if (response.ok) {
                const data = await response.json();
                updateKeysUI(data.groq_api_key_configured, data.hf_token_configured);
            }
        } catch (err) {
            console.error("Error checking key status:", err);
        }
    }

    function updateKeysUI(groqConfigured, hfConfigured) {
        if (groqConfigured) {
            groqStatus.textContent = "Ready";
            groqStatus.className = "status-badge status-configured";
        } else {
            groqStatus.textContent = "Missing";
            groqStatus.className = "status-badge status-missing";
        }

        if (hfConfigured) {
            hfStatus.textContent = "Enabled";
            hfStatus.className = "status-badge status-configured";
        } else {
            hfStatus.textContent = "Missing";
            hfStatus.className = "status-badge status-missing";
        }
    }

    // 4. Document Library Management
    async function loadDocuments() {
        try {
            const response = await fetch("/api/documents");
            if (response.ok) {
                const docs = await response.json();
                renderDocumentList(docs);
                
                if (statDocCount) {
                    statDocCount.textContent = `${docs.length} docs`;
                }
            }
        } catch (err) {
            console.error("Error loading documents:", err);
        }
    }

    function renderDocumentList(docs) {
        docCount.textContent = docs.length;
        if (docs.length === 0) {
            docList.innerHTML = `<div class="empty-docs">No documents uploaded yet.</div>`;
            return;
        }

        docList.innerHTML = docs.map(doc => {
            const sizeKB = (doc.file_size / 1024).toFixed(1);
            return `
                <div class="doc-item">
                    <div class="doc-info">
                        <span class="doc-name" title="${doc.filename}">${doc.filename}</span>
                        <span class="doc-meta">${sizeKB} KB • ${doc.chunks_count} chunks</span>
                    </div>
                    <button class="doc-delete-btn" data-filename="${doc.filename}" title="Delete document">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;
        }).join("");

        docList.querySelectorAll(".doc-delete-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const filename = btn.getAttribute("data-filename");
                if (confirm(`Are you sure you want to delete and unindex "${filename}"?`)) {
                    await deleteDocument(filename);
                }
            });
        });
    }

    async function deleteDocument(filename) {
        try {
            const response = await fetch(`/api/documents/${encodeURIComponent(filename)}`, {
                method: "DELETE"
            });
            if (response.ok) {
                loadDocuments();
            } else {
                const errData = await response.json();
                alert(`Failed to delete document: ${errData.detail}`);
            }
        } catch (err) {
            console.error("Error deleting document:", err);
            alert("Error deleting document.");
        }
    }

    // 5. Drag and Drop File Ingestion
    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
        }
    });

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append("file", file);

        const uploadBoxOriginalHTML = dropZone.innerHTML;
        dropZone.innerHTML = `
            <div class="terminal-spinner" style="margin: 0 auto 0.5rem auto;"></div>
            <p>Uploading & indexing...</p>
        `;
        dropZone.style.pointerEvents = "none";

        try {
            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });

            if (response.ok) {
                await loadDocuments();
            } else {
                const errData = await response.json();
                alert(`Upload failed: ${errData.detail}`);
            }
        } catch (err) {
            console.error("Upload error:", err);
            alert("Error uploading file.");
        } finally {
            dropZone.innerHTML = uploadBoxOriginalHTML;
            dropZone.style.pointerEvents = "auto";
            fileInput.value = "";
        }
    }

    // 6. RAG Query Form Submission
    chatForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const queryText = chatInput.value.trim();
        if (!queryText) return;

        renameSessionIfNeeded(queryText);
        appendMessage("user", queryText);
        chatInput.value = "";
        
        chatLoader.classList.remove("hidden");
        chatViewport.scrollTop = chatViewport.scrollHeight;
        setFormDisabled(true);

        try {
            const modelVal = modelSelector.value;
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: queryText,
                    model: modelVal,
                    top_k: 4
                })
            });

            if (response.ok) {
                const data = await response.json();
                const msgId = `ai-msg-${messageCounter++}`;
                activeMessageCitations[msgId] = data.citations || [];
                appendMessage("ai", data.answer, msgId, data.citations);

                detectTickerInQuery(queryText);
            } else {
                const errData = await response.json();
                appendMessage("ai", `**Error (${response.status}):** ${errData.detail || "Something went wrong."}`);
            }
        } catch (err) {
            console.error("Chat error:", err);
            appendMessage("ai", `**System Error:** Could not contact the server.`);
        } finally {
            chatLoader.classList.add("hidden");
            chatViewport.scrollTop = chatViewport.scrollHeight;
            setFormDisabled(false);
        }
    });

    function renameSessionIfNeeded(queryText) {
        const activeSession = chatSessions.find(s => s.id === activeSessionId);
        if (activeSession && activeSession.messages.length === 0) {
            const words = queryText.split(/\s+/).slice(0, 4).join(" ");
            activeSession.title = words + (queryText.split(/\s+/).length > 4 ? "..." : "");
            saveSessions();
            renderSessionsList();
        }
    }

    function detectTickerInQuery(queryText) {
        const lower = queryText.toLowerCase();
        let ticker = "";
        if (lower.includes("apple") || lower.includes("aapl")) {
            ticker = "AAPL";
        } else if (lower.includes("nvidia") || lower.includes("nvda")) {
            ticker = "NVDA";
        } else if (lower.includes("tesla") || lower.includes("tsla")) {
            ticker = "TSLA";
        }

        if (ticker) {
            marketTickerSelect.value = ticker;
            citationDrawer.classList.remove("drawer-collapsed");
            switchTab("market");
        }
    }

    function setFormDisabled(disabled) {
        chatInput.disabled = disabled;
        sendBtn.disabled = disabled;
        modelSelector.disabled = disabled;
    }

    function appendMessage(sender, text, msgId = null, citations = null) {
        const activeSession = chatSessions.find(s => s.id === activeSessionId);
        if (activeSession) {
            activeSession.messages.push({
                sender: sender,
                text: text,
                citations: citations
            });
            saveSessions();
        }
        appendMessageUI(sender, text, msgId, true);
    }

    function appendMessageUI(sender, text, msgId = null, runAnimation = true) {
        const messageDiv = document.createElement("div");
        messageDiv.className = `message ${sender}-message`;
        if (msgId) {
            messageDiv.setAttribute("id", msgId);
        }
        if (!runAnimation) {
            messageDiv.style.animation = "none";
        }

        const avatarDiv = document.createElement("div");
        avatarDiv.className = "message-avatar";
        if (sender === "user") {
            avatarDiv.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
        } else {
            avatarDiv.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
        }

        const contentDiv = document.createElement("div");
        contentDiv.className = "message-content";

        if (sender === "ai") {
            contentDiv.innerHTML = formatAIResponse(text, msgId);
        } else {
            const p = document.createElement("p");
            p.textContent = text;
            contentDiv.appendChild(p);
        }

        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);
        chatViewport.appendChild(messageDiv);

        if (sender === "ai" && msgId) {
            contentDiv.querySelectorAll(".citation-link").forEach(link => {
                link.addEventListener("click", (e) => {
                    e.preventDefault();
                    const index = parseInt(link.getAttribute("data-citation-idx"));
                    showCitationDetails(msgId, index);
                });
            });

            contentDiv.querySelectorAll(".chartable-number").forEach(numEl => {
                numEl.addEventListener("click", (e) => {
                    e.preventDefault();
                    plotNumber(numEl);
                });
            });
        }
    }

    function formatAIResponse(text, msgId) {
        let html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        let paragraphs = html.split(/\n\n+/);
        paragraphs = paragraphs.map(p => {
            let processed = p.trim();
            if (!processed) return "";
            
            processed = processed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

            if (msgId) {
                // Match single or grouped comma-separated indices, e.g. [1] or [1, 2, 3]
                processed = processed.replace(/\[([\d\s,]+)\]/g, (match, content) => {
                    const parts = content.split(/[\s,]+/).filter(x => x.trim() !== "");
                    return parts.map(num => {
                        return `<span class="citation-link" data-citation-idx="${num}">[${num}]</span>`;
                    }).join(" ");
                });
            }

            processed = processed.replace(/(\b\d+(?:\.\d+)?%)/g, (match) => {
                let rawVal = parseFloat(match.replace(/%/g, ""));
                return `<span class="chartable-number" data-value="${rawVal}" title="Click to plot percentage">${match}</span>`;
            });

            processed = processed.replace(/(\$\d+(?:\.\d+)?\s*(?:billion|million|b|m)?\b)/gi, (match) => {
                let clean = match.replace(/[$,]/g, "").trim().toLowerCase();
                let val = parseFloat(clean);
                let multiplier = 1.0;
                
                if (clean.includes("billion") || clean.endsWith("b")) {
                    multiplier = 1.0;
                } else if (clean.includes("million") || clean.endsWith("m")) {
                    multiplier = 0.001;
                }
                
                let parsedVal = val * multiplier;
                if (!isNaN(parsedVal)) {
                    return `<span class="chartable-number" data-value="${parsedVal.toFixed(3)}" title="Click to plot currency (in Billions)">${match}</span>`;
                }
                return match;
            });

            if (processed.startsWith("- ") || processed.startsWith("* ")) {
                let items = processed.split(/\n[-*] /);
                items[0] = items[0].replace(/^[-*] /, "");
                return "<ul>" + items.map(item => `<li>${item}</li>`).join("") + "</ul>";
            }
            
            return `<p>${processed}</p>`;
        });

        return paragraphs.join("");
    }

    // 7. Sliding Citation Drawer logic
    function showCitationDetails(msgId, citationIndexNum) {
        const citations = activeMessageCitations[msgId];
        if (!citations) return;

        const match = citations.find(c => c.index === citationIndexNum);
        if (!match) return;

        citationFilename.textContent = match.filename;
        citationIndex.textContent = match.chunk_index;
        citationScore.textContent = `${(match.score * 100).toFixed(1)}%`;
        
        if (match.semantic_score !== null) {
            citationSemantic.textContent = `${(match.semantic_score * 100).toFixed(1)}%`;
        } else {
            citationSemantic.textContent = "N/A (Keyword Fallback)";
        }
        
        citationKeyword.textContent = `${(match.keyword_score * 100).toFixed(0)}%`;
        citationText.textContent = match.content;

        citationDrawer.classList.remove("drawer-collapsed");
        switchTab("citations");
    }

    // 8. Custom Plotted Chart Engine (Chart.js)
    function plotNumber(numEl) {
        const value = parseFloat(numEl.getAttribute("data-value"));
        const text = numEl.innerText;
        
        const parentText = numEl.parentElement ? numEl.parentElement.innerText : "";
        const textParts = parentText.split(text);
        const textBefore = textParts[0] || "";
        const words = textBefore.trim().split(/\s+/);
        
        let contextLabel = words.slice(-3).join(" ") || "Statistic";
        contextLabel = contextLabel.replace(/[.,:;()]/g, "").trim();
        
        const finalLabel = `${contextLabel} (${text})`;
        
        if (chartDataPoints.some(pt => pt.label === finalLabel)) {
            alert(`"${finalLabel}" is already plotted.`);
            return;
        }

        chartDataPoints.push({ label: finalLabel, value: value });
        
        citationDrawer.classList.remove("drawer-collapsed");
        switchTab("chart");
        updateChart();
    }

    function updateChart() {
        const ctx = document.getElementById("analytics-chart").getContext("2d");
        const labels = chartDataPoints.map(p => p.label);
        const data = chartDataPoints.map(p => p.value);
        
        if (myChart) {
            myChart.destroy();
        }
        
        myChart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [{
                    label: "Data Point (Scale: Currencies in Billions, % raw)",
                    data: data,
                    backgroundColor: "rgba(217, 119, 6, 0.4)", // Premium Golden Amber theme
                    borderColor: "#d97706",
                    borderWidth: 1.5,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        grid: { color: "#44403c" },
                        ticks: { color: "#fafaf9" }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: "#fafaf9",
                            callback: function(valIndex) {
                                const label = this.getLabelForValue(valIndex);
                                return label.length > 15 ? label.substring(0, 12) + "..." : label;
                            }
                        }
                    }
                }
            }
        });
        
        renderChartDataPointsList();
    }

    function renderChartDataPointsList() {
        if (chartDataPoints.length === 0) {
            chartDataList.innerHTML = `<div class="empty-docs" style="padding:1rem; font-size:0.75rem;">No data points plotted yet.</div>`;
            return;
        }
        
        chartDataList.innerHTML = chartDataPoints.map((pt, idx) => {
            return `
                <div class="chart-data-item">
                    <span class="chart-data-label" title="${pt.label}">${pt.label}</span>
                    <div class="chart-data-val-group">
                        <span class="chart-data-value">${pt.value}</span>
                        <button class="chart-data-remove-btn" data-index="${idx}">&times;</button>
                    </div>
                </div>
            `;
        }).join("");
        
        chartDataList.querySelectorAll(".chart-data-remove-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.getAttribute("data-index"));
                chartDataPoints.splice(idx, 1);
                updateChart();
            });
        });
    }

    clearChartBtn.addEventListener("click", () => {
        chartDataPoints = [];
        updateChart();
    });

    // 9. Candlestick Chart Engine (Custom HTML5 Canvas Renderer)
    marketTickerSelect.addEventListener("change", (e) => {
        renderCandlestickChart(e.target.value);
    });

    function renderCandlestickChart(ticker) {
        const canvas = document.getElementById("candlestick-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width || 360;
        canvas.height = rect.height || 270;
        
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.fillStyle = "#0c0a09"; // Stone 950 dark background
        ctx.fillRect(0, 0, width, height);
        
        const data = getMockCandlestickData(ticker);
        if (data.length === 0) return;
        
        const prices = data.flatMap(d => [d.open, d.close, d.high, d.low]);
        const minPrice = Math.min(...prices) * 0.98;
        const maxPrice = Math.max(...prices) * 1.02;
        const priceRange = maxPrice - minPrice;
        
        const paddingLeft = 10;
        const paddingRight = 45;
        const paddingTop = 15;
        const paddingBottom = 20;
        
        const chartWidth = width - paddingLeft - paddingRight;
        const chartHeight = height - paddingTop - paddingBottom;
        
        ctx.strokeStyle = "#44403c";
        ctx.lineWidth = 1;
        
        for (let i = 1; i < 4; i++) {
            const y = paddingTop + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(paddingLeft + chartWidth, y);
            ctx.stroke();
            
            const priceVal = maxPrice - (priceRange / 4) * i;
            ctx.fillStyle = "#d6d3d1";
            ctx.font = "9px JetBrains Mono, monospace";
            ctx.fillText(priceVal.toFixed(1), width - 38, y + 3);
        }
        
        const candleWidth = chartWidth / data.length;
        const barWidth = Math.max(candleWidth * 0.65, 2.5);
        
        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const x = paddingLeft + i * candleWidth + candleWidth / 2;
            
            const valToY = (val) => {
                return paddingTop + chartHeight - ((val - minPrice) / priceRange) * chartHeight;
            };
            
            const yHigh = valToY(d.high);
            const yLow = valToY(d.low);
            const yOpen = valToY(d.open);
            const yClose = valToY(d.close);
            
            const isUp = d.close >= d.open;
            const activeColor = isUp ? "#10b981" : "#ef4444"; // Emerald Green for bullish, Red for bearish
            
            ctx.strokeStyle = activeColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, yHigh);
            ctx.lineTo(x, yLow);
            ctx.stroke();
            
            ctx.fillStyle = activeColor;
            const bodyY = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1.5);
            ctx.fillRect(x - barWidth / 2, bodyY, barWidth, bodyHeight);
        }
        
        // Draw Ticker Badge in Amber Gold Theme
        ctx.fillStyle = "rgba(217, 119, 6, 0.1)";
        ctx.fillRect(10, 10, 42, 16);
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 1;
        ctx.strokeRect(10, 10, 42, 16);
        ctx.fillStyle = "#d97706";
        ctx.font = "bold 9px JetBrains Mono, monospace";
        ctx.fillText(ticker, 16, 21);
    }

    function getMockCandlestickData(ticker) {
        let data = [];
        let curPrice = 100;
        let weeklyTrend = 0;

        if (ticker === 'AAPL') {
            curPrice = 172.5;
            weeklyTrend = 0.65;
        } else if (ticker === 'NVDA') {
            curPrice = 82.3;
            weeklyTrend = 1.6;
        } else if (ticker === 'TSLA') {
            curPrice = 222.0;
            weeklyTrend = -0.7;
        }

        const dates = [
            "2026-01-02", "2026-01-09", "2026-01-16", "2026-01-23", "2026-01-30",
            "2026-02-06", "2026-02-13", "2026-02-20", "2026-02-27", "2026-03-06",
            "2026-03-13", "2026-03-20", "2026-03-27", "2026-04-03", "2026-04-10",
            "2026-04-17", "2026-04-24", "2026-05-01", "2026-05-08", "2026-05-15",
            "2026-05-22", "2026-05-29", "2026-06-05", "2026-06-12", "2026-06-19",
            "2026-06-26"
        ];

        for (let i = 0; i < dates.length; i++) {
            let volatility = curPrice * 0.04;
            let change = (Math.random() - 0.44) * volatility + weeklyTrend;
            
            let open = curPrice;
            let close = curPrice + change;
            let high = Math.max(open, close) + Math.random() * (volatility * 0.3);
            let low = Math.min(open, close) - Math.random() * (volatility * 0.3);

            data.push({
                time: dates[i],
                open: parseFloat(open.toFixed(2)),
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                close: parseFloat(close.toFixed(2))
            });
            curPrice = close;
        }
        return data;
    }

    // 10. Watchlist clicks route to Candlestick Chart
    function setupWatchlistClicks() {
        ["AAPL", "NVDA", "TSLA"].forEach(ticker => {
            const item = document.getElementById(`watchlist-${ticker.toLowerCase()}`);
            if (item) {
                item.addEventListener("click", () => {
                    document.querySelectorAll(".watchlist-item").forEach(w => w.classList.remove("active"));
                    item.classList.add("active");

                    marketTickerSelect.value = ticker;
                    citationDrawer.classList.remove("drawer-collapsed");
                    switchTab("market");
                });
            }
        });
    }

    // 11. Live stock ticker feed simulator
    function startWatchlistTicks() {
        setInterval(() => {
            ["AAPL", "NVDA", "TSLA"].forEach(ticker => {
                const priceEl = document.getElementById(`price-${ticker}`);
                const changeEl = document.getElementById(`change-${ticker}`);
                if (!priceEl || !changeEl) return;
                
                let currentPrice = parseFloat(priceEl.textContent.replace("$", ""));
                let percentVal = parseFloat(changeEl.textContent.replace("%", ""));
                
                let tick = (Math.random() - 0.48) * (currentPrice * 0.0015);
                let newPrice = currentPrice + tick;
                let newPercent = percentVal + (tick / currentPrice) * 100;
                
                priceEl.textContent = `$${newPrice.toFixed(2)}`;
                
                if (newPercent >= 0) {
                    changeEl.textContent = `+${newPercent.toFixed(2)}%`;
                    changeEl.className = "ticker-change price-up";
                } else {
                    changeEl.textContent = `${newPercent.toFixed(2)}%`;
                    changeEl.className = "ticker-change price-down";
                }
            });
        }, 5000);
    }

    // 12. Set up document search filter & transcript exporters
    function setupFiltersAndExporters() {
        // Document search filter
        if (docSearchInput) {
            docSearchInput.addEventListener("input", (e) => {
                const term = e.target.value.toLowerCase().trim();
                const docItems = docList.querySelectorAll(".doc-item");
                docItems.forEach(item => {
                    const docName = item.querySelector(".doc-name").textContent.toLowerCase();
                    if (docName.includes(term)) {
                        item.style.display = "flex";
                    } else {
                        item.style.display = "none";
                    }
                });
            });
        }

        // Export active chat history transcript
        if (exportChatBtn) {
            exportChatBtn.addEventListener("click", () => {
                const activeSession = chatSessions.find(s => s.id === activeSessionId);
                if (!activeSession || activeSession.messages.length === 0) {
                    alert("No messages found in the active session to export.");
                    return;
                }

                let markdown = `# FinQuery Chat Transcript: ${activeSession.title}\n`;
                markdown += `Exported: ${new Date().toLocaleString()}\n`;
                markdown += `==============================================\n\n`;

                activeSession.messages.forEach(msg => {
                    const senderLabel = msg.sender === "user" ? "USER" : "AI RAG PIPELINE";
                    markdown += `### [${senderLabel}]\n\n${msg.text}\n\n---\n\n`;
                });

                const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `${activeSession.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chat_transcript.md`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            });
        }
    }

    // 13. Clean Reset Database Button trigger
    if (resetDbBtn) {
        resetDbBtn.addEventListener("click", async () => {
            const warningText = "Warning: This will wipe all user-uploaded files, clear vector index database, wipe active conversation histories, and reload standard Apple, Nvidia, and Tesla report samples. Proceed?";
            if (confirm(warningText)) {
                try {
                    resetDbBtn.disabled = true;
                    resetDbBtn.textContent = "Resetting Index...";
                    
                    const response = await fetch("/api/reset", {
                        method: "POST"
                    });

                    if (response.ok) {
                        const data = await response.json();
                        alert(data.message);
                        
                        localStorage.removeItem("finquery_sessions");
                        initChatSessions();
                        await loadDocuments();
                        
                        chartDataPoints = [];
                        updateChart();
                        
                        citationDrawer.classList.add("drawer-collapsed");
                    } else {
                        const errData = await response.json();
                        alert(`Reset failed: ${errData.detail}`);
                    }
                } catch (err) {
                    console.error("Reset error:", err);
                    alert("System error during database wipe.");
                } finally {
                    resetDbBtn.disabled = false;
                    resetDbBtn.textContent = "⚠️ Clean Database Reset";
                }
            }
        });
    }
});
