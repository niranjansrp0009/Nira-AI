import * as webllm from "https://esm.run/@mlc-ai/web-llm";

/*************** WebLLM logic ***************/

// System prompt specialised for education
const messages = [
  {
    role: "system",
    content:
      "You are Nira AI, a friendly Indian study assistant. Your job is to explain concepts clearly for: " +
      "1) school students (classes 6–12, CBSE/State board), 2) college students, 3) IT / coding learners, " +
      "4) UPSC and other government exam aspirants, and 5) other competitive exam students. " +
      "Always explain step by step using very simple language. When a topic is from maths, show worked examples. " +
      "When a topic is from science or economics, give definitions, key points and real examples from India if relevant. " +
      "If the user message is not about studies, answer briefly and bring them back to education or personal growth. " +
      "You can reply in English and also understand common Indian English phrases."
  }
];

const availableModels = webllm.prebuiltAppConfig.model_list.map((m) => m.model_id);

// Use the same default model as the official simple-chat example
let selectedModel = "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC-1k";

// Callback function for initializing progress
function updateEngineInitProgressCallback(report) {
  console.log("initialize", report.progress, report.text);
  const status = document.getElementById("download-status");
  if (status) {
    status.textContent = report.text;
  }
}

// Create engine instance
const engine = new webllm.MLCEngine();
engine.setInitProgressCallback(updateEngineInitProgressCallback);

async function initializeWebLLMEngine() {
  const downloadButton = document.getElementById("download");
  const sendButton = document.getElementById("send");
  const status = document.getElementById("download-status");

  if (downloadButton) downloadButton.disabled = true;
  if (sendButton) sendButton.disabled = true;

  if (status) {
    status.classList.remove("hidden");
    status.textContent = "Starting download of free study model. Please wait...";
  }

  selectedModel = document.getElementById("model-selection").value || selectedModel;
  const config = {
    temperature: 0.7,
    top_p: 0.9
  };
  await engine.reload(selectedModel, config);

  if (status) {
    status.textContent =
      "Model is ready! Now you can chat with Nira AI. First answer may still take a few seconds.";
  }
  if (sendButton) sendButton.disabled = false;
  if (downloadButton) downloadButton.disabled = false;
}

async function streamingGenerating(messages, onUpdate, onFinish, onError) {
  try {
    let curMessage = "";
    const completion = await engine.chat.completions.create({
      stream: true,
      messages
    });
    for await (const chunk of completion) {
      const curDelta = chunk.choices[0].delta.content;
      if (curDelta) {
        curMessage += curDelta;
      }
      onUpdate(curMessage);
    }
    const finalMessage = await engine.getMessage();
    onFinish(finalMessage);
  } catch (err) {
    onError(err);
  }
}

/*************** UI logic ***************/

function appendMessage(message) {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return;

  const container = document.createElement("div");
  container.classList.add("message-container");
  const newMessage = document.createElement("div");
  newMessage.classList.add("message");
  newMessage.textContent = message.content;

  if (message.role === "user") {
    container.classList.add("user");
  } else {
    container.classList.add("assistant");
  }

  container.appendChild(newMessage);
  chatBox.appendChild(container);
  chatBox.scrollTop = chatBox.scrollHeight; // Scroll to latest message
}

function updateLastMessage(content) {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return;
  const messageDoms = chatBox.querySelectorAll(".message");
  const lastMessageDom = messageDoms[messageDoms.length - 1];
  if (!lastMessageDom) return;
  lastMessageDom.textContent = content;
}

function onMessageSend() {
  const inputEl = document.getElementById("user-input");
  const sendButton = document.getElementById("send");

  if (!inputEl || !sendButton) return;

  const input = inputEl.value.trim();
  if (input.length === 0) {
    return;
  }

  const message = {
    content: input,
    role: "user"
  };

  sendButton.disabled = true;

  messages.push(message);
  appendMessage(message);
  inputEl.value = "";
  inputEl.setAttribute("placeholder", "Nira AI is thinking...");

  const aiMessage = {
    content: "typing...",
    role: "assistant"
  };
  appendMessage(aiMessage);

  const onFinishGenerating = (finalMessage) => {
    updateLastMessage(finalMessage);
    sendButton.disabled = false;
    inputEl.setAttribute("placeholder", "Ask Nira AI anything about your studies...");
    engine.runtimeStatsText().then((statsText) => {
      const statsEl = document.getElementById("chat-stats");
      if (statsEl) {
        statsEl.classList.remove("hidden");
        statsEl.textContent = statsText;
      }
    });
  };

  streamingGenerating(messages, updateLastMessage, onFinishGenerating, (err) => {
    console.error(err);
    updateLastMessage("Sorry, something went wrong inside the local model. Please try again.");
    sendButton.disabled = false;
  });
}

/*************** Bindings ***************/

function setupModelDropdown() {
  const select = document.getElementById("model-selection");
  if (!select) return;

  availableModels.forEach((modelId) => {
    const option = document.createElement("option");
    option.value = modelId;
    option.textContent = modelId;
    select.appendChild(option);
  });
  // If default model exists in list, select it, otherwise keep first one
  if (availableModels.includes(selectedModel)) {
    select.value = selectedModel;
  }
}

function setupQuickChips() {
  const chips = document.querySelectorAll(".chip");
  const inputEl = document.getElementById("user-input");
  if (!chips || !inputEl) return;

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const prompt = chip.getAttribute("data-prompt") || "";
      inputEl.value = prompt;
      inputEl.focus();
      inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    });
  });
}

function main() {
  setupModelDropdown();
  setupQuickChips();

  const downloadButton = document.getElementById("download");
  const sendButton = document.getElementById("send");
  const inputEl = document.getElementById("user-input");

  if (downloadButton) {
    downloadButton.addEventListener("click", () => {
      initializeWebLLMEngine();
    });
  }

  if (sendButton) {
    sendButton.disabled = true;
    sendButton.addEventListener("click", () => onMessageSend());
  }

  if (inputEl) {
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onMessageSend();
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", main);
