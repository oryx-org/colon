# 🏗️ System Architecture — Colon Desktop

---

## 1. High-Level Architecture

Everything runs locally on the user's machine. The only external call is to the Cloudflare Worker proxy which forwards requests to the Gemini API (keeping the API key server-side).

```
┌──────────────────────────────────────────────────────────────┐
│                    ELECTRON APPLICATION                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │           RENDERER PROCESS (React + Vite + TypeScript)│    │
│  │                                                       │    │
│  │  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │    │
│  │  │ File   │ │ Monaco   │ │ Video    │ │ Terminal  │ │    │
│  │  │Explorer│ │ Editor   │ │ Player   │ │ (xterm.js)│ │    │
│  │  └───┬────┘ └────┬─────┘ └────▲─────┘ └─────┬─────┘ │    │
│  │      │           │            │              │        │    │
│  │      └───────────┴──────┬─────┴──────────────┘        │    │
│  │                         │ IPC (contextBridge)         │    │
│  └─────────────────────────┼─────────────────────────────┘    │
│                            │                                  │
│  ┌─────────────────────────▼─────────────────────────────┐    │
│  │           MAIN PROCESS (Node.js)                       │    │
│  │                                                        │    │
│  │  ┌─ IPC Handlers (ipc/*.js) ──────────────────────┐   │    │
│  │  │ fileSystem · search · terminal · environment   │   │    │
│  │  │ animation · window                             │   │    │
│  │  └────────────────────┬───────────────────────────┘   │    │
│  │                       │                                │    │
│  │  ┌─ Service Layer (services/*.js) ────────────────┐   │    │
│  │  │ envScanner · manimService · codeRunner         │   │    │
│  │  │ scriptValidator · llmService · linterService   │   │    │
│  │  │ animEngineService · lspServer                  │   │    │
│  │  │ animationGenerator · blockDetectorUniversal    │   │    │
│  │  └────────────────────┬───────────────────────────┘   │    │
│  │                       │                                │    │
│  └───────────────────────┼────────────────────────────────┘    │
└──────────────────────────┼────────────────────────────────────┘
                           │ HTTPS
                    ┌──────▼───────┐
                    │  Cloudflare  │
                    │  Worker      │──── Gemini API
                    │  (Proxy)     │
                    └──────────────┘
```

---

## 2. How "Analyze" Works (Animation Pipeline)

```
Step 1: User writes code in Monaco Editor
    │
Step 2: User opens Animation Tab and clicks "Generate Video"
    │
Step 3: Renderer sends code + language to Main Process via IPC
    │   ipcRenderer.invoke('manim:generate', { filePath, code, language })
    │
Step 4: Main Process calls LLM via Cloudflare Worker proxy
    │   POST https://colon-llm-proxy.oryx-org.workers.dev
    │   Body: system prompt + user code
    │   Response: Manim Python script
    │
Step 5: Main Process validates the script (SECURITY GATE)
    │   - scriptValidator.validateManimScript()
    │   - Import allowlist check (only manim, math, numpy, etc.)
    │   - Dangerous pattern detection (eval, exec, subprocess, etc.)
    │   - Banned Manim object check (MathTex, SVGMobject, etc.)
    │   - Animation structure validation (self.play() calls required)
    │
Step 6: Main Process writes script to .colon/ cache directory
    │   <workspace>/.colon/manim/<hash>/animation.py
    │
Step 7: Main Process runs Manim locally (120s timeout)
    │   spawn('python', ['-m', 'manim', 'animation.py', 'Scene', '-ql'])
    │
Step 8: Post-render validation
    │   - Check video file exists and has non-zero size
    │   - Verify video duration > 0
    │
Step 9: Serve via colon-media:// custom protocol
    │   Secure protocol restricts access to .colon/ directories only
    │
Step 10: Video Player in AnimationTab loads and plays the MP4
```

---

## 3. How "Run" Works (Code Execution)

```
Step 1: User presses F5 or clicks Run button
    │
Step 2: File is auto-saved if dirty
    │
Step 3: Renderer calls backend for the run command
    │   ipcRenderer.invoke('code:getRunCommand', filePath)
    │
Step 4: Backend checks envScanner for installed runtime
    │   If runtime missing → prompt user for one-click install
    │
Step 5: Backend returns the shell command
    │   e.g., "python3 /path/to/file.py" or "node /path/to/file.js"
    │
Step 6: Command is sent to the active PTY terminal
    │   Terminal (node-pty) executes it natively
    │   stdin, stdout, colors, and user input all work natively
    │
Step 7: User sees output in real-time in the integrated terminal
    │   Ctrl+C interrupts the running process
```

---

## 4. Folder Structure

```
colon/
├── backend/                          # Electron Main Process
│   ├── main.js                       # App entry (~170 lines), window creation, protocol
│   ├── preload.js                    # IPC bridge (contextBridge — security)
│   ├── ipc/                          # Modular IPC handler modules
│   │   ├── fileSystemHandlers.js     # fs:read*, fs:write*, fs:delete, dialog:*
│   │   ├── searchHandlers.js         # search:inFiles, search:replaceInFiles
│   │   ├── terminalHandlers.js       # terminal-create, terminal-input, terminal-resize
│   │   ├── environmentHandlers.js    # env:scan, env:install*, code:run, code:lint
│   │   ├── animationHandlers.js      # animation:*, manim:*, animEngine:*
│   │   └── windowHandlers.js         # window-control, window-new
│   ├── services/                     # Business logic services
│   │   ├── llmService.js             # Multi-provider LLM (Gemini proxy, Groq, Anthropic, OpenAI)
│   │   ├── manimService.js           # LLM → Manim script → video rendering pipeline
│   │   ├── scriptValidator.js        # AST-level security validation for generated scripts
│   │   ├── animEngineService.js      # Python/Manim/FFmpeg environment management
│   │   ├── animationGenerator.js     # Block-level animation generation
│   │   ├── blockDetectorUniversal.js # Syntax block detection across languages
│   │   ├── envScanner.js             # Cross-platform runtime detection (PATH scanning)
│   │   ├── codeRunner.js             # Code execution with timeout and output streaming
│   │   ├── linterService.js          # Code linting for multiple languages
│   │   ├── lspServer.js              # Language Server Protocol WebSocket server
│   │   ├── gifExporter.js            # [Planned] GIF export from video
│   │   ├── videoScrubber.js          # [Planned] Code-to-video timeline scrubber
│   │   └── gistSharing.js            # [Planned] GitHub Gist sharing
│   ├── tests/                        # Test suite (Node.js test runner)
│   │   ├── manimService.test.js
│   │   ├── scriptValidator.test.js
│   │   └── security.test.js
│   └── build/
│       └── icon.png                  # App icon
│
├── frontend/                         # React Renderer Process
│   ├── src/
│   │   ├── App.tsx                   # Root component with state management
│   │   ├── main.tsx                  # React entry point
│   │   ├── components/
│   │   │   ├── AnimationTab/         # Video player + animation panel
│   │   │   ├── CommandPalette/       # Ctrl+Shift+P quick actions
│   │   │   ├── ExplorerPanel/        # File tree with CRUD operations
│   │   │   ├── FileIcon/             # Language-aware file icons
│   │   │   ├── LanguageManagerPanel/ # Runtime detection + one-click install
│   │   │   ├── MenuBar/              # Custom title bar with menus
│   │   │   ├── RightSidebar/         # Animation tab toggle
│   │   │   ├── SearchPanel/          # Full-text search + replace
│   │   │   ├── SettingsModal/        # Editor preferences
│   │   │   ├── Sidebar/              # Left icon rail (explorer, search, etc.)
│   │   │   ├── StatusBar/            # Bottom bar (language, cursor position)
│   │   │   ├── TerminalPanel/        # xterm.js PTY terminal (multi-tab)
│   │   │   └── Workspace/            # Monaco editor + tab bar
│   │   ├── styles/
│   │   │   └── global.css            # Design system: colors, fonts, reset
│   │   └── utils/
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── colon-proxy/                      # Cloudflare Worker (API key proxy)
│   ├── src/index.js                  # Worker handler with CORS + validation
│   ├── wrangler.toml                 # Wrangler configuration
│   └── package.json
│
├── .github/workflows/
│   ├── ci.yml                        # Test + lint + build on push to main
│   └── release.yml                   # Build installers on tag push (v*)
│
├── docs/                             # Project documentation
├── README.md
└── ARCHITECTURE.md
```

---

## 5. IPC Communication Map

All communication between the React UI (Renderer) and Node.js (Main) goes through `contextBridge` IPC:

| Channel | Direction | Purpose |
|---|---|---|
| `dialog:openDirectory` | Renderer → Main | Open folder picker dialog |
| `dialog:openFile` | Renderer → Main | Open file picker dialog |
| `fs:readDirectory` | Renderer → Main | Read directory contents |
| `fs:readFile` | Renderer → Main | Read file content |
| `fs:writeFile` | Renderer → Main | Save file |
| `fs:delete` | Renderer → Main | Delete file/folder |
| `fs:rename` | Renderer → Main | Rename file/folder |
| `fs:createFile` | Renderer → Main | Create new file |
| `fs:createDirectory` | Renderer → Main | Create new folder |
| `search:inFiles` | Renderer → Main | Full-text search across workspace |
| `search:replaceInFiles` | Renderer → Main | Find and replace across workspace |
| `terminal-create` | Renderer → Main | Spawn PTY terminal |
| `terminal-input` | Renderer → Main | User keystrokes to terminal |
| `terminal-resize` | Renderer → Main | Resize terminal columns/rows |
| `terminal-kill` | Renderer → Main | Kill terminal session |
| `terminal-incoming-data-{id}` | Main → Renderer | Terminal output stream |
| `env:scan` | Renderer → Main | Scan for installed runtimes |
| `env:installRuntime` | Renderer → Main | Install a runtime |
| `code:getRunCommand` | Renderer → Main | Get shell command for file |
| `code:run` | Renderer → Main | Run user code |
| `code:lint` | Renderer → Main | Lint code |
| `animation:generateAnimation` | Renderer → Main | Generate block animation |
| `animation:loadAnimations` | Renderer → Main | Load cached animations |
| `manim:generate` | Renderer → Main | Generate Manim video |
| `manim:loadVideos` | Renderer → Main | Load cached videos |
| `animEngine:check` | Renderer → Main | Check Manim/FFmpeg installed |
| `animEngine:install` | Renderer → Main | Install animation engine |
| `lsp:getToken` | Renderer → Main | Get LSP auth token |
| `window-control` | Renderer → Main | Minimize/maximize/close |

---

## 6. Data Storage (Local — No Database)

| Data | Storage | Location |
|---|---|---|
| User preferences | `localStorage` | Browser storage in Electron |
| LLM config | `.env` file | `backend/.env` |
| Generated videos | Filesystem | `<workspace>/.colon/manim/<hash>/` |
| Animation cache | JSON files | `<workspace>/.colon/animations/` |
| LSP auth token | In-memory | Generated per session via `crypto.randomBytes` |

**No MongoDB, no Redis, no server — this is a fully local desktop application.**

---

## 7. Security Model

```
┌──────────────────────────────────────────┐
│          SECURITY LAYERS                  │
│                                          │
│  1. CONTEXT ISOLATION = true             │
│     Renderer can't access Node.js        │
│     directly. All access via preload.js  │
│                                          │
│  2. NODE INTEGRATION = false             │
│     No require() in renderer             │
│                                          │
│  3. MANIM SCRIPT VALIDATION              │
│     - Import allowlist (manim, math,     │
│       numpy, random, collections, etc.)  │
│     - Import blocklist (os, sys,         │
│       subprocess, socket, pickle, etc.)  │
│     - Dangerous pattern detection        │
│       (eval, exec, __import__, etc.)     │
│     - Banned Manim object detection      │
│       (MathTex, SVGMobject, etc.)        │
│     - Animation structure validation     │
│       (self.play() calls required)       │
│                                          │
│  4. FILESYSTEM PATH JAIL                 │
│     - isPathWithinWorkspace() validates  │
│       all file operations stay within    │
│       the opened workspace directory     │
│                                          │
│  5. CUSTOM VIDEO PROTOCOL                │
│     - colon-media:// serves video files  │
│     - Restricted to .colon/ directories  │
│     - Only .mp4, .webm, .mov allowed     │
│     - No raw file:// access from UI      │
│                                          │
│  6. LSP WEBSOCKET SECURITY               │
│     - Bound to 127.0.0.1 only           │
│     - Token-based authentication         │
│     - Token generated per session        │
│                                          │
│  7. CODE EXECUTION LIMITS                │
│     - Code execution: 30 second timeout  │
│     - Manim rendering: 120 second timeout│
│                                          │
│  8. API KEY PROTECTION                   │
│     - Gemini API key stored server-side  │
│       in Cloudflare Worker secret        │
│     - Never shipped in the Electron app  │
│     - .env file gitignored              │
└──────────────────────────────────────────┘
```
