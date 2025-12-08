// Nira AI – WebLLM front-end

import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const modelSelect = document.getElementById("modelSelect");
const modelInfo = document.getElementById("modelInfo");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const startButton = document.getElementById("startButton");

const systemBanner = document.getElementById("systemBanner");
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendButton");
const tokenInfo = document.getElementById("tokenInfo");

const privacyButton = document.getElementById("privacyButton");
const privacyOverlay = document.getElementById("privacyOverlay");
const closePrivacy = document.getElementById("closePrivacy");

/**
 * Curated list of small-ish models we know work with WebLLM
 * and that you actually saw in the dropdown earlier.
 * Sizes are rough but good enough for display.
 */
const NIRA_MODELS = [
  {
    id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    label: "SmolLM 360M – Ultra Lite",
    sizeMB: 350
  },
  {
    id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
    label: "TinyLlama 1.1B – Fast (Lite)",
    sizeMB: 650
  },
  {
    id: "Phi-3-mini-4k-instruct-q4f16_1-MLC-1k",
    label: "Phi-3 Mini – Balanced",
    sizeMB: 1200
  }
];

const SYSTEM_PROMPT =
  "You are Nira AI, a friendly study assistant for Indian students. " +
  "Explain concepts clearly in simple language. Support school, college, " +
  "IT/coding and competitive exam topics. Use step-by-step explanations, " +
  "examples, and exam-oriented tips. Avoid adult content, violence or " +
  "anything not suitable for students.";

let engine = null;
let chatHistory = [];
let totalTokens = 0;
let currentModelId = null;

/* -------------------- Helpers -------------------- */

function showSystemBanner(text) {
  systemBanner.textContent = text;
  systemBanner.classList.remove("hidden");
}

function hideSystemBanner() {
  systemBanner.classList.add("hidden");
}

function resetChat() {
  chatHistory = [{ role: "system", content: SYSTEM_PROMPT }];
  chatWindow.innerHTML = "";
  totalTokens = 0;
  tokenInfo.textContent = "Tokens: 0 · Model: –";
  hideSystemBanner();
}

function appendMessage(sender, content, type) {
  const msg = document.createElement("div");
  msg.className = `message ${type}`;
  const senderSpan = document.createElement("span");
  senderSpan.className = "sender";
  senderSpan.textContent = sender;
  msg.appendChild(senderSpan);

  const body = document.createElement("div");
  body.textContent = content;
  msg.appendChild(body);

  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function modelMetaById(id) {
  return NIRA_MODELS.find((m) => m.id === id) || null;
}

function shortLabelFromId(id) {
  const meta = modelMetaById(id);
  return meta ? meta.label : id || "–";
}

function updateModelInfoFromSelect() {
  const opt = modelSelect.options[modelSelect.selectedIndex];
  if (!opt) {
    modelInfo.textContent = "Approx. size: –";
    return;
  }
  const mbStr = opt.getAttribute("data-size-mb");
  if (mbStr) {
    modelInfo.textContent = `Approx. size: ~${mbStr} MB`;
  } else {
    modelInfo.textContent = "Approx. size: –";
  }
}

/* -------------------- Model list init -------------------- */

function initModelList() {
  modelSelect.innerHTML = "";
  NIRA_MODELS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    if (m.sizeMB) {
      opt.setAttribute("data-size-mb", String(m.sizeMB));
    }
    modelSelect.appendChild(opt);
  });

  if (!NIRA_MODELS.length) {
    modelSelect.disabled = true;
    startButton.disabled = true;
    progressText.textContent = "No models configured.";
  } else {
    updateModelInfoFromSelect();
  }
}

/* -------------------- Model loading -------------------- */

async function loadModel(modelId) {
  if (!navigator.gpu) {
    progressText.textContent =
      "WebGPU is not available. Please use latest Chrome / Edge with WebGPU enabled.";
    return;
  }

  startButton.disabled = true;
  modelSelect.disabled = true;
  sendButton.disabled = true;

  progressBar.style.width = "0%";
  progressText.textContent = "Preparing to download model…";

  try {
    engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        const pct = report.progress
          ? Math.round(report.progress * 100)
          : 0;
        const text = report.text || "Downloading model…";
        progressBar.style.width = `${pct}%`;
        progressText.textContent = `${text} (${pct}%)`;
      }
    });

    currentModelId = modelId;
    resetChat();

    progressBar.style.width = "100%";
    progressText.textContent =
      "Model ready ✅. You can start asking questions.";
    sendButton.disabled = false;
    userInput.focus();

    tokenInfo.textContent = `Tokens: 0 · Model: ${shortLabelFromId(
      currentModelId
    )}`;

    showSystemBanner(
      "New chat started ✅. Ask me any study question (school, college, IT, UPSC, etc.)."
    );
  } catch (err) {
    console.error("Failed to load model", err);
    progressBar.style.width = "0%";
    progressText.textContent =
      "Error while downloading the model. Please check your internet connection and try again.";
    startButton.disabled = false;
    modelSelect.disabled = false;
    engine = null;
  }
}

/* -------------------- Chat logic -------------------- */

async function sendMessage(text) {
  if (!engine || !text.trim()) return;

  const userText = text.trim();
  userInput.value = "";
  sendButton.disabled = true;

  chatHistory.push({ role: "user", content: userText });
  appendMessage("You", userText, "user");

  try {
    const reply = await engine.chat.completions.create({
      messages: chatHistory,
      temperature: 0.7,
      max_tokens: 512
    });

    const choice = reply.choices?.[0]?.message;
    const assistantText = choice?.content || "Sorry, I couldn't respond.";

    chatHistory.push({ role: "assistant", content: assistantText });
    appendMessage("Nira AI", assistantText, "bot");

    const used = reply.usage?.total_tokens;
    if (typeof used === "number") {
      totalTokens += used;
      tokenInfo.textContent = `Tokens: ${totalTokens} · Model: ${shortLabelFromId(
        currentModelId
      )}`;
    }
  } catch (err) {
    console.error("Chat error", err);
    appendMessage(
      "System",
      "Something went wrong while talking to Nira AI. Please try again.",
      "bot"
    );
  } finally {
    sendButton.disabled = false;
    userInput.focus();
  }
}

/* -------------------- Events -------------------- */

modelSelect.addEventListener("change", () => {
  updateModelInfoFromSelect();
});

startButton.addEventListener("click", async () => {
  if (!modelSelect.value) return;
  await loadModel(modelSelect.value);
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!engine) return;
  const text = userInput.value;
  if (!text.trim()) return;
  sendMessage(text);
});

// Quick topics just pre-fill the input
document.querySelectorAll(".quick-topics .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const label = chip.textContent || "";
    let example = "";
    if (label.includes("School"))
      example = "Explain photosynthesis in simple steps.";
    else if (label.includes("College"))
      example = "Give me important topics in contract law for exams.";
    else if (label.includes("IT"))
      example = "Explain what is a for loop in Python with examples.";
    else if (label.includes("UPSC"))
      example = "Give a short note on Indian federalism for UPSC prelims.";
    userInput.value = example;
    userInput.focus();
  });
});

/* Privacy modal */
privacyButton.addEventListener("click", () => {
  privacyOverlay.classList.remove("hidden");
});
closePrivacy.addEventListener("click", () => {
  privacyOverlay.classList.add("hidden");
});
privacyOverlay.addEventListener("click", (e) => {
  if (e.target === privacyOverlay) {
    privacyOverlay.classList.add("hidden");
  }
});

/* -------------------- Init -------------------- */

initModelList();
resetChat();
showSystemBanner(
  "Click “Start Nira AI” to download an on-device model. Internet is used only to fetch model files, not your chats."
);
