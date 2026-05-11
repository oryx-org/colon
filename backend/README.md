# ⚡ Backend — Electron Main Process

> **Tech**: Electron 39 + Node.js 22 + node-pty + Manim CE  
> **Role**: Everything the user doesn't see — the Electron main process

---

## What This Service Does

The backend is the Electron **main process**. It's a Node.js process that:

1. Creates the application window and loads the React frontend
2. Provides a secure IPC bridge (`preload.js`) between React and Node.js
3. Reads, writes, and manages files on the local filesystem
4. Runs user code via PTY terminal using locally installed runtimes
5. Detects system runtimes and provides one-click installation
6. Calls the LLM API (Gemini via Cloudflare proxy) for Manim script generation
7. Runs Manim locally to render MP4 animation videos
8. Manages real terminal sessions via node-pty (multi-tab)
9. Hosts a Language Server Protocol WebSocket server for code intelligence

**The frontend NEVER talks to the OS directly. ALL system access goes through IPC.**

---

## Folder Structure

```
backend/
├── main.js                       # Entry point: window, protocol, IPC registration
├── preload.js                    # Security bridge: exposes electronAPI to React
│
├── ipc/                          # Modular IPC handler modules
│   ├── fileSystemHandlers.js     # File CRUD, dialogs
│   ├── searchHandlers.js         # Workspace-wide find & replace
│   ├── terminalHandlers.js       # PTY terminal lifecycle
│   ├── environmentHandlers.js    # Runtime scanning, install, code run, linting
│   ├── animationHandlers.js      # Block animations, Manim videos, engine status
│   └── windowHandlers.js         # Minimize, maximize, close, new window
│
├── services/                     # Business logic (no IPC awareness)
│   ├── llmService.js             # Multi-provider LLM (Gemini proxy, Groq, Anthropic, OpenAI)
│   ├── manimService.js           # LLM → Manim script → video rendering pipeline
│   ├── scriptValidator.js        # AST-level security validation
│   ├── envScanner.js             # Cross-platform runtime detection (PATH scanning)
│   ├── codeRunner.js             # Code execution with timeout support
│   ├── animEngineService.js      # Python/Manim/FFmpeg environment management
│   ├── animationGenerator.js     # Block-level animation generation via LLM
│   ├── blockDetectorUniversal.js # Language-agnostic syntax block detection
│   ├── linterService.js          # Code linting
│   └── lspServer.js              # Language Server Protocol WebSocket server
│
├── tests/                        # Node.js test runner test suite
│   ├── manimService.test.js      # Manim pipeline tests
│   ├── scriptValidator.test.js   # Security validation tests
│   └── security.test.js          # Path jail + import security tests
│
├── build/
│   └── icon.png                  # Application icon (512x512)
├── .env                          # LLM configuration (gitignored)
├── .env.example                  # Template for .env
└── package.json                  # Dependencies + electron-builder config
```

---

## Architecture: Thin Orchestrator Pattern

`main.js` is a thin orchestrator (~170 lines) that:

1. Registers the `colon-media://` custom protocol for secure video serving
2. Creates the BrowserWindow with strict security settings
3. Delegates all IPC handling to modular handler files in `ipc/`
4. Starts the LSP WebSocket server on `127.0.0.1:3001`
5. Cleans up PTY processes and LSP server on app quit

```javascript
// Simplified main.js pattern
const { registerFileSystemHandlers } = require('./ipc/fileSystemHandlers');
const { registerTerminalHandlers }   = require('./ipc/terminalHandlers');
const { registerAnimationHandlers }  = require('./ipc/animationHandlers');
// ... etc

registerFileSystemHandlers(sharedContext);
registerTerminalHandlers(sharedContext);
registerAnimationHandlers();
```

---

## IPC Handler Modules

Each module in `ipc/` registers its own `ipcMain.handle()` and `ipcMain.on()` listeners:

| Module | IPC Channels | Purpose |
|--------|-------------|---------|
| `fileSystemHandlers.js` | `fs:*`, `dialog:*` | File CRUD, folder/file dialogs |
| `searchHandlers.js` | `search:*` | Full-text search and replace across workspace |
| `terminalHandlers.js` | `terminal-*` | PTY terminal create, input, resize, kill |
| `environmentHandlers.js` | `env:*`, `code:*` | Runtime scanning, install, code run, linting |
| `animationHandlers.js` | `animation:*`, `manim:*`, `animEngine:*` | LLM animations, Manim videos, engine status |
| `windowHandlers.js` | `window-*` | Minimize, maximize, close, new window |

---

## Service Layer

Services contain pure business logic with no IPC awareness. They are imported by IPC handlers:

| Service | Purpose |
|---------|---------|
| `llmService.js` | Unified `chatCompletion()` interface for 4 LLM providers |
| `manimService.js` | Full pipeline: LLM → validate → render → MP4 |
| `scriptValidator.js` | Import allowlist, dangerous patterns, banned objects |
| `envScanner.js` | Scan PATH for Python, Node, GCC, etc. across all platforms |
| `codeRunner.js` | Build run commands with proper timeout handling |
| `animEngineService.js` | Detect/install Python + Manim + FFmpeg |
| `animationGenerator.js` | Block-level animation generation via LLM |
| `blockDetectorUniversal.js` | Detect functions, loops, classes in 10+ languages |
| `lspServer.js` | WebSocket server bridging Monaco to pyright/tsserver |

---

## How to Run

```bash
cd backend

# Development (starts Vite + Electron together)
npm run dev

# Run tests (36 tests: security, validation, pipeline)
npm test

# Build installers
npm run package:win    # Windows .exe
npm run package:linux  # Linux .AppImage + .deb
npm run package:mac    # macOS .dmg
```

---

## Security Rules

1. `contextIsolation: true` — React cannot access Node.js directly
2. `nodeIntegration: false` — No `require()` in the renderer
3. Filesystem jail via `isPathWithinWorkspace()` — all file ops stay within workspace
4. AST-level script validation before executing any LLM-generated code
5. Custom `colon-media://` protocol — no raw `file://` access from UI
6. LSP server bound to `127.0.0.1` with per-session token authentication
7. Code execution: 30s timeout; Manim rendering: 120s timeout
8. Gemini API key stored server-side in Cloudflare Worker, never shipped in binary
