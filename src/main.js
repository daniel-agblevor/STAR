const API_URL = `http://${window.location.hostname}:8000`;

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

// --- Initialization ---
async function init() {
    applyTheme(state.theme);
    setupEventListeners();
    updateAuthUI();
    if (state.user) {
        await loadFiles();
    }
}

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
    div.innerHTML = sender === 'user' ? text : marked.parse(text);
    dom.chatMessages.appendChild(div);
    if (dom.chatMessages.children.length > 20) dom.chatMessages.firstChild.remove();
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    return div;
}

// --- Event Listeners ---
function setupEventListeners() {
    // Global Event for "Login" buttons
    document.addEventListener("open-auth", openAuthModal);

    // Nav
    dom.navItems.forEach(item => {
        item.addEventListener("click", () => navigateTo(item.dataset.target));
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
            }
            // For Quiz/Flashcards, reloading via F5 is best fallback if specific restore logic isn't built.
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

// Run
init();
