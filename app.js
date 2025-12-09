// Nira AI Lite – WebLLM front-end
// Uses a few curated models and shows download progress.

import * as webllm from "https://unpkg.com/@mlc-ai/web-llm@0.2.34/dist/index.js?module";

const modelConfigs = [
  {
    id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
    label: "TinyLlama 1.1B – Fast (Lite)",
    approxSize: "~700 MB",
  },
  {
    id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    label: "SmolLM 360M – Ultra Lite",
    approxSize: "~350 MB",
  },
  {
    id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
    label: "Phi-3 Mini – Balanced",
    approxSize: "~1600 MB",
  },
];

const modelSelect = document.getElementById("modelSelect");
const sizeLabel = document.getElementById("modelSizeLabel");
const startBtn = document.getElementById("startBtn");
const progressBar = document.getElementById("downloadProgressFill");
const progressText = document.getElementById("progressText");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const tokenInfo = document.getElementById("tokenInfo");

// Privacy modal
const privacyBtn = document.getElementById("privacyBtn");
const privacyModal = document.getElementById("privacyModal");
const closePrivacyBtn = document.getElementById("closePrivacyBtn");

let engine = null;
let currentModelId = null;
let isDownloading = false;

// Populate model dropdown
function initModelSelect() {
  modelConfigs.forEach((cfg, idx) => {
    const opt = document.createElement("option");
    opt.value = cfg.id;
    opt.textContent = cfg.label;
    if (idx === 1) {
      // Default: ultra lite model
      opt.selected = true;
      currentModelId = cfg.id;
      sizeLabel.textContent = cfg.approxSize;
    }
    modelSelect.appendChild(opt);
  });

  modelSelect.addEventListener("change", () => {
    const cfg = modelConfigs.find((m) => m.id === modelSelect.value);
    if (cfg) {
      currentModelId = cfg.id;
      sizeLabel.textContent = cfg.approxSize;
      resetProgress();
    }
  });
}

function resetProgress() {
  progressBar.style.width = "0%";
  progressText.textContent = "Model not started yet.";
}

// Chat helpers
function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function ensureEngineStarted() {
  if (!currentModelId) {
    alert("Please select a model first.");
    return null;
  }

  if (!navigator.gpu) {
    progressText.textContent =
      "WebGPU is not available on this device. Nira AI Lite needs a modern browser (Chrome/Edge) with WebGPU.";
    return null;
  }

  if (engine && engine.getLoadedModel()?.model_id === currentModelId) {
    return engine;
  }

  try {
    isDownloading = true;
    startBtn.disabled = true;
    sendBtn.disabled = true;
    progressBar.style.width = "0%";
    progressText.textContent = "Preparing to download the model...";

    const config = {
      model_list: modelConfigs.map((m) => ({ model_id: m.id })),
      model_id: currentModelId,
    };

    engine = await webllm.CreateWebWorkerMLCEngine(
      new URL("https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/"),
      {
        initProgressCallback: (report) => {
          if (report.progress) {
            const pct = Math.round(report.progress * 100);
            progressBar.style.width = `${pct}%`;
            progressText.textContent =
              report.text ?? `Downloading model… ${pct}% completed`;
          } else if (report.text) {
            progressText.textContent = report.text;
          }
        },
        modelConnection: config,
      }
    );

    isDownloading = false;
    startBtn.disabled = false;
    sendBtn.disabled = false;
    progressText.textContent = "Model ready. Ask your question!";
    tokenInfo.textContent = `Tokens: 0 · Model: ${getCurrentModelLabel()}`;
    return engine;
  } catch (err) {
    console.error("Error while loading model:", err);
    isDownloading = false;
    startBtn.disabled = false;
    sendBtn.disabled = false;
    progressBar.style.width = "0%";
    progressText.textContent =
      "Error while downloading or loading the model. Please check your internet connection and try again. If the problem continues, try a smaller model.";
    alert(
      "Error while downloading or loading the model. Try again with a good internet connection, or pick the Ultra Lite model."
    );
    return null;
  }
}

function getCurrentModelLabel() {
  const cfg = modelConfigs.find((m) => m.id === currentModelId);
  return cfg ? cfg.label : "–";
}

// Send message
async function handleSend() {
  const text = userInput.value.trim();
  if (!text) return;

  appendMessage("user", text);
  userInput.value = "";
  sendBtn.disabled = true;

  const eng = await ensureEngineStarted();
  if (!eng) {
    sendBtn.disabled = false;
    return;
  }

  appendMessage("assistant", "Thinking…");
  const thinkingBubble = chatWindow.lastElementChild.querySelector(".bubble");

  try {
    const reply = await eng.chat.completions.create({
      messages: [{ role: "user", content: text }],
      stream: true,
    });

    let fullText = "";
    for await (const chunk of reply) {
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      fullText += delta;
      thinkingBubble.textContent = fullText || "Thinking…";
    }

    tokenInfo.textContent = `Tokens: approx. ${fullText.length} · Model: ${getCurrentModelLabel()}`;
  } catch (err) {
    console.error("Chat error:", err);
    thinkingBubble.textContent =
      "Sorry, something went wrong while thinking. Please try again.";
  } finally {
    sendBtn.disabled = false;
  }
}

// Event wiring
startBtn.addEventListener("click", async () => {
  await ensureEngineStarted();
});

sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

// Quick topics
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const topic = chip.textContent.trim();
    const templates = {
      School: "Explain photosynthesis in very simple words.",
      College: "I am a law student. Explain the basics of contract law in India.",
      "IT / Coding": "Teach me what a 'variable' is in programming, with easy examples.",
      "UPSC / Govt Exams":
        "Give me a quick summary of the Indian Constitution in points.",
      "Competitive Exams":
        "Give me 5 tricky aptitude questions with answers for placement exams.",
    };
    userInput.value = templates[topic] || "";
    userInput.focus();
  });
});

// Privacy modal
privacyBtn.addEventListener("click", () => {
  privacyModal.classList.remove("hidden");
});
closePrivacyBtn.addEventListener("click", () => {
  privacyModal.classList.add("hidden");
});
privacyModal.addEventListener("click", (e) => {
  if (e.target === privacyModal || e.target.classList.contains("modal-backdrop")) {
    privacyModal.classList.add("hidden");
  }
});

// Init
initModelSelect();
resetProgress();
