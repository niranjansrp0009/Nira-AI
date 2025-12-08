import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const modelPickerBtn = document.getElementById("model-picker-btn");
const modelPickerLabel = document.getElementById("model-picker-label");
const modelPickerPanel = document.getElementById("model-picker-panel");

const startBtn = document.getElementById("start-btn");
const statusText = document.getElementById("status-text");
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const tokenCountEl = document.getElementById("token-count");
const currentModelLabelEl = document.getElementById("current-model-label");
const chips = document.querySelectorAll(".chip");

// privacy modal elements
const privacyLink = document.getElementById("privacy-link");
const privacyModal = document.getElementById("privacy-modal");
const privacyCloseBtn = document.getElementById("privacy-close-btn");

let engine = null;
let isEngineReady = false;
let isLoadingModel = false;

let currentModelId = null;
let currentModelLabel = "Not started";

let chatMessages = [
  {
    role: "system",
    content:
      "You are Nira AI, a friendly, encouraging study assistant for Indian students. " +
      "You give clear, step-by-step explanations for school, college, IT, UPSC, and other exam topics. " +
      "Use simple language first, then add extra depth if the student asks. " +
      "Support English and popular Indian languages."
  }
];

const PREFERRED_MODELS = [
  {
    id: "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC-1k",
    label: "TinyLlama 1.1B – Fast (Lite)"
  },
  {
    id: "Phi-3-mini-4k-instruct-q4f16_1-MLC-1k",
    label: "Phi-3 Mini – Balanced"
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC-1k",
    label: "Llama-3.2 3B – Higher quality"
  },
  {
    id: "Qwen3-0.6B-q4f16_1-MLC",
    label: "Qwen3 0.6B – Multilingual"
  }
];

function appendMessage(role, text) {
  const container = document.createElement("div");
  container.className =
    "message-container " + (role === "user" ? "user" : "assistant");

  const bubble = document.createElement("div");
  bubble.className = "message";
  bubble.textContent = text;

  container.appendChild(bubble);
  chatBox.appendChild(container);
  chatBox.scrollTop = chatBox.scrollHeight;
  return bubble;
}

function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function setStats({ tokens, modelLabel }) {
  if (typeof tokens === "number" && tokenCountEl) {
    tokenCountEl.textContent = tokens.toString();
  }
  if (modelLabel && currentModelLabelEl) {
    currentModelLabelEl.textContent = modelLabel;
  }
}

async function initEngine() {
  if (!currentModelId) {
    setStatus("Please select a model first.");
    return;
  }
  if (isLoadingModel || isEngineReady) return;

  isLoadingModel = true;
  startBtn.disabled = true;
  sendBtn.disabled = true;

  setStatus(
    `Downloading and preparing "${currentModelLabel}". ` +
      "This can take a few minutes the first time..."
  );
  setStats({ tokens: 0, modelLabel: currentModelLabel });

  const initProgressCallback = (progress) => {
    const pct = Math.round((progress.progress || 0) * 100);
    const stage = progress.text || "Preparing model...";
    setStatus(`Model setup: ${pct}% – ${stage}`);
  };

  try {
    engine = new webllm.MLCEngine({ initProgressCallback });
    await engine.reload(currentModelId);
    isEngineReady = true;
    setStatus("Nira AI is ready! Ask any study question below.");
    startBtn.textContent = "Model ready";
    sendBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus(
      "Error while loading the model. Please refresh the page and try again."
    );
    startBtn.disabled = false;
  } finally {
    isLoadingModel = false;
  }
}

async function sendMessage() {
  if (!isEngineReady || !engine) {
    setStatus('Please click "Start Nira AI" and wait for the model to finish loading.');
    return;
  }

  const text = userInput.value.trim();
  if (!text) return;

  userInput.value = "";
  appendMessage("user", text);
  chatMessages.push({ role: "user", content: text });

  const assistantBubble = appendMessage("assistant", "Thinking...");
  sendBtn.disabled = true;

  try {
    const chunks = await engine.chat.completions.create({
      messages: chatMessages,
      temperature: 0.8,
      stream: true,
      stream_options: { include_usage: true }
    });

    let reply = "";
    let totalTokens = 0;

    assistantBubble.textContent = "";

    for await (const chunk of chunks) {
      const delta = chunk.choices[0]?.delta?.content || "";
      reply += delta;
      assistantBubble.textContent = reply;
      chatBox.scrollTop = chatBox.scrollHeight;

      if (chunk.usage) {
        totalTokens = chunk.usage.total_tokens ?? totalTokens;
      }
    }

    setStats({ tokens: totalTokens, modelLabel: currentModelLabel });
    chatMessages.push({ role: "assistant", content: reply });
  } catch (err) {
    console.error(err);
    assistantBubble.textContent =
      "Sorry, something went wrong while generating a reply. Please try again.";
  } finally {
    sendBtn.disabled = false;
  }
}

function setupModelPicker() {
  const allModels = webllm.prebuiltAppConfig?.model_list || [];
  let modelsToUse = [];

  for (const pref of PREFERRED_MODELS) {
    if (allModels.find((m) => m.model_id === pref.id)) {
      modelsToUse.push(pref);
    }
  }

  if (modelsToUse.length === 0 && allModels.length > 0) {
    modelsToUse = allModels.slice(0, 4).map((m) => ({
      id: m.model_id,
      label: m.model_id
    }));
  }

  modelPickerPanel.innerHTML = "";

  modelsToUse.forEach((m, idx) => {
    const btn = document.createElement("button");
    btn.className = "model-option";
    if (idx === 0) btn.classList.add("active");
    btn.dataset.modelId = m.id;
    btn.textContent = m.label;
    modelPickerPanel.appendChild(btn);

    if (idx === 0) {
      currentModelId = m.id;
      currentModelLabel = m.label;
      modelPickerLabel.textContent = currentModelLabel;
      setStats({ tokens: 0, modelLabel: currentModelLabel });
    }
  });

  // open / close dropdown
  modelPickerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    modelPickerPanel.classList.toggle("open");
  });

  // select model
  modelPickerPanel.addEventListener("click", (e) => {
    const btn = e.target.closest(".model-option");
    if (!btn) return;

    currentModelId = btn.dataset.modelId;
    currentModelLabel = btn.textContent;
    modelPickerLabel.textContent = currentModelLabel;
    setStats({ tokens: 0, modelLabel: currentModelLabel });

    document
      .querySelectorAll(".model-option")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    modelPickerPanel.classList.remove("open");
  });

  // close when clicking outside
  document.addEventListener("click", (e) => {
    if (
      !modelPickerPanel.contains(e.target) &&
      !modelPickerBtn.contains(e.target)
    ) {
      modelPickerPanel.classList.remove("open");
    }
  });
}

function wireEvents() {
  startBtn.addEventListener("click", () => {
    initEngine();
  });

  sendBtn.addEventListener("click", () => {
    sendMessage();
  });

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const prompt = chip.getAttribute("data-prompt") || chip.textContent;
      userInput.value = prompt;
      userInput.focus();
    });
  });

  // privacy popup open / close
  if (privacyLink && privacyModal && privacyCloseBtn) {
    privacyLink.addEventListener("click", () => {
      privacyModal.classList.remove("hidden");
    });

    privacyCloseBtn.addEventListener("click", () => {
      privacyModal.classList.add("hidden");
    });

    // close if user clicks outside the dialog (on dark background)
    privacyModal.addEventListener("click", (e) => {
      if (e.target === privacyModal) {
        privacyModal.classList.add("hidden");
      }
    });
  }
}

// init
setupModelPicker();
wireEvents();
