// app.js – Nira AI Lite (WebLLM front-end)
import * as webllm from "https://unpkg.com/@mlc-ai/web-llm@0.2.34/dist/index.js";

// --- Model list (only 3, all relatively small) ---
const MODELS = [
  {
    id: "SmolLM-360M-Instruct-q4f16_1-MLC",
    label: "SmolLM 360M – Ultra Lite",
    sizeLabel: "~350 MB",
    note: "Good for very low-end devices, basic answers."
  },
  {
    id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
    label: "TinyLlama 1.1B – Fast (Lite)",
    sizeLabel: "~700 MB",
    note: "Balanced quality vs. size."
  },
  {
    id: "Phi-3-mini-4k-instruct-q4f16_1-MLC-1k",
    label: "Phi-3 Mini – Balanced",
    sizeLabel: "~1600 MB",
    note: "Best quality, but largest download."
  }
];

// --- DOM elements ---
const els = {
  modelSelect: document.getElementById("model-select"),
  modelSize: document.getElementById("model-size"),
  modelNote: document.getElementById("model-note"),
  downloadBar: document.getElementById("download-bar-fill"),
  downloadStatus: document.getElementById("download-status"),
  startBtn: document.getElementById("start-btn"),
  chatLog: document.getElementById("chat-log"),
  userInput: document.getElementById("user-input"),
  sendBtn: document.getElementById("send-btn"),
  tokenInfo: document.getElementById("token-info"),
  privacyBtn: document.getElementById("privacy-btn"),
  privacyModal: document.getElementById("privacy-modal"),
  privacyClose: document.getElementById("privacy-close")
};

let engine = null;
let isModelReady = false;
let currentModel = MODELS[0];
let totalTokens = 0;

// --- Helpers ---

function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  els.chatLog.appendChild(wrapper);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function setDownloadProgress(percent, text) {
  const clamped = Math.max(0, Math.min(100, percent));
  els.downloadBar.style.width = `${clamped}%`;
  if (text) {
    els.downloadStatus.textContent = text;
  }
}

function setStatusError(detail) {
  const msg =
    "Error while downloading or loading the model. " +
    "Please check your internet connection and try again. " +
    "If the problem continues, your device might not support this model.";
  els.downloadStatus.textContent = msg;
  console.error("Nira AI model error:", detail);
}

function updateTokenInfo() {
  els.tokenInfo.textContent = `Tokens: ${totalTokens} · Model: ${
    isModelReady ? currentModel.label : "–"
  }`;
}

function disableInteraction(loading) {
  els.startBtn.disabled = loading;
  els.sendBtn.disabled = loading || !isModelReady;
  els.userInput.disabled = loading || !isModelReady;
}

// --- Privacy modal ---

els.privacyBtn.addEventListener("click", () => {
  els.privacyModal.showModal();
});

els.privacyClose.addEventListener("click", () => {
  els.privacyModal.close();
});

// --- Model selector init ---

function populateModels() {
  MODELS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    els.modelSelect.appendChild(opt);
  });
  els.modelSelect.value = MODELS[0].id;
  onModelChange();
}

function onModelChange() {
  const selectedId = els.modelSelect.value;
  currentModel = MODELS.find((m) => m.id === selectedId) || MODELS[0];
  els.modelSize.textContent = `Approx. size: ${currentModel.sizeLabel}`;
  els.modelNote.textContent = currentModel.note;
  setDownloadProgress(0, "Model not started yet.");
  isModelReady = false;
  disableInteraction(false);
  els.sendBtn.disabled = true;
  els.userInput.disabled = true;
  updateTokenInfo();
}

els.modelSelect.addEventListener("change", onModelChange);

// --- WebGPU check ---

function checkWebGPU() {
  if (!("gpu" in navigator)) {
    setDownloadProgress(0, "WebGPU is not supported on this browser/device.");
    els.startBtn.disabled = true;
    appendMessage(
      "system",
      "Your browser/device does not support WebGPU, so Nira AI Lite cannot run. Please try on latest Chrome or Edge on a newer device, or use the future Nira AI Pro (online) version."
    );
    return false;
  }
  return true;
}

// --- Load model ---

async function loadModel() {
  if (!checkWebGPU()) return;

  disableInteraction(true);
  setDownloadProgress(2, "Starting Nira AI…");

  try {
    if (!engine) {
      engine = await webllm.CreateMLCEngine(currentModel.id, {
        initProgressCallback: (report) => {
          const pct = Math.floor((report.progress || 0) * 100);
          const txt = report.text || "Preparing model…";
          setDownloadProgress(pct, txt);
        }
      });
    } else {
      await engine.reload(currentModel.id, {
        initProgressCallback: (report) => {
          const pct = Math.floor((report.progress || 0) * 100);
          const txt = report.text || "Preparing model…";
          setDownloadProgress(pct, txt);
        }
      });
    }

    isModelReady = true;
    setDownloadProgress(100, "Model ready. You can start asking questions.");
    appendMessage(
      "assistant",
      `Nira AI is ready using ${currentModel.label}. Ask me any study question.`
    );
    disableInteraction(false);
    els.sendBtn.disabled = false;
    els.userInput.disabled = false;
    updateTokenInfo();
  } catch (err) {
    isModelReady = false;
    setDownloadProgress(0, "Model error.");
    setStatusError(err);
    disableInteraction(false);
  }
}

els.startBtn.addEventListener("click", () => {
  loadModel();
});

// --- Chat ---

async function sendMessage() {
  const text = els.userInput.value.trim();
  if (!text || !isModelReady || !engine) return;

  appendMessage("user", text);
  els.userInput.value = "";
  disableInteraction(true);

  try {
    const messages = [
      {
        role: "system",
        content:
          "You are Nira AI, a friendly Indian study assistant. Explain concepts clearly in simple steps for school, college, IT and competitive exams. Prefer English but accept Indian languages too."
      },
      {
        role: "user",
        content: text
      }
    ];

    const replyStream = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 512
    });

    let assistantText = "";
    const assistantBubbleWrapper = document.createElement("div");
    assistantBubbleWrapper.className = "chat-message assistant";
    const assistantBubble = document.createElement("div");
    assistantBubble.className = "bubble";
    assistantBubbleWrapper.appendChild(assistantBubble);
    els.chatLog.appendChild(assistantBubbleWrapper);

    for await (const chunk of replyStream) {
      const part =
        chunk.choices?.[0]?.delta?.content?.[0]?.text ||
        chunk.choices?.[0]?.delta?.content ||
        "";
      assistantText += part;
      assistantBubble.textContent = assistantText;
      els.chatLog.scrollTop = els.chatLog.scrollHeight;

      if (chunk.usage?.total_tokens) {
        totalTokens += chunk.usage.total_tokens;
        updateTokenInfo();
      }
    }
  } catch (err) {
    console.error("Chat error:", err);
    appendMessage(
      "assistant",
      "Sorry, something went wrong while answering. Please ask again."
    );
  } finally {
    disableInteraction(false);
  }
}

els.sendBtn.addEventListener("click", sendMessage);
els.userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Quick topic chips
document.querySelectorAll(".chip[data-topic]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const topic = btn.getAttribute("data-topic");
    els.userInput.value = `I am a student. Help me with this topic related to ${topic}: `;
    els.userInput.focus();
  });
});

// --- Init ---
populateModels();
checkWebGPU();
updateTokenInfo();
