// Nira AI – WebLLM front-end (single file, ES module)

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

function shortLabelFromId(modelId) {
  if (!modelId) return "–";
  if (modelId.includes("TinyLlama")) return "TinyLlama 1.1B – Fast (Lite)";
  if (modelId.toLowerCase().includes("phi-3")) return "Phi-3 Mini – Balanced";
  if (modelId.toLowerCase().includes("qwen3") || modelId.toLowerCase().includes("qwen2"))
    return "Qwen – Multilingual";
  return modelId;
}

function estimateMb(model) {
  const bytes =
    model.estimated_vram_bytes ??
    model.vram_required_bytes ??
    model.size_in_bytes ??
    null;
  if (!bytes) return null;
  return Math.round(bytes / (1024 * 1024));
}

function friendlyLabel(model) {
  const base = shortLabelFromId(model.model_id);
  const mb = estimateMb(model);
  return mb ? `${base} (~${mb} MB)` : base;
}

function updateModelInfoFromSelect() {
  const option = modelSelect.options[modelSelect.selectedIndex];
  if (!option) {
    modelInfo.textContent = "Approx. size: –";
    return;
  }

  const mbStr = option.getAttribute("data-size-mb");
  if (mbStr) {
    modelInfo.textContent = `Approx. size: ~${mbStr} MB`;
  } else {
    modelInfo.textContent = "Approx. size: unknown";
  }
}

/* -------------------- Model list init -------------------- */

async function initModelList() {
  try {
    const all = webllm.prebuiltAppConfig.model_list || [];

    // Filter to chat/instruct models and sort by size
    const candidates = all
      .filter((m) => {
        const id = m.model_id.toLowerCase();
        return (
          id.includes("chat") ||
          id.includes("instruct") ||
          id.includes("mini")
        );
      })
      .sort((a, b) => (estimateMb(a) || 1e12) - (estimateMb(b) || 1e12));

    const shortlist = candidates.slice(0, 3); // only 3 models on UI

    modelSelect.innerHTML = "";
    shortlist.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.model_id;
      opt.textContent = friendlyLabel(m);
      const mb = estimateMb(m);
      if (mb) opt.setAttribute("data-size-mb", mb.toString());
      modelSelect.appendChild(opt);
    });

    if (!shortlist.length) {
      modelSelect.disabled = true;
      startButton.disabled = true;
      progressText.textContent =
        "No compatible models found in this browser.";
      return;
    }

    updateModelInfoFromSelect();
  } catch (err) {
    console.error("Failed to load model list", err);
    modelSelect.disabled = true;
    startButton.disabled = true;
    progressText.textContent = "Error: cannot load model list.";
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
      },
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
      max_tokens: 512,
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
