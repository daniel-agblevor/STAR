const API_URL = 'http://127.0.0.1:8000';

// State
const state = {
    theme: localStorage.getItem("theme") || "light",
    user: JSON.parse(localStorage.getItem("user")) || null,
    token: localStorage.getItem("token") || null,
    files: []
};

// Elements
const dom = {
    themeToggle: document.getElementById("theme-toggle"),
    navItems: document.querySelectorAll(".nav-item[data-target]"),
    views: document.querySelectorAll(".view"),
    pageTitle: document.getElementById("page-title"),
    userProfile: document.querySelector(".user-profile-sidebar"),

    // Mobile Menu
    hamburgerBtn: document.getElementById("btn-hamburger"),
    sidebar: document.querySelector(".sidebar"),
    sidebarOverlay: document.getElementById("sidebar-overlay"),

    // Auth Modals
    authModal: document.getElementById("auth-modal"),
    closeAuthBtn: document.getElementById("close-auth-modal"),
    loginForm: document.getElementById("login-form"),
    registerForm: document.getElementById("register-form"),
    loginContainer: document.getElementById("login-form-container"),
    registerContainer: document.getElementById("register-form-container"),
    switchToRegister: document.getElementById("switch-to-register"),
    switchToLogin: document.getElementById("switch-to-login"),

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

// --- Auth Functions ---
async function login(email, password) {
    try {
        const res = await fetch(`${API_URL}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Login failed");

        // Save Session
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        updateAuthUI();
        loadFiles();
        closeAuthModal();
        alert("Welcome back!");

    } catch (err) {
        alert(err.message);
    }
}

async function register(email, password) {
    try {
        const res = await fetch(`${API_URL}/api/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Registration failed");

        alert("Registration successful! Please login.");
        toggleAuthMode(); // Switch to login form

    } catch (err) {
        alert(err.message);
    }
}

function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    state.files = [];

    updateAuthUI();
    renderFiles();
    navigateTo("chat"); // Fallback to safe view
}

function updateAuthUI() {
    const avatar = dom.userProfile.querySelector(".avatar");
    const name = dom.userProfile.querySelector(".name");
    const role = dom.userProfile.querySelector(".role");

    if (state.user) {
        avatar.textContent = (state.user.name || state.user.email).charAt(0).toUpperCase();
        name.textContent = state.user.name || state.user.email.split("@")[0];
        role.textContent = "Scholar";
        dom.userProfile.onclick = () => { if (confirm("Sign out?")) logout(); };
        dom.userProfile.style.cursor = "pointer";
    } else {
        avatar.innerHTML = "<i class='ph ph-user'></i>";
        name.textContent = "Guest";
        role.textContent = "Login";
        dom.userProfile.onclick = openAuthModal;
        dom.userProfile.style.cursor = "pointer";
    }

    // Gating check
    const currentViewId = document.querySelector(".view.active")?.id?.replace("view-", "");
    if (currentViewId) navigateTo(currentViewId);
}

// --- API Helpers ---
function getAuthHeaders() {
    const headers = {};
    if (state.token) {
        headers["Authorization"] = `Bearer ${state.token}`;
    }
    return headers;
}

async function loadFiles() {
    if (!state.user) return;

    try {
        const res = await fetch(`${API_URL}/api/files?user_id=${state.user.id}`, {
            headers: getAuthHeaders()
        });
        if (res.ok) {
            state.files = await res.json();
            renderFiles();
            updateStats();
        }
    } catch (err) {
        console.error("Load files error", err);
    }
}

async function uploadFile(file) {
    if (!state.user) return openAuthModal();

    const formData = new FormData();
    formData.append("file", file);

    const btn = dom.uploadBtn;
    const originalText = btn.innerText;
    btn.innerText = "Uploading...";
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/api/upload`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: formData
        });

        if (res.ok) {
            await loadFiles();
        } else {
            const data = await res.json();
            alert("Upload failed: " + (data.error || res.statusText));
        }
    } catch (err) {
        console.error(err);
        alert("Error uploading file");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- Chat Logic ---
async function sendChat() {
    const query = dom.chatInput.value.trim();
    if (!query) return;

    addMessage(query, "user");
    dom.chatInput.value = "";

    const aiMsgElement = addMessage("Thinking...", "ai");
    let fullResponse = "";

    try {
        const payload = { query };

        const res = await fetch(`${API_URL}/api/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders()
            },
            body: JSON.stringify(payload)
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        aiMsgElement.innerHTML = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            fullResponse += chunk;
            aiMsgElement.innerHTML = marked.parse(fullResponse);
            dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
        }

    } catch (err) {
        aiMsgElement.textContent = "Error: " + err.message;
    }
}


function addMessage(text, sender) {
    const div = document.createElement("div");
    div.className = `message ${sender}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = sender === 'user' ? text : marked.parse(text);

    div.appendChild(bubble);
    dom.chatMessages.appendChild(div);
    if (dom.chatMessages.children.length > 20) dom.chatMessages.firstChild.remove();
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    return bubble;
}

// --- Event Listeners ---
function setupEventListeners() {
    // Global Event for "Login" buttons
    document.addEventListener("open-auth", openAuthModal);

    // Nav
    dom.navItems.forEach(item => {
        item.addEventListener("click", () => {
            navigateTo(item.dataset.target);
            closeMobileMenu(); // Close mobile menu when navigating
        });
    });

    // Theme
    dom.themeToggle.addEventListener("click", toggleTheme);

    // Auth
    dom.closeAuthBtn.addEventListener("click", closeAuthModal);
    dom.switchToRegister.addEventListener("click", toggleAuthMode);
    dom.switchToLogin.addEventListener("click", toggleAuthMode);

    dom.loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = dom.loginForm.querySelector("input[type='email']").value;
        const password = dom.loginForm.querySelector("input[type='password']").value;
        login(email, password);
    });

    dom.registerForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = dom.registerForm.querySelector("#register-name").value;
        const email = dom.registerForm.querySelector("#register-email").value;
        const password = dom.registerForm.querySelector("#register-password").value;
        const confirmPassword = dom.registerForm.querySelector("#register-confirm-password").value;

        if (password !== confirmPassword) {
            alert("Passwords do not match");
            return;
        }

        register(email, password, name);
    });

    // File Upload
    dom.uploadBtn.addEventListener("click", () => dom.fileInput.click());
    dom.fileInput.addEventListener("change", (e) => {
        if (e.target.files[0]) uploadFile(e.target.files[0]);
    });

    // Drag & Drop
    dom.dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dom.dropZone.style.borderColor = "var(--primary)";
    });
    dom.dropZone.addEventListener("dragleave", (e) => {
        dom.dropZone.style.borderColor = "rgba(255, 255, 255, 0.1)";
    });
    dom.dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dom.dropZone.style.borderColor = "rgba(255, 255, 255, 0.1)";
        if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
    });

    // Chat
    dom.sendChatBtn.addEventListener("click", sendChat);
    dom.chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendChat();
    });

    // Mobile Menu
    if (dom.hamburgerBtn) {
        dom.hamburgerBtn.addEventListener("click", toggleMobileMenu);
    }
    if (dom.sidebarOverlay) {
        dom.sidebarOverlay.addEventListener("click", closeMobileMenu);
    }
}

function navigateTo(targetId) {
    const isGated = ['dashboard', 'files', 'quiz', 'flashcards'].includes(targetId);

    // View Switching
    dom.views.forEach(v => v.classList.remove("active"));
    dom.navItems.forEach(n => n.classList.remove("active"));

    const targetNav = document.querySelector(`.nav-item[data-target="${targetId}"]`);
    if (targetNav) targetNav.classList.add("active");

    const targetView = document.getElementById(`view-${targetId}`);

    // Auth Gating
    if (isGated && !state.token) {
        if (targetView) {
            targetView.classList.add("active");
            const temp = document.getElementById("gated-template");
            if (temp) targetView.innerHTML = temp.innerHTML;
        }
    } else {
        if (targetView) targetView.classList.add("active");

        // Restore Content if it was previously Gated
        if (targetView.innerHTML.includes("Login to access")) {
            if (targetId === 'dashboard') {
                targetView.innerHTML = getDashboardHTML();
                updateStats();
            } else if (targetId === 'files') {
                targetView.innerHTML = getFilesViewHTML();
                refreshDomForFiles();
                renderFiles();
            } else if (targetId === 'quiz') {
                targetView.innerHTML = getQuizViewHTML();
            } else if (targetId === 'flashcards') {
                targetView.innerHTML = getFlashcardsViewHTML();
            }
        }
    }

    dom.pageTitle.textContent = targetId.charAt(0).toUpperCase() + targetId.slice(1);
}

function refreshDomForFiles() {
    dom.dropZone = document.getElementById("drop-zone");
    dom.fileInput = document.getElementById("file-input");
    dom.uploadBtn = document.getElementById("upload-btn");

    if (dom.uploadBtn) dom.uploadBtn.addEventListener("click", () => dom.fileInput.click());
    if (dom.fileInput) dom.fileInput.addEventListener("change", (e) => { if (e.target.files[0]) uploadFile(e.target.files[0]); });
}

function toggleTheme() {
    state.theme = state.theme === "light" ? "dark" : "light";
    localStorage.setItem("theme", state.theme);
    applyTheme(state.theme);
}

function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    const icon = dom.themeToggle.querySelector("i");
    if (icon) {
        icon.className = theme === "light" ? "ph ph-moon" : "ph ph-sun";
    }
}

function openAuthModal() {
    dom.authModal.classList.remove("hidden");
    dom.loginContainer.classList.remove("hidden");
    dom.registerContainer.classList.add("hidden");
}

function closeAuthModal() {
    dom.authModal.classList.add("hidden");
}

function toggleAuthMode() {
    dom.loginContainer.classList.toggle("hidden");
    dom.registerContainer.classList.toggle("hidden");
}

function toggleMobileMenu() {
    dom.sidebar.classList.toggle("open");
    dom.sidebarOverlay.classList.toggle("active");
}

function closeMobileMenu() {
    dom.sidebar.classList.remove("open");
    dom.sidebarOverlay.classList.remove("active");
}


function renderFiles() {
    dom.fileListContainer.innerHTML = "";
    state.files.forEach(file => {
        const div = document.createElement("div");
        div.className = "file-card";
        div.innerHTML = `
            <div class="file-icon"><i class="ph ph-file-pdf"></i></div>
            <div class="file-info">
                <h4>${file.name}</h4>
                <p>Added ${new Date(file.created_at).toLocaleDateString()}</p>
            </div>
            <div class="file-actions">
                <button onclick="generateQuiz('${file.id}')" title="Quiz"><i class="ph ph-exam"></i></button>
                <button onclick="generateFlash('${file.id}')" title="Flashcards"><i class="ph ph-cards"></i></button>
                <button onclick="deleteFile('${file.id}')" class="delete" title="Delete"><i class="ph ph-trash"></i></button>
            </div>
        `;
        dom.fileListContainer.appendChild(div);
    });
}

function updateStats() {
    if (dom.statFiles) dom.statFiles.textContent = state.files.length;
}

// Helpers for restoring HTML
function getDashboardHTML() {
    return `<div class="welcome-banner"><h1>Welcome back, Scholar!</h1><p>Ready to master your subjects today?</p></div><div class="stats-grid"><div class="stat-card"><h3>Files Uploaded</h3><span id="stat-files-count">${state.files.length}</span></div><div class="stat-card"><h3>Quizzes Taken</h3><span id="stat-quizzes-count">0</span></div><div class="stat-card"><h3>Cards Mastered</h3><span id="stat-cards-count">0</span></div></div>`;
}

function getFilesViewHTML() {
    return `<div class="upload-area" id="drop-zone"><i class="ph ph-upload-simple"></i><p>Drag & Drop PDF or DOCX here</p><button class="btn primary" id="upload-btn">Browse Files</button><input type="file" id="file-input" hidden accept=".pdf,.docx,.doc,.txt" /></div><div class="file-list" id="file-list-container"></div>`;
}

function getQuizViewHTML() {
    return `
        <!-- Quiz Config -->
        <div class="config-container" id="quiz-config">
          <div class="card-glass">
            <h3>Generate Quiz</h3>
            <div class="form-group">
              <label>Select Document</label>
              <select id="quiz-file-select" class="glass-input">
                <option>Loading...</option>
              </select>
            </div>
            <div class="form-group">
              <label>Number of Questions: <span id="quiz-count-val">5</span></label>
              <input type="range" id="quiz-count" min="3" max="10" value="5" class="glass-range">
            </div>
            <button class="btn primary full-width" id="btn-start-quiz">Generate Quiz</button>
          </div>
        </div>

        <!-- Quiz Gameplay (Hidden by default) -->
        <div class="quiz-game-container hidden" id="quiz-game">
          <div class="quiz-header">
            <span id="quiz-progress">Question 1/5</span>
            <button class="btn-text" id="btn-quit-quiz">Exit</button>
          </div>
          <div class="question-card">
            <h2 id="quiz-question-text">Question goes here?</h2>
            <div class="options-grid" id="quiz-options">
              <!-- Options injected here -->
            </div>
          </div>
          <div class="quiz-footer hidden" id="quiz-result-area">
            <p id="quiz-feedback"></p>
            <button class="btn primary" id="btn-next-question">Next Question</button>
          </div>
        </div>
    `;
}

function getFlashcardsViewHTML() {
    return `
        <!-- Flashcard Config -->
        <div class="config-container" id="flashcard-config">
          <div class="card-glass">
            <h3>Generate Flashcards</h3>
            <div class="form-group">
              <label>Select Document</label>
              <select id="flash-file-select" class="glass-input">
                <option>Loading...</option>
              </select>
            </div>
            <div class="form-group">
              <label>Count: <span id="flash-count-val">5</span></label>
              <input type="range" id="flash-count" min="3" max="10" value="5" class="glass-range">
            </div>
            <button class="btn primary full-width" id="btn-start-flash">Generate Cards</button>
          </div>
        </div>

        <!-- Flashcard Gameplay -->
        <div class="flashcard-game-container hidden" id="flash-game">
          <div class="flash-header">
            <span id="flash-progress">Card 1/5</span>
            <button class="btn-text" id="btn-quit-flash">Exit</button>
          </div>

          <div class="flashcard-scene">
            <div class="flashcard" id="active-flashcard">
              <div class="card-face card-front">
                <p id="flash-front-text">Front</p>
                <span class="hint">Click to flip</span>
              </div>
              <div class="card-face card-back">
                <p id="flash-back-text">Back</p>
              </div>
            </div>
          </div>

          <div class="flash-controls">
            <button class="btn-circle" id="btn-prev-card"><i class="ph ph-arrow-left"></i></button>
            <button class="btn-circle" id="btn-next-card"><i class="ph ph-arrow-right"></i></button>
          </div>
        </div>
    `;
}

// --- Chat History ---
async function loadChatHistory() {
    if (!state.token) return;

    try {
        const res = await fetch(`${API_URL}/api/chat/history`, {
            headers: getAuthHeaders()
        });

        if (res.ok) {
            const data = await res.json();
            // Clear existing messages except the initial bot message
            const initialMsg = dom.chatMessages.querySelector('.message.bot');
            dom.chatMessages.innerHTML = '';
            if (initialMsg) dom.chatMessages.appendChild(initialMsg);

            // Add history messages
            data.messages.forEach(msg => {
                addMessage(msg.content, msg.role === 'user' ? 'user' : 'bot');
            });
        }
    } catch (err) {
        console.error("Error loading chat history:", err);
    }
}

// --- Quiz & Flashcard Generation ---
async function generateQuiz(fileId) {
    if (!state.token) return openAuthModal();

    try {
        const count = 5;
        const res = await fetch(`${API_URL}/api/quiz`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders()
            },
            body: JSON.stringify({ file_id: fileId, count })
        });

        if (!res.ok) {
            const data = await res.json();
            alert("Error: " + (data.error || "Failed to generate quiz"));
            return;
        }

        const questions = await res.json();
        console.log("Quiz generated:", questions);
        alert(`Quiz generated with ${questions.length} questions!`);
        // TODO: Display quiz UI

    } catch (err) {
        console.error(err);
        alert("Error generating quiz");
    }
}

async function generateFlash(fileId) {
    if (!state.token) return openAuthModal();

    try {
        const count = 5;
        const res = await fetch(`${API_URL}/api/flashcards`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders()
            },
            body: JSON.stringify({ file_id: fileId, count })
        });

        if (!res.ok) {
            const data = await res.json();
            alert("Error: " + (data.error || "Failed to generate flashcards"));
            return;
        }

        const flashcards = await res.json();
        console.log("Flashcards generated:", flashcards);
        alert(`Flashcards generated with ${flashcards.length} cards!`);
        // TODO: Display flashcard UI

    } catch (err) {
        console.error(err);
        alert("Error generating flashcards");
    }
}

// --- File Deletion ---
async function deleteFile(fileId) {
    if (!confirm("Delete this file?")) return;

    try {
        const res = await fetch(`${API_URL}/api/files/${fileId}`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });

        if (res.ok) {
            await loadFiles();
            alert("File deleted successfully");
        } else {
            const data = await res.json();
            alert("Error: " + (data.error || "Failed to delete file"));
        }
    } catch (err) {
        console.error(err);
        alert("Error deleting file");
    }
}

// --- Initialization ---
async function init() {
    applyTheme(state.theme);
    setupEventListeners();
    updateAuthUI();
    if (state.user) {
        await loadFiles();
        await loadChatHistory();
    }
}

// Run
init();
