import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.41";

/**
 * Nira AI model list (only 3 good ones)
 * IDs must match WebLLM prebuilt config.
 */
const NIRA_MODELS = [
  {
    id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    label: "SmolLM 360M — Ultra Lite",
    approxSizeMB: 350,
    note: "Fastest & smallest – good for low-end devices."
  },
  {
    id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC-1k",
    label: "TinyLlama 1.1B – Fast (Lite)",
    approxSizeMB: 700,
    note: "Good balance of speed + quality."
  },
  {
    id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
    label: "Phi-3 Mini – Balanced",
    approxSizeMB: 1600,
    note: "Best quality, but biggest download."
  }
];

// ----- State -----
let engine = null;
let currentModel = null;
let isModelLoading = false;
let conversationMessages = [];
let totalTokensUsed = 0;

// ----- DOM elements -----
const modelSelect = document.getElementById("modelSelect");
const modelApproxSize = document.getElementById("modelApproxSize");
const startButton = document.getElementById("startButton");
const statusText = document.getElementById("statusText");
const statusChip = document.getElementById("statusChip");
const progressBar = document.getElementById("downloadProgressBar");
const progressText = document.getElementById("downloadProgressText");

const chatWindow = document.getElementById("chatWindow");
const tokenInfo = document.getElementById("tokenInfo");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendButton");
const quickTopicButtons = document.querySelectorAll(".chip[data-topic]");

const privacyButton = document.getElementById("privacyButton");
const privacyModal = document.getElementById("privacyModal");
const privacyCloseButton = document.getElementById("privacyCloseButton");

// ----- Helpers -----
function setStatusChip(mode) {
  statusChip.classList.remove("status-idle", "status-loading", "status-ready", "status-error");
  if (mode === "loading") {
    statusChip.textContent = "Model loading…";
    statusChip.classList.add("status-loading");
  } else if (mode === "ready") {
    statusChip.textContent = "Model ready ✅";
    statusChip.classList.add("status-ready");
  } else if (mode === "error") {
    statusChip.textContent = "Model error";
    statusChip.classList.add("status-error");
  } else {
    statusChip.textContent = "Model not started";
    statusChip.classList.add("status-idle");
  }
}

function setProgress(percent, text) {
  const safe = Math.max(0, Math.min(100, percent || 0));
  progressBar.style.width = `${safe}%`;
  progressBar.classList.remove("error");
  progressText.textContent = text || `Downloading model… ${safe}%`;
}

function setProgressError(text) {
  progressBar.classList.add("error");
  progressBar.style.width = "100%";
  progressText.textContent = text;
}

function resetProgress() {
  progressBar.classList.remove("error");
  progressBar.style.width = "0%";
  progressText.textContent = "Model not downloading yet.";
}

/**
 * Add a system message (centered) – used for hints.
 */
function addSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "message-system";
  div.textContent = text;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/**
 * Add user or assistant bubble.
 * type: "user" | "assistant"
 */
function addBubble(type, text) {
  const row = document.createElement("div");
  row.className = `message-row ${type === "user" ? "user" : "assistant"}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble " + (type === "user" ? "message-user" : "message-assistant");
  bubble.textContent = text;

  row.appendChild(bubble);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

function updateTokenInfo() {
  const modelLabel = currentModel ? currentModel.label : "–";
  tokenInfo.textContent = `Tokens (this chat): ${totalTokensUsed} • Model: ${modelLabel}`;
}

/**
 * Create a new conversation system prompt
 */
function resetConversation() {
  conversationMessages = [
    {
      role: "system",
      content:
        "You are Nira AI, a friendly Indian study assistant. Help school, college, IT and UPSC students. Explain concepts in very simple step-by-step language. Prefer examples from Indian exams and syllabus. Answer briefly unless the topic really needs a longer explanation."
    }
  ];
  totalTokensUsed = 0;
  updateTokenInfo();
}

// ----- Model select initialisation -----
function populateModelSelect() {
  modelSelect.innerHTML = "";
  NIRA_MODELS.forEach((m, index) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.label}`;
    if (index === 0) opt.selected = true;
    modelSelect.appendChild(opt);
  });
  const first = NIRA_MODELS[0];
  modelApproxSize.textContent = `Approx. size: ~${first.approxSizeMB} MB`;
}

function onModelChange() {
  const selectedId = modelSelect.value;
  const meta = NIRA_MODELS.find(m => m.id === selectedId);
  if (meta) {
    modelApproxSize.textContent = `Approx. size: ~${meta.approxSizeMB} MB`;
    statusText.textContent = meta.note;
  }
}

// ----- Start model -----
async function startSelectedModel() {
  if (!navigator.gpu) {
    setStatusChip("error");
    setProgressError(
      "WebGPU is not supported on this device/browser. Please use the latest Chrome or Edge."
    );
    statusText.textContent =
      "WebGPU is required to run Nira AI Lite fully on your device. Try on a newer phone or browser.";
    return;
  }

  if (isModelLoading) {
    return;
  }

  const selectedId = modelSelect.value;
  const meta = NIRA_MODELS.find(m => m.id === selectedId) || NIRA_MODELS[0];

  // Reset UI
  isModelLoading = true;
  currentModel = null;
  engine = null;
  resetProgress();
  setStatusChip("loading");
  statusText.textContent = `Downloading ${meta.label}. This can take some time the first time. Please keep the app open.`;

  chatWindow.innerHTML = "";
  resetConversation();
  addSystemMessage(
    `Starting Nira AI with ${meta.label}. The model (~${meta.approxSizeMB} MB) is being downloaded to your device. This usually happens only once.`
  );

  startButton.disabled = true;
  sendButton.disabled = true;
  userInput.disabled = true;
  modelSelect.disabled = true;

  try {
    const engineConfig = {
      initProgressCallback: progress => {
        // progress.progress is 0..1
        const pct = Math.round((progress.progress || 0) * 100);
        const text =
          progress.text ||
          `Downloading model files… ${pct}% (this happens only the first time).`;
        setProgress(pct, text);
      },
      logLevel: "ERROR"
    };

    engine = await webllm.CreateMLCEngine(selectedId, engineConfig);
    currentModel = meta;

    setProgress(100, "Model downloaded ✔");
    setStatusChip("ready");
    statusText.textContent = `Nira AI is ready. Ask your first study question below.`;
    addSystemMessage("New chat started ✅. Ask me any study question (school, college, IT, UPSC, etc.).");
    updateTokenInfo();

    sendButton.disabled = false;
    userInput.disabled = false;
  } catch (err) {
    console.error("Failed to init model", err);
    const raw = (err && err.message) ? err.message : String(err || "Unknown error");

    let friendly =
      "Error while downloading or loading the model. Please check your internet connection and try again. If the problem continues, try a smaller model.";
    if (raw.toLowerCase().includes("webgpu")) {
      friendly =
        "Your device GPU cannot initialise WebGPU for this model. Try using the smallest model (SmolLM 360M) or a newer browser/device.";
    }

    setStatusChip("error");
    setProgressError(friendly);
    statusText.textContent = friendly;
    addSystemMessage("❌ " + friendly);
  } finally {
    isModelLoading = false;
    startButton.disabled = false;
    modelSelect.disabled = false;
  }
}

// ----- Chat handling -----
async function handleChatSubmit(event) {
  event.preventDefault();
  const text = (userInput.value || "").trim();
  if (!text) return;

  if (!engine || !currentModel) {
    addSystemMessage('Please tap "Start Nira AI" first to load a model.');
    return;
  }

  // Add user message to UI + history
  addBubble("user", text);
  userInput.value = "";
  conversationMessages.push({ role: "user", content: text });

  // Prepare assistant bubble
  const assistantBubble = addBubble("assistant", "Thinking…");
  sendButton.disabled = true;
  userInput.disabled = true;

  try {
    const chunks = await engine.chat.completions.create({
      messages: conversationMessages,
      temperature: 0.7,
      max_tokens: 512,
      top_p: 0.9,
      stream: true,
      stream_options: { include_usage: true }
    });

    let full = "";
    let finalUsage = null;

    for await (const chunk of chunks) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      full += delta;
      assistantBubble.textContent = full || "…";

      if (chunk.usage) {
        finalUsage = chunk.usage;
      }
    }

    if (!full) {
      assistantBubble.textContent =
        "Sorry, I couldn't generate a response. Please try again with a simpler question.";
    }

    conversationMessages.push({ role: "assistant", content: full });

    if (finalUsage && typeof finalUsage.total_tokens === "number") {
      totalTokensUsed += finalUsage.total_tokens;
      updateTokenInfo();
    }
  } catch (err) {
    console.error("Chat error", err);
    assistantBubble.textContent =
      "Oops, something went wrong while generating the answer. Please try again.";
  } finally {
    sendButton.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }
}

// ----- Quick topics -----
function handleQuickTopicClick(event) {
  const topic = event.currentTarget.getAttribute("data-topic");
  if (!topic) return;

  if (!engine || !currentModel) {
    addSystemMessage(`First tap "Start Nira AI", then ask about ${topic}.`);
    return;
  }

  userInput.value = `I am a student. Explain an important concept from ${topic} in simple steps.`;
  userInput.focus();
}

// ----- Privacy modal -----
function openPrivacyModal() {
  privacyModal.classList.remove("hidden");
}

function closePrivacyModal() {
  privacyModal.classList.add("hidden");
}

// ----- Init -----
function init() {
  populateModelSelect();
  onModelChange();
  resetConversation();
  addSystemMessage(
    "Welcome to Nira AI Lite. Choose a model, tap “Start Nira AI” and wait for the first download to complete."
  );

  modelSelect.addEventListener("change", onModelChange);
  startButton.addEventListener("click", startSelectedModel);
  chatForm.addEventListener("submit", handleChatSubmit);

  quickTopicButtons.forEach(btn => {
    btn.addEventListener("click", handleQuickTopicClick);
  });

  privacyButton.addEventListener("click", openPrivacyModal);
  privacyCloseButton.addEventListener("click", closePrivacyModal);
  privacyModal
    .querySelector(".modal-backdrop")
    .addEventListener("click", closePrivacyModal);
}

document.addEventListener("DOMContentLoaded", init);
