# ⚡ Electron (Main Process) README

---

## Overview

The Electron main process is the **brain** of the desktop app. It handles:
- File system access (read/write/rename/delete user files, workspace path jail)
- Code execution (via terminal PTY — node-pty)
- Runtime detection and one-click installation (envScanner)
- Manim rendering (LLM → script validation → Python subprocess)
- LLM API calls (routed through Cloudflare Worker proxy)
- Terminal emulation (node-pty, multi-tab)
- LSP server (WebSocket bridge to pyright, typescript-language-server, gopls, rust-analyzer)
- All IPC communication with the React renderer

---

## Folder Structure

```
backend/
├── main.js                       # App entry: window creation, IPC registration, protocol handler
├── preload.js                    # Security bridge: exposes electronAPI to renderer
├── ipc/                          # Modular IPC handler modules
│   ├── fileSystemHandlers.js     # File CRUD, dialogs
│   ├── searchHandlers.js         # Workspace-wide find & replace
│   ├── terminalHandlers.js       # PTY terminal lifecycle
│   ├── environmentHandlers.js    # Runtime scanning, installation, code execution, linting
│   ├── animationHandlers.js      # Block animations, Manim videos, animation engine
│   └── windowHandlers.js         # Minimize, maximize, close, new window
├── services/
│   ├── llmService.js             # Multi-provider LLM (Gemini proxy, Groq, Anthropic, OpenAI)
│   ├── manimService.js           # LLM → Manim script → video pipeline
│   ├── scriptValidator.js        # AST-level security validation
│   ├── envScanner.js             # Cross-platform runtime detection
│   ├── codeRunner.js             # Code execution with timeout
│   ├── animEngineService.js      # Manim/FFmpeg environment setup
│   ├── animationGenerator.js     # Block-level animation generation
│   ├── blockDetectorUniversal.js # Syntax block detection
│   ├── linterService.js          # Code linting
│   └── lspServer.js              # Language Server Protocol WebSocket server
├── tests/
│   ├── manimService.test.js      # Manim pipeline tests
│   ├── scriptValidator.test.js   # Security validation tests
│   └── security.test.js          # Path jail + import security tests
├── build/
│   └── icon.png                  # Application icon
├── .env                          # LLM configuration (gitignored)
├── .env.example                  # Template for .env
└── package.json                  # Dependencies + electron-builder config
```

---

## Architecture: Thin Orchestrator Pattern

`main.js` is a thin orchestrator (~170 lines) that:
1. Registers the `colon-media://` custom protocol
2. Creates the BrowserWindow with security settings
3. Delegates all IPC handling to modular handler files in `ipc/`
4. Starts the LSP WebSocket server

```javascript
// backend/main.js (simplified)
const { registerFileSystemHandlers } = require('./ipc/fileSystemHandlers');
const { registerSearchHandlers } = require('./ipc/searchHandlers');
const { registerTerminalHandlers } = require('./ipc/terminalHandlers');
const { registerEnvironmentHandlers } = require('./ipc/environmentHandlers');
const { registerAnimationHandlers } = require('./ipc/animationHandlers');
const { registerWindowHandlers } = require('./ipc/windowHandlers');

// Each module registers its own ipcMain.handle() calls
registerFileSystemHandlers(sharedContext);
registerSearchHandlers(sharedContext);
registerTerminalHandlers(sharedContext);
registerEnvironmentHandlers(sharedContext);
registerAnimationHandlers();
registerWindowHandlers(sharedContext);
```

---

## Key Principle: Renderer NEVER Accesses Node.js Directly

```
❌ WRONG:  React component calls require('fs')
✅ RIGHT:  React component calls window.electronAPI.readFile()
           → preload.js forwards via IPC
           → main.js handles via ipc/fileSystemHandlers.js
           → result returned to renderer
```

This is Electron's **context isolation** security model. All Node.js power is in the main process; the React renderer only sees the safe API exposed by `preload.js`.

---

## Quick Start

```bash
cd backend
npm install
npm run dev       # Opens Electron with React HMR from Vite
```
