// ============================================================
//  CONFIGURATION
// ============================================================

const CONFIG = {
    apiKey: "fw_W9nUTPh6NzhZ7wSR6JUoCb",
    chat: {
        endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
        model: "accounts/fireworks/models/gpt-oss-20b",
        maxTokens: 2000,
        temperature: 0.6,
        topP: 1,
        topK: 40,
    },
    image: {
        generateEndpoint:
            "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image",
        editEndpoint:
            "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro",
        editResultEndpoint:
            "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro/get_result",
        width: 1024,
        height: 1024,
        steps: 30,
        cfgScale: 7,
        pollIntervalMs: 2000,
        maxPollAttempts: 30,
    },
};


// ============================================================
//  STATE
// ============================================================

const state = {
    chatHistory: [],       // [{ role, content }, ...]
    sessions: [],          // [{ id, title, history, htmlSnapshot }, ...]
    activeSessionId: null,
    lastGeneratedImage: null, // base64 data URL of the last generated/edited image
    isLoading: false,
};


// ============================================================
//  DOM HELPERS
// ============================================================

const $ = (id) => document.getElementById(id);

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function getMode() {
    return $("ModeSelected").value;
}

function scrollChatToBottom() {
    const pane = $("chatPane");
    pane.scrollTop = pane.scrollHeight;
}


// ============================================================
//  WELCOME SCREEN
// ============================================================

function getWelcomeHTML() {
    return `
        <div class="welcome" id="welcomeScreen">
            <div class="welcome-title">Hello,<br><span>how can I help?</span></div>
            <p class="welcome-sub">Ask me anything — I'm powered by AI and ready to think with you.</p>
            <div class="suggestion-chips">
                <button class="chip" onclick="useChip(this)">Explain quantum computing</button>
                <button class="chip" onclick="useChip(this)">Write a haiku about space</button>
                <button class="chip" onclick="useChip(this)">Summarize the news today</button>
                <button class="chip" onclick="useChip(this)">Help me debug my code</button>
            </div>
        </div>`;
}

function useChip(btn) {
    $("prompt").value = btn.textContent;
    handleSend();
}


// ============================================================
//  SESSION MANAGEMENT
// ============================================================

function deriveTitle(text) {
    const trimmed = text.trim();
    return trimmed.length > 36 ? trimmed.slice(0, 36) + "…" : trimmed;
}

function ensureSession(firstMessage) {
    if (state.activeSessionId !== null) return;

    const session = {
        id: Date.now(),
        title: deriveTitle(firstMessage),
        history: [],
        htmlSnapshot: "",
    };

    state.sessions.unshift(session);
    state.activeSessionId = session.id;
    renderChatList();
}

function saveCurrentSession() {
    if (state.activeSessionId === null) return;

    const session = state.sessions.find((s) => s.id === state.activeSessionId);
    if (!session) return;

    session.history = [...state.chatHistory];
    session.htmlSnapshot = $("chatPane").innerHTML;
}

function loadSession(id) {
    saveCurrentSession();

    const session = state.sessions.find((s) => s.id === id);
    if (!session) return;

    state.activeSessionId = id;
    state.chatHistory = [...session.history];

    const pane = $("chatPane");
    pane.innerHTML = session.htmlSnapshot;
    scrollChatToBottom();

    renderChatList();
}

function newChat() {
    saveCurrentSession();

    state.chatHistory = [];
    state.activeSessionId = null;
    state.lastGeneratedImage = null;

    $("chatPane").innerHTML = getWelcomeHTML();
    renderChatList();
}

function renderChatList() {
    const html = state.sessions
        .map((s) => {
            const isActive = s.id === state.activeSessionId;
            return `<button class="chat-item${isActive ? " active" : ""}" onclick="loadSession(${s.id})">${escapeHtml(s.title)}</button>`;
        })
        .join("");

    const desktopList = $("chatList");
    const mobileList = $("chatListMobile");
    if (desktopList) desktopList.innerHTML = html;
    if (mobileList) mobileList.innerHTML = html;
}


// ============================================================
//  CHAT BUBBLES & TYPING INDICATOR
// ============================================================

function appendBubble(role, text, scroll = true) {
    const pane = $("chatPane");
    const row = document.createElement("div");
    row.className = `msg-row ${role}`;

    if (role === "ai") {
        row.innerHTML = `
            <div class="ai-avatar">AI</div>
            <div class="bubble ai markdown-body">${marked.parse(text)}</div>`;
    } else {
        row.innerHTML = `<div class="bubble user">${escapeHtml(text)}</div>`;
    }

    pane.appendChild(row);
    if (scroll) scrollChatToBottom();
}

function appendImageBubble(imageUrl, prompt) {
    const pane = $("chatPane");
    const row = document.createElement("div");
    row.className = "msg-row ai";
    row.innerHTML = `
        <div class="ai-avatar">AI</div>
        <div class="bubble ai" style="padding: 10px;">
            <img
                src="${imageUrl}"
                alt="${escapeHtml(prompt)}"
                style="max-width:100%; border-radius:12px; display:block;"
                onerror="this.parentElement.innerHTML='⚠️ Failed to load image.'"
            />
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:8px;">${escapeHtml(prompt)}</div>
        </div>`;
    pane.appendChild(row);
    scrollChatToBottom();
}

function showTyping() {
    const pane = $("chatPane");
    const id = "typing_" + Date.now();
    const row = document.createElement("div");
    row.id = id;
    row.className = "msg-row ai";
    row.innerHTML = `
        <div class="ai-avatar">AI</div>
        <div class="typing-dots">
            <span></span><span></span><span></span>
        </div>`;
    pane.appendChild(row);
    scrollChatToBottom();
    return id;
}

function removeTyping(id) {
    const el = $(id);
    if (el) el.remove();
}


// ============================================================
//  SEND HANDLER
// ============================================================

$("prompt").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

function setLoading(loading) {
    state.isLoading = loading;
    $("sendBtn").disabled = loading;
}

async function handleSend() {
    if (state.isLoading) return;

    const promptVal = $("prompt").value.trim();
    if (!promptVal) return;

    $("prompt").value = "";
    ensureSession(promptVal);

    // Remove welcome screen if present
    const welcome = $("welcomeScreen");
    if (welcome) welcome.remove();

    appendBubble("user", promptVal);
    const typingId = showTyping();
    setLoading(true);

    try {
        if (getMode() === "image") {
            await handleImageMode(promptVal, typingId);
        } else {
            await handleChatMode(promptVal, typingId);
        }
    } finally {
        setLoading(false);
    }
}

async function handleChatMode(promptVal, typingId) {
    state.chatHistory.push({ role: "user", content: promptVal });

    try {
        const response = await sendChatMessage();
        removeTyping(typingId);
        appendBubble("ai", response);
        state.chatHistory.push({ role: "assistant", content: response });
    } catch (err) {
        removeTyping(typingId);
        appendBubble("ai", "⚠️ Something went wrong. Please check your API key and try again.");
        console.error("Chat error:", err);
    } finally {
        saveCurrentSession();
    }
}

async function handleImageMode(promptVal, typingId) {
    try {
        let imageUrl;

        if (state.lastGeneratedImage) {
            // Edit the existing image
            const editPrompt = buildEditPrompt(promptVal);
            imageUrl = await editImage(state.lastGeneratedImage, editPrompt);
        } else {
            // Generate a new image
            imageUrl = await generateImage(promptVal);
        }
        console.log("Image used to show ===> ");
        console.log(imageUrl);
        removeTyping(typingId);
        appendImageBubble(imageUrl, promptVal);
    } catch (err) {
        removeTyping(typingId);
        appendBubble("ai", state.lastGeneratedImage
            ? "⚠️ Image editing failed. Please try again."
            : "⚠️ Image generation failed. Please try again."
        );
        console.error("Image error:", err);
    } finally {
        saveCurrentSession();
    }
}

function buildEditPrompt(userInstruction) {
    return `Modify the existing image with the following changes: ${userInstruction}. Keep consistency with the original style, lighting, and composition.`;
}


// ============================================================
//  CHAT API
// ============================================================

async function sendChatMessage() {
    const res = await fetch(CONFIG.chat.endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CONFIG.apiKey}`,
            Accept: "application/json",
        },
        body: JSON.stringify({
            model: CONFIG.chat.model,
            max_tokens: CONFIG.chat.maxTokens,
            temperature: CONFIG.chat.temperature,
            top_p: CONFIG.chat.topP,
            top_k: CONFIG.chat.topK,
            presence_penalty: 0,
            frequency_penalty: 0,
            messages: state.chatHistory,
        }),
    });

    if (!res.ok) throw new Error(`Chat API error: ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
}


// ============================================================
//  IMAGE GENERATION API
// ============================================================

async function generateImage(prompt) {
    const res = await fetch(CONFIG.image.generateEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CONFIG.apiKey}`,
        },
        body: JSON.stringify({
            prompt,
            cfg_scale: CONFIG.image.cfgScale,
            height: CONFIG.image.height,
            width: CONFIG.image.width,
            steps: CONFIG.image.steps,
        }),
    });

    if (!res.ok) throw new Error(`Image generation API error: ${res.status}`);
    console.log("Generating Image result === > ");
    console.log(res);
    const blob = await res.blob();
    console.log(URL.createObjectURL(blob));

    // Store raw base64 (no data: prefix) — consistent with what editImage expects
    state.lastGeneratedImage = stripBase64Prefix(await blobToBase64(blob));
    return URL.createObjectURL(blob);
}


// ============================================================
//  IMAGE EDITING API
// ============================================================

/**
 * Step 1 — Submit an image-edit job.
 * @param {string} prompt       - Instruction describing the edit.
 * @param {string} inputImage   - Raw base64 string (no data: prefix) or a public image URL.
 * @param {string} model        - Fireworks model slug (default: flux-kontext-pro).
 * @returns {string}            - request_id to poll with.
 */
async function submitEditJob({ prompt, inputImage, model = "flux-kontext-pro" }) {
    const res = await fetch(CONFIG.image.editEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CONFIG.apiKey}`,
        },
        body: JSON.stringify({
            prompt,
            input_image: inputImage, // raw base64 string or public URL
            // output_format: "jpeg",
            safety_tolerance: 2,    // max allowed for image-to-image
        }),
    }
    );

    if (!res.ok) throw new Error(`Image edit API error: ${res.status}`);

    const data = await res.json();
    const requestId = data.request_id || data.task_id || data.taskId || data.id;
    if (!requestId) throw new Error("No request_id/task_id returned: " + JSON.stringify(data));

    console.log("Edit job submitted. id:", requestId, data);
    return requestId;
}

/**
 * Step 2 — Poll until the edited image is ready, then return a display URL.
 * Also updates state.lastGeneratedImage with the new base64 for chained edits.
 * @param {string} requestId
 * @returns {string} - Object URL ready to use in <img src>.
 */
async function pollForEditedImage(requestId) {
    const { pollIntervalMs, maxPollAttempts, editResultEndpoint } = CONFIG.image;
    console.log("The Request id = ", requestId);
    const payload = {
        id: requestId,
        // task_id: requestId,
    };

    for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
        await delay(pollIntervalMs);

        const res = await fetch(editResultEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CONFIG.apiKey}`,
            },
            body: JSON.stringify(payload),
        });
        // console.log("after calling get_result endpoint")
        // console.log(res);
        if (!res.ok) throw new Error(`Poll API error: ${res.status}`);
        // console.log("in fetching edited image ", res)
        const result = await res.json();

        console.log(`Poll attempt ${attempt}:`, result);

        if (result.status === "Ready") {
            // result.result is a URL — fetch it, convert to base64 for future edits
            // const imageRef = typeof result.result === "string" ?
            //     result.result : result.result?.sample || result.result?.url;
        
            const imageRef = result.result.sample;
            return imageRef;
            
        }

        if (result.status === "Failed") {
            throw new Error(result.error_message || "Image editing failed");
        }

        // status === "Pending" → keep polling
    }

    throw new Error("Timed out waiting for edited image");
}

/**
 * Orchestrates submitEditJob → pollForEditedImage.
 * @param {string} imageBase64DataUrl - Full data URL or raw base64 from state.lastGeneratedImage.
 * @param {string} prompt             - User's edit instruction.
 * @returns {string}                  - Object URL for display.
 */
async function editImage(imageBase64DataUrl, prompt) {
    // The API accepts raw base64 or a public URL — always strip the data: prefix
    const inputImage = stripBase64Prefix(imageBase64DataUrl);
    const requestId = await submitEditJob({ prompt, inputImage });
    return await pollForEditedImage(requestId);
}


// ============================================================
//  UTILITIES
// ============================================================

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result); // full data URL
        reader.onerror = () => reject(new Error("Failed to convert blob to base64"));
        reader.readAsDataURL(blob);
    });
}

function stripBase64Prefix(dataUrl) {
    // e.g. "data:image/png;base64,iVBOR..." → "iVBOR..."
    return dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
}


function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}