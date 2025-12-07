Nira AI - WebLLM (No Backend, No API Keys)

This project uses WebLLM (https://github.com/mlc-ai/web-llm) to run a small
open-source language model directly in the user's browser.

Important notes:
- No server and no API keys are needed.
- First time the model is used, it will download model files from WebLLM's
  CDN. This can be a few hundred MB, so recommend Wi‑Fi.
- After download, the model is cached by the browser and future chats are faster.
- Performance depends on the device (RAM + GPU). Low-end phones may be slow.

How to use with GitHub Pages:

1. Create a new **public** GitHub repository, e.g. `nira-ai-webllm`.
2. Download this ZIP file and extract all files.
3. Drag & upload these files into the GitHub repo root (index.html, style.css, app.js, README).
4. Commit the changes.
5. In repo Settings → Pages:
   - Source: "Deploy from a branch"
   - Branch: `main` (or `master`) / root
   - Save.
6. GitHub Pages will give you a URL like:
   https://YOUR-USERNAME.github.io/nira-ai-webllm/

Use this URL inside AppCreator24 as the web app link or WebView for your app.

Usage for users:

1. Open the Nira AI website.
2. At the top-right, choose the default model if needed and click "Start Nira AI".
3. Wait until the status text says the model is ready.
4. Ask any study question in the chat box.

This is a simple starting point you can customize further if you like.
