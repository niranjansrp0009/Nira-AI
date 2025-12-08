import * as webllm from "https://esm.run/@mlc-ai/web-llm";

/* ------------------------ Model config ------------------------ */

const MODEL_CONFIGS = [
  {
    id: "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC-1k",
    label: "TinyLlama 1.1B – Fast (Lite)",
    approxSizeMB: 550,
    note: "Best for most phones, quick replies."
  },
  {
    id: "Phi-3-mini-4k-instruct-q4f16_1-MLC-1k",
    label: "Phi-3 Mini – Balanced",
    approxSizeMB: 1600,
    note: "Better reasoning, slightly heavier."
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 0.5B – Multilingual",
    approxSizeMB: 650,
    note: "Good for Indian languages + English."
  }
];

// system prompt for Nira AI
const SYSTEM_MESSAGE = {
  role: "system",
  content: `
You are Nira AI, a friendly, exam-focused study assistant for Indian students.
- Help users from school, college, IT / coding, UPSC and other competitive exams.
- Explain concepts step by step, using simple language first, then deeper details.
- You can answer in English and popular Indian languages if the user writes in them.
- Do NOT generate nonsense or repeated words. Keep answers clear and focused.
- Never give harmful, illegal, or adult content. Keep everything study-safe.
`.trim()
};

/* ------------------------ DOM helpers ------------------------ */

const els = {
  modelSelect: document.getElementById("modelSelect"),
  modelSizeLabel: document.getElementById("modelSizeLabel"),
  modelStatusChip: document.getElementById("modelStatusChip"),
  startButton: document.getElementById("startButton"),
  progressArea: document.getElementById("progressArea"),
  progressFill: document.getElementById("progressFill"),
  progressText: document.getElementById("progressText"),
  chatWindow: document.getElementById("chatWindow"),
  chatForm: document.getElementById("chatForm"),
  userInput: document.getElementById("userInput"),
  sendButton: document.getElementById("sendButton"),
  tokenInfo: document.getElementById("tokenInfo"),
  currentModelInfo: document.getElementById("currentModelInfo"),
  quickChips: document.querySelectorAll(".chip.quick"),
  openPrivacy: document.getElementById("openPrivacy"),
  closePrivacy: document.getElementById("closePrivacy"),
  privacyModal: document.getElementById("privacyModal"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  newChatButton: document.getElementById("newChatButton")
};

/* ------------------------ State ------------------------ */

let engine = null;
let selectedModel = MODEL_CONFIGS[0];
let messages = [SYSTEM_MESSAGE];
let isDownloading = false;
let lastAssistantBubble = null;

/* ------------------------ Init UI ------------------------ */

function initModelDropdown() {
  MODEL_CONFIGS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.label} (~${m.approxSizeMB} MB)`;
    els.modelSelect.appendChild(opt);
  });

  els.modelSelect.value = selectedModel.id;
  updateModelMeta();
}

function updateModelMeta() {
  els.modelSizeLabel.textContent = `Approx. size: ${selectedModel.approxSizeMB} MB`;
  els.currentModelInfo.textContent = `Model: ${selectedModel.label}`;
}

/* ------------------------ WebLLM setup ------------------------ */

function ensureEngine() {
  if (!engine) {
    engine = new webllm.MLCEngine();
    engine.setInitProgressCallback(handleInitProgress);
  }
  return engine;
}

function handleInitProgress(report) {
  const p = Math.max(0, Math.min(1, report.progress ?? 0));
  const percent = Math.round(p * 100);

  const total = selectedModel.approxSizeMB;
  const downloaded = Math.round(total * p);

  els.progressArea.classList.remove("hidden");
  els.progressFill.style.width = `${percent}%`;

  const baseText = report.text || "Downloading model...";
  els.progressText.textContent = `${baseText} • ~${downloaded} / ${total} MB (${percent}%)`;
}

/* ------------------------ Model start / reload ------------------------ */

async function startNira() {
  if (isDownloading) return;

  isDownloading = true;
  els.startButton.disabled = true;
  els.sendButton.disabled = true;
  els.modelStatusChip.textContent = "Downloading...";
  els.modelStatusChip.classList.remove("pill-soft");
  els.progressArea.classList.remove("hidden");
  els.progressFill.style.width = "0%";
  els.progressText.textContent = "Starting download...";

  try {
    ensureEngine();

    // Slightly lower temperature + cap tokens to avoid nonsense
    const samplingConfig = { temperature: 0.7, top_p: 0.9, max_tokens: 512 };

    await engine.reload(selectedModel.id, samplingConfig);

    els.modelStatusChip.textContent = "Model ready";
    els.modelStatusChip.classList.add("pill-soft");
    els.progressFill.style.width = "100%";
    els.progressText.textContent = `Model ready • ~${selectedModel.approxSizeMB} MB cached on your device. Next time will be faster.`;

    els.startButton.textContent = "Restart Nira AI";
    els.sendButton.disabled = false;
  } catch (err) {
    console.error(err);
    els.modelStatusChip.textContent = "Error";
    els.progressText.textContent =
      "Error while downloading the model. Please check your internet connection and try again.";
  } finally {
    els.startButton.disabled = false;
    isDownloading = false;
  }
}

/* ------------------------ Chat rendering ------------------------ */

function appendMessage(role, text) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;

  row.appendChild(bubble);
  els.chatWindow.appendChild(row);
  els.chatWindow.scrollTop = els.chatWindow.scrollHeight;

  if (role === "assistant") {
    lastAssistantBubble = bubble;
  }

  return bubble;
}

function updateLastAssistantBubble(text) {
  if (!lastAssistantBubble) return;
  lastAssistantBubble.textContent = text;
  els.chatWindow.scrollTop = els.chatWindow.scrollHeight;
}

/* ------------------------ Chat logic ------------------------ */

async function sendMessage(text) {
  if (!engine) {
    appendMessage(
      "assistant",
      "Please tap “Start Nira AI” first and wait for the model download to finish."
    );
    return;
  }

  const trimmed = text.trim();
  if (!trimmed) return;

  els.sendButton.disabled = true;
  els.userInput.value = "";
  els.userInput.placeholder = "Nira AI is thinking...";

  const userMsg = { role: "user", content: trimmed };
  messages.push(userMsg);
  appendMessage("user", trimmed);

  // Temporary assistant bubble
  appendMessage("assistant", "Typing...");
  let collected = "";
  let finalUsage = null;

  try {
    const completion = await engine.chat.completions.create({
      stream: true,
      messages,
      stream_options: { include_usage: true }
    });

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content || "";
      collected += delta;
      updateLastAssistantBubble(collected);
      if (chunk.usage) {
        finalUsage = chunk.usage;
      }
    }

    const finalMessage = await engine.getMessage();
    updateLastAssistantBubble(finalMessage);
    messages.push({ role: "assistant", content: finalMessage });

    if (finalUsage) {
      const totalTokens =
        (finalUsage.prompt_tokens || 0) + (finalUsage.completion_tokens || 0);
      els.tokenInfo.textContent = `Tokens: ${totalTokens}`;
    }
  } catch (err) {
    console.error(err);
    updateLastAssistantBubble(
      "Sorry, something went wrong while generating the answer. Please try again."
    );
  } finally {
    els.sendButton.disabled = false;
    els.userInput.placeholder =
      "Ask Nira AI anything about your studies...";
  }
}

/* ------------------------ New chat ------------------------ */

function resetConversation() {
  messages = [SYSTEM_MESSAGE];
  els.chatWindow.innerHTML = "";
  els.tokenInfo.textContent = "Tokens: 0";
  appendMessage(
    "assistant",
    "New chat started ✅. Ask me any study question (school, college, IT, UPSC, etc.)."
  );
}

/* ------------------------ Event bindings ------------------------ */

els.modelSelect.addEventListener("change", () => {
  const next = MODEL_CONFIGS.find((m) => m.id === els.modelSelect.value);
  selectedModel = next || MODEL_CONFIGS[0];
  updateModelMeta();
});

els.startButton.addEventListener("click", () => {
  startNira();
});

els.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.userInput.value;
  if (text.trim().length === 0) return;
  sendMessage(text);
});

els.quickChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const prompt = chip.getAttribute("data-prompt") || "";
    els.userInput.value = prompt;
    els.userInput.focus();
  });
});

els.newChatButton.addEventListener("click", () => {
  resetConversation();
});

/* Privacy modal */
function openPrivacyModal() {
  els.modalBackdrop.classList.remove("hidden");
  els.privacyModal.classList.remove("hidden");
}
function closePrivacyModal() {
  els.modalBackdrop.classList.add("hidden");
  els.privacyModal.classList.add("hidden");
}
els.openPrivacy.addEventListener("click", openPrivacyModal);
els.closePrivacy.addEventListener("click", closePrivacyModal);
els.modalBackdrop.addEventListener("click", closePrivacyModal);

/* ------------------------ Bootstrap ------------------------ */

initModelDropdown();
resetConversation();
