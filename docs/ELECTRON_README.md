# ⚡ Electron (Main Process) README

---

## Overview

The Electron main process is the **brain** of the desktop app. It handles:
- File system access (read/write user files)
- Code compilation and execution (via child_process)
- Language Manager (download/install compilers)
- Manim rendering (run Manim locally)
- LLM API calls (send code to Gemini/GPT)
- Terminal emulation (node-pty)
- All IPC communication with the React renderer

---

## Folder Structure

```
backend/
├── main.js                     # App entry: window creation, IPC registration
├── preload.js                  # Security bridge: exposes electronAPI to renderer
├── services/
│   ├── fileSystem.js           # fs:readDir, fs:readFile, fs:writeFile, fs:watchDir
│   ├── codeRunner.js           # code:run, code:kill — compile + execute code
│   ├── languageManager.js      # lang:list, lang:install, lang:remove
│   ├── manimRenderer.js        # analyze:code — LLM + Manim pipeline
│   ├── terminalService.js      # terminal:create, terminal:input, terminal:data
│   ├── llmClient.js            # Call Gemini/GPT API
│   └── scriptValidator.js      # Validate Manim scripts (security)
├── config/
│   └── languages.json          # Fallback language registry
├── package.json
└── electron-builder.yml
```

---

## How to Register All Services

```javascript
// backend/main.js
const { app, BrowserWindow } = require('electron');
const { registerFileSystemIPC } = require('./services/fileSystem');
const { registerCodeRunnerIPC } = require('./services/codeRunner');
const { registerLanguageManagerIPC } = require('./services/languageManager');
const { registerManimIPC } = require('./services/manimRenderer');
const { registerTerminalIPC } = require('./services/terminalService');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({ /* ... config ... */ });

  // Register all IPC services
  registerFileSystemIPC(mainWindow);
  registerCodeRunnerIPC(mainWindow);
  registerLanguageManagerIPC(mainWindow);
  registerManimIPC(mainWindow);
  registerTerminalIPC(mainWindow);

  // Load React
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile('../frontend/dist/index.html');
  }
}

app.whenReady().then(createWindow);
```

---

## Key Principle: Renderer NEVER Accesses Node.js Directly

```
❌ WRONG:  React component calls require('fs')
✅ RIGHT:  React component calls window.electronAPI.readFile()
           → preload.js forwards via IPC
           → main.js handles and returns result
```

This is Electron's **context isolation** security model. All Node.js power is in main.js; the React renderer only sees the safe API exposed by preload.js.

---

## Quick Start

```bash
cd backend
npm install
npm run dev       # Opens Electron with React HMR
```
