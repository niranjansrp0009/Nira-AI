// Nira AI Lite – app logic
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

// ---------- DOM ELEMENTS ----------
const modelSelect = document.getElementById("model-select");
const modelSizeLabel = document.getElementById("model-size");
const progressBarFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");
const startButton = document.getElementById("start-btn");
const deviceWarning = document.getElementById("device-warning");

const chatLog = document.getElementById("chat-log");
const chatMeta = document.getElementById("chat-meta");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-btn");
const quickTopics = document.getElementById("quick-topics");

const privacyBtn = document.getElementById("privacy-btn");
const privacyModal = document.getElementById("privacy-modal");
const privacyClose = document.getElementById("privacy-close");

// ---------- BASIC STATE ----------
const SYSTEM_MESSAGE = {
  role: "system",
  content:
    "You are Nira AI, a smart, friendly study assistant for Indian students. " +
    "Explain clearly in simple steps. Support school (CBSE/State/ICSE), college, " +
    "law, engineering, coding, and competitive exams. If you are unsure, say so honestly.",
};

let messages = [SYSTEM_MESSAGE];
let engine = null;
let isModelReady = false;
let isLoadingModel = false;

// ---------- MODEL CONFIGURATION ----------

// We prefer these three friendly labels if they exist in WebLLM's prebuilt list.
const PREFERRED_MODELS = [
  "SmolLM2-360M-Instruct-q4f16_1-MLC",
  "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC-1k",
  "Phi-3-mini-4k-instruct-q4f16_1-MLC-1k",
];

const MODEL_LABELS = {
  "SmolLM2-360M-Instruct-q4f16_1-MLC": "SmolLM 360M – Ultra Lite",
  "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC-1k": "TinyLlama 1.1B – Fast (Lite)",
  "Phi-3-mini-4k-instruct-q4f16_1-MLC-1k": "Phi-3 Mini – Balanced",
};

const MODEL_SIZES_MB = {
  "SmolLM2-360M-Instruct-q4f16_1-MLC": 350,
  "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC-1k": 700,
  "Phi-3-mini-4k-instruct-q4f16_1-MLC-1k": 1600,
};

// ---------- INITIAL SETUP ----------

function checkWebGPU() {
  if (!("gpu" in navigator)) {
    deviceWarning.classList.remove("hidden");
    deviceWarning.textContent =
      "Your browser/device does not support WebGPU. Nira AI Lite requires a recent Chrome / Edge browser with WebGPU enabled. " +
      "You can still see the UI, but models cannot be loaded on this device.";
    startButton.disabled = true;
    sendButton.disabled = true;
    return false;
  }
  return true;
}

function setupPrivacyModal() {
  privacyBtn.addEventListener("click", () => {
    privacyModal.classList.remove("hidden");
  });
  privacyClose.addEventListener("click", () => {
    privacyModal.classList.add("hidden");
  });
  privacyModal.querySelector(".modal-backdrop").addEventListener("click", () => {
    privacyModal.classList.add("hidden");
  });
}

function setupQuickTopics() {
  quickTopics.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".chip");
    if (!btn) return;
    const prompt = btn.dataset.prompt;
    userInput.value = prompt;
    userInput.focus();
  });
}

function populateModelDropdown() {
  let prebuiltList = [];
  try {
    prebuiltList = webllm.prebuiltAppConfig?.model_list ?? [];
  } catch (err) {
    console.error("Cannot access prebuiltAppConfig:", err);
  }

  let chosen = [];

  if (prebuiltList.length) {
    const lookup = new Set(PREFERRED_MODELS);
    chosen = prebuiltList.filter((m) => lookup.has(m.model_id));

    // If none of our preferred IDs exist (names changed), just pick 3 smallest.
    if (!chosen.length) {
      chosen = [...prebuiltList]
        .sort((a, b) => {
          const aa = a.estimated_vram_bytes ?? Number.MAX_SAFE_INTEGER;
          const bb = b.estimated_vram_bytes ?? Number.MAX_SAFE_INTEGER;
          return aa - bb;
        })
        .slice(0, 3);
    }
  } else {
    // Fallback: we at least have our manual IDs (WebLLM will still validate).
    chosen = PREFERRED_MODELS.map((id) => ({ model_id: id }));
  }

  modelSelect.innerHTML = "";
  chosen.forEach((m) => {
    const id = m.model_id;
    const opt = document.createElement("option");
    opt.value = id;
    const label = MODEL_LABELS[id] ?? id;
    opt.textContent = label;
    modelSelect.appendChild(opt);
  });

  if (!chosen.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No models available (WebLLM config missing)";
    modelSelect.appendChild(opt);
    startButton.disabled = true;
  }

  if (modelSelect.options.length > 0) {
    modelSelect.selectedIndex = 0;
    updateModelSizeLabel();
  }
}

function updateModelSizeLabel() {
  const id = modelSelect.value;
  const size = MODEL_SIZES_MB[id];
  if (size) {
    modelSizeLabel.textContent = `Approx. size: ~${size} MB`;
  } else {
    modelSizeLabel.textContent = "Approx. size: ~unknown";
  }
}

// ---------- ENGINE SETUP & PROGRESS ----------

function setProgress(percent, text) {
  const bounded = Math.max(0, Math.min(100, percent ?? 0));
  progressBarFill.style.width = `${bounded}%`;
  if (text) {
    progressText.textContent = text;
  }
}

function attachEngineProgress(engineInstance) {
  engineInstance.setInitProgressCallback((report) => {
    console.log("Init progress:", report);
    const pct = Math.round((report.progress ?? 0) * 100);
    setProgress(pct, report.text ?? "");
  });
}

// ---------- CHAT HELPERS ----------

function appendMessage(role, text) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;

  row.appendChild(bubble);
  chatLog.appendChild(row);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateLastAssistantMessage(text) {
  const rows = chatLog.querySelectorAll(".message-row.assistant .message-bubble");
  if (!rows.length) return;
  rows[rows.length - 1].textContent = text;
}

async function streamChat() {
  try {
    let partial = "";
    let usageInfo = null;

    const completion = await engine.chat.completions.create({
      stream: true,
      messages,
      stream_options: { include_usage: true },
    });

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) partial += delta;
      if (chunk.usage) usageInfo = chunk.usage;
      updateLastAssistantMessage(partial || "...");
    }

    // Final message from engine if available
    let finalMsg = partial;
    try {
      const fromEngine = await engine.getMessage();
      if (fromEngine) finalMsg = fromEngine;
    } catch (_) {
      // ignore
    }

    updateLastAssistantMessage(finalMsg);

    if (usageInfo) {
      const extra = usageInfo.extra || {};
      const prefill = extra.prefill_tokens_per_s?.toFixed?.(2) ?? "–";
      const decode = extra.decode_tokens_per_s?.toFixed?.(2) ?? "–";
      chatMeta.textContent =
        `prompt_tokens: ${usageInfo.prompt_tokens ?? "–"}, ` +
        `completion_tokens: ${usageInfo.completion_tokens ?? "–"}, ` +
        `prefill: ${prefill} tokens/s, decoding: ${decode} tokens/s`;
    }
  } catch (err) {
    console.error("Error during chat:", err);
    updateLastAssistantMessage("Sorry, something went wrong while generating a reply.");
  } finally {
    sendButton.disabled = false;
    userInput.placeholder = "Ask Nira AI anything about your studies...";
  }
}

// ---------- EVENTS ----------

async function handleStartModel() {
  if (!checkWebGPU()) return;
  if (isLoadingModel) return;

  const modelId = modelSelect.value;
  if (!modelId) {
    progressText.textContent = "Please select a model first.";
    return;
  }

  isLoadingModel = true;
  isModelReady = false;
  setProgress(1, `Starting Nira AI with ${MODEL_LABELS[modelId] ?? modelId}...`);
  startButton.disabled = true;
  sendButton.disabled = true;

  try {
    if (!engine) {
      engine = new webllm.MLCEngine();
      attachEngineProgress(engine);
    }

    const config = {
      temperature: 0.8,
      top_p: 0.95,
    };

    await engine.reload(modelId, config);

    isModelReady = true;
    setProgress(100, "Model ready ✅ You can start asking questions.");
    sendButton.disabled = false;
  } catch (err) {
    console.error("Error while loading model:", err);
    setProgress(0, "❌ Error while downloading or loading the model. " +
      "Check your internet connection, or try a smaller model / another browser.");
    isModelReady = false;
  } finally {
    isLoadingModel = false;
    startButton.disabled = false;
  }
}

async function handleSend() {
  const text = userInput.value.trim();
  if (!text) return;
  if (!isModelReady) {
    progressText.textContent =
      "Please start Nira AI and wait until the model is ready before chatting.";
    return;
  }

  // Reset meta on new message
  chatMeta.textContent = "";

  const userMsg = { role: "user", content: text };
  messages.push(userMsg);

  appendMessage("user", text);

  // Placeholder assistant message
  const assistantPlaceholder = { role: "assistant", content: "Thinking..." };
  messages.push(assistantPlaceholder);
  appendMessage("assistant", assistantPlaceholder.content);

  userInput.value = "";
  userInput.placeholder = "Generating answer...";
  sendButton.disabled = true;

  await streamChat();
}

// ---------- MAIN BOOTSTRAP ----------

(function init() {
  const supports = checkWebGPU();
  setupPrivacyModal();
  setupQuickTopics();
  populateModelDropdown();

  if (!supports) {
    progressText.textContent =
      "WebGPU not available. Try a newer Chrome/Edge browser or another device.";
  }

  modelSelect.addEventListener("change", updateModelSizeLabel);
  startButton.addEventListener("click", handleStartModel);

  sendButton.addEventListener("click", handleSend);
  userInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      handleSend();
    }
  });
})();
