import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const modelSelect = document.getElementById("model-select");
const startBtn = document.getElementById("start-btn");
const statusText = document.getElementById("status-text");
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const tokenCountEl = document.getElementById("token-count");
const currentModelLabelEl = document.getElementById("current-model-label");
const chips = document.querySelectorAll(".chip");

let engine = null;
let isEngineReady = false;
let isLoadingModel = false;

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

// ✅ Only a few hand-picked models
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

async function initEngine(selectedModelId, humanLabel) {
  if (isLoadingModel || isEngineReady) return;

  isLoadingModel = true;
  startBtn.disabled = true;
  modelSelect.disabled = true;
  sendBtn.disabled = true;

  setStatus(
    `Downloading and preparing "${humanLabel}". ` +
      "This can take a few minutes the first time..."
  );
  setStats({ tokens: 0, modelLabel: humanLabel });

  const initProgressCallback = (progress) => {
    const pct = Math.round((progress.progress || 0) * 100);
    const stage = progress.text || "Preparing model...";
    setStatus(`Model setup: ${pct}% – ${stage}`);
  };

  try {
    engine = new webllm.MLCEngine({ initProgressCallback });
    await engine.reload(selectedModelId);
    isEngineReady = true;
    setStatus("Nira AI is ready! Ask any study question below.");
    startBtn.textContent = "Model ready";
    sendBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus(
      "Error while loading the model. Please refresh the page and try again."
    );
    modelSelect.disabled = false;
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

    setStats({ tokens: totalTokens, modelLabel: currentModelLabelEl.textContent });
    chatMessages.push({ role: "assistant", content: reply });
  } catch (err) {
    console.error(err);
    assistantBubble.textContent =
      "Sorry, something went wrong while generating a reply. Please try again.";
  } finally {
    sendBtn.disabled = false;
  }
}

function setupModelDropdown() {
  const allModels = webllm.prebuiltAppConfig?.model_list || [];

  const preferred = [];
  for (const pref of PREFERRED_MODELS) {
    const record = allModels.find((m) => m.model_id === pref.id);
    if (record) preferred.push({ ...pref, record });
  }

  let listToUse = preferred;

  // Fallback: if (for some reason) none of the above models exist
  if (listToUse.length === 0) {
    listToUse = allModels.slice(0, 4).map((record) => ({
      id: record.model_id,
      label: record.model_id,
      record
    }));
  }

  modelSelect.innerHTML = "";
  listToUse.forEach((m, idx) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    if (idx === 0) opt.selected = true;
    modelSelect.appendChild(opt);
  });

  if (listToUse[0]) {
    currentModelLabelEl.textContent = listToUse[0].label;
  }
}

function wireEvents() {
  startBtn.addEventListener("click", () => {
    const selectedId = modelSelect.value;
    const selectedLabel =
      modelSelect.options[modelSelect.selectedIndex]?.textContent || selectedId;
    initEngine(selectedId, selectedLabel);
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
}

// Initialize
setupModelDropdown();
wireEvents();
