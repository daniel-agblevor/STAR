
const API_URL = "http://localhost:8000";

// State
const state = {
    theme: localStorage.getItem("theme") || "light",
    files: []
};

// Elements
const dom = {
    themeToggle: document.getElementById("theme-toggle"),
    navItems: document.querySelectorAll(".nav-item[data-target]"),
    views: document.querySelectorAll(".view"),
    pageTitle: document.getElementById("page-title"),

    // File Upload
    dropZone: document.getElementById("drop-zone"),
    fileInput: document.getElementById("file-input"),
    uploadBtn: document.getElementById("upload-btn"),
    fileListContainer: document.getElementById("file-list-container"),

    // Chat
    chatInput: document.getElementById("chat-input"),
    sendChatBtn: document.getElementById("send-chat-btn"),
    chatMessages: document.getElementById("chat-messages"),

    // Stats
    statFiles: document.getElementById("stat-files-count")
};

// --- Initialization ---
function init() {
    applyTheme(state.theme);
    loadFiles();
    setupEventListeners();
}

// --- Theme ---
function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    const icon = dom.themeToggle.querySelector("i");
    if (theme === "dark") {
        icon.classList.replace("ph-moon", "ph-sun");
    } else {
        icon.classList.replace("ph-sun", "ph-moon");
    }
}

function toggleTheme() {
    state.theme = state.theme === "light" ? "dark" : "light";
    localStorage.setItem("theme", state.theme);
    applyTheme(state.theme);
}

// --- Navigation ---
function navigateTo(targetId) {
    // Update Nav
    dom.navItems.forEach(item => {
        item.classList.toggle("active", item.dataset.target === targetId);
    });

    // Update View
    dom.views.forEach(view => {
        view.classList.toggle("active", view.id === `view-${targetId}`);
    });

    // Update Title
    dom.pageTitle.textContent = targetId.charAt(0).toUpperCase() + targetId.slice(1);
}

// --- Files ---
async function loadFiles() {
    try {
        const res = await fetch(`${API_URL}/api/files`);
        const files = await res.json();
        state.files = files;
        renderFiles();
        dom.statFiles.textContent = files.length;
    } catch (err) {
        console.error("Failed to load files", err);
    }
}

function renderFiles() {
    dom.fileListContainer.innerHTML = state.files.map(file => `
    <div class="file-item">
      <div style="display:flex; align-items:center; gap:10px;">
        <i class="ph ph-file-pdf" style="font-size:1.5rem; color:var(--primary-color)"></i>
        <div>
          <div style="font-weight:500;">${file.name}</div>
          <div style="font-size:0.8rem; color:var(--text-secondary);">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
        </div>
      </div>
      <button onclick="deleteFile('${file.id}')" style="background:none; border:none; color:red; cursor:pointer;">
        <i class="ph ph-trash"></i>
      </button>
    </div>
  `).join("");
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    // UI Loading State (simple)
    const originalText = dom.uploadBtn.innerText;
    dom.uploadBtn.innerText = "Uploading...";
    dom.uploadBtn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/api/upload`, {
            method: "POST",
            body: formData
        });

        if (res.ok) {
            await loadFiles(); // Refresh list
            navigateTo("files"); // Go to files list
        } else {
            alert("Upload failed");
        }
    } catch (err) {
        console.error(err);
        alert("Error uploading file");
    } finally {
        dom.uploadBtn.innerText = originalText;
        dom.uploadBtn.disabled = false;
    }
}

window.deleteFile = async (id) => {
    if (!confirm("Are you sure?")) return;
    await fetch(`${API_URL}/api/files/${id}`, { method: 'DELETE' });
    loadFiles();
};

// --- Chat ---
// --- Chat ---
async function sendChat() {
    const query = dom.chatInput.value.trim();
    if (!query) return;

    // Add User Message
    appendMessage('user', query);
    dom.chatInput.value = "";

    // Add Bot placeholder with animation
    const loadingHtml = `
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>`;
    const botBubble = appendMessage('bot', loadingHtml, true);

    try {
        const res = await fetch(`${API_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query })
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let botText = "";

        // Clear the loading animation before showing text
        botBubble.innerHTML = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            botText += chunk;
            botBubble.innerText = botText; // Use standard text for safety/formatting
            // Auto scroll
            dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
        }

    } catch (err) {
        botBubble.innerText = "Error getting response.";
    }
}

function appendMessage(role, content, isHtml = false) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (isHtml) {
        bubble.innerHTML = content;
    } else {
        bubble.innerText = content;
    }

    msgDiv.appendChild(bubble);
    dom.chatMessages.appendChild(msgDiv);
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    return bubble;
}

// --- Quiz Logic ---
let quizState = {
    questions: [],
    currentIndex: 0,
    score: 0
};

async function loadFilesForSelect() {
    // Populate the select dropdowns for Quiz and Flashcards
    const selects = [document.getElementById('quiz-file-select'), document.getElementById('flash-file-select')];
    if (!selects[0]) return; // Safety

    try {
        // If state.files is empty, try fetch again
        if (state.files.length === 0) await loadFiles();

        const options = state.files.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
        selects.forEach(s => s.innerHTML = options || "<option>No files uploaded</option>");
    } catch (e) { console.error(e); }
}

async function startQuiz() {
    const fileId = document.getElementById('quiz-file-select').value;
    const count = document.getElementById('quiz-count').value;
    const btn = document.getElementById('btn-start-quiz');

    btn.innerText = "Generating with AI...";
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/api/quiz`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_id: fileId, count: parseInt(count) })
        });

        if (!res.ok) throw new Error("Failed");

        const data = await res.json();
        quizState.questions = data;
        quizState.currentIndex = 0;
        quizState.score = 0;

        // Switch UI
        document.getElementById('quiz-config').classList.add('hidden');
        document.getElementById('quiz-game').classList.remove('hidden');
        renderQuestion();

    } catch (e) {
        alert("Error generating quiz. Ensure file has text.");
    } finally {
        btn.innerText = "Generate Quiz";
        btn.disabled = false;
    }
}

function renderQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    document.getElementById('quiz-progress').innerText = `Question ${quizState.currentIndex + 1}/${quizState.questions.length}`;
    document.getElementById('quiz-question-text').innerText = q.question;
    document.getElementById('quiz-result-area').classList.add('hidden');

    const optsContainer = document.getElementById('quiz-options');
    optsContainer.innerHTML = "";

    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = "quiz-option";
        btn.innerText = opt;
        btn.onclick = () => checkAnswer(opt, q.correct_answer, btn);
        optsContainer.appendChild(btn);
    });
}

function checkAnswer(selected, correct, btnElement) {
    // Disable all options
    const allOpts = document.querySelectorAll('.quiz-option');
    allOpts.forEach(b => b.disabled = true);

    const isCorrect = selected.charAt(0) === correct.charAt(0); // Simple check "A" vs "A) Text"
    if (isCorrect || selected.includes(correct)) {
        btnElement.classList.add('correct');
        quizState.score++;
        document.getElementById('quiz-feedback').innerText = "Correct! 🎉";
    } else {
        btnElement.classList.add('wrong');
        document.getElementById('quiz-feedback').innerText = `Incorrect. The answer was ${correct}.`;
        // Highlight correct one
        allOpts.forEach(b => {
            if (b.innerText.includes(correct)) b.classList.add('correct');
        });
    }

    document.getElementById('quiz-result-area').classList.remove('hidden');
}

function nextQuestion() {
    quizState.currentIndex++;
    if (quizState.currentIndex < quizState.questions.length) {
        renderQuestion();
    } else {
        alert(`Quiz Finished! Score: ${quizState.score}/${quizState.questions.length}`);
        document.getElementById('quiz-game').classList.add('hidden');
        document.getElementById('quiz-config').classList.remove('hidden');
    }
}

// --- Flashcard Logic ---
let flashState = {
    cards: [],
    currentIndex: 0
};

async function startFlashcards() {
    const fileId = document.getElementById('flash-file-select').value;
    const count = document.getElementById('flash-count').value;
    const btn = document.getElementById('btn-start-flash');

    btn.innerText = "Generating...";
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/api/flashcards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_id: fileId, count: parseInt(count) })
        });

        const data = await res.json();
        flashState.cards = data;
        flashState.currentIndex = 0;

        document.getElementById('flashcard-config').classList.add('hidden');
        document.getElementById('flash-game').classList.remove('hidden');
        renderFlashcard();

    } catch (e) { alert("Error generating cards"); }
    finally { btn.innerText = "Generate Cards"; btn.disabled = false; }
}

function renderFlashcard() {
    const card = flashState.cards[flashState.currentIndex];
    document.getElementById('flash-progress').innerText = `Card ${flashState.currentIndex + 1}/${flashState.cards.length}`;
    document.getElementById('flash-front-text').innerText = card.front;
    document.getElementById('flash-back-text').innerText = card.back;

    const cardElem = document.getElementById('active-flashcard');
    cardElem.classList.remove('is-flipped');
}

function flipCard() {
    document.getElementById('active-flashcard').classList.toggle('is-flipped');
}

function nextCard(dir) {
    const newIndex = flashState.currentIndex + dir;
    if (newIndex >= 0 && newIndex < flashState.cards.length) {
        flashState.currentIndex = newIndex;
        renderFlashcard();
    }
}

// --- Event Listeners Update ---
function setupEventListeners() {
    // ... existing listeners ...
    dom.themeToggle.addEventListener("click", toggleTheme);

    dom.navItems.forEach(btn => {
        btn.addEventListener("click", () => {
            navigateTo(btn.dataset.target);
            if (btn.dataset.target === 'quiz' || btn.dataset.target === 'flashcards') {
                loadFilesForSelect();
            }
        });
    });

    dom.uploadBtn.addEventListener("click", () => dom.fileInput.click());
    dom.fileInput.addEventListener("change", (e) => {
        if (e.target.files[0]) uploadFile(e.target.files[0]);
    });

    dom.dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dom.dropZone.style.borderColor = "var(--primary-color)"; });
    dom.dropZone.addEventListener("drop", (e) => { e.preventDefault(); dom.dropZone.style.borderColor = "var(--border-color)"; if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]); });

    dom.sendChatBtn.addEventListener("click", sendChat);
    dom.chatInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendChat(); });

    // Quiz Events
    document.getElementById('quiz-count').addEventListener('input', (e) => document.getElementById('quiz-count-val').innerText = e.target.value);
    document.getElementById('btn-start-quiz').addEventListener('click', startQuiz);
    document.getElementById('btn-next-question').addEventListener('click', nextQuestion);
    document.getElementById('btn-quit-quiz').addEventListener('click', () => {
        document.getElementById('quiz-game').classList.add('hidden');
        document.getElementById('quiz-config').classList.remove('hidden');
    });

    // Flash Events
    document.getElementById('flash-count').addEventListener('input', (e) => document.getElementById('flash-count-val').innerText = e.target.value);
    document.getElementById('btn-start-flash').addEventListener('click', startFlashcards);
    document.getElementById('active-flashcard').addEventListener('click', flipCard);
    document.getElementById('btn-prev-card').addEventListener('click', () => nextCard(-1));
    document.getElementById('btn-next-card').addEventListener('click', () => nextCard(1));
    document.getElementById('btn-quit-flash').addEventListener('click', () => {
        document.getElementById('flash-game').classList.add('hidden');
        document.getElementById('flashcard-config').classList.remove('hidden');
    });

    // Mobile Nav
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggleMenu = () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    };

    document.getElementById('btn-hamburger').addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);

    // Close on nav click
    dom.navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 768) toggleMenu();
        });
    });
}

// Run
init();
