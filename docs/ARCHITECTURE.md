# 🏗️ System Architecture — Colon Desktop

---

## 1. High-Level Architecture

Unlike a web app (client → server → render), **everything runs locally** on the user's machine. The only external call is to the LLM API for code analysis.

```
┌──────────────────────────────────────────────────────────────┐
│                    ELECTRON APPLICATION                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │           RENDERER PROCESS (React + Vite)             │    │
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
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │    │
│  │  │ File System   │  │ Code Runner  │  │ Language    │ │    │
│  │  │ Service       │  │ Service      │  │ Manager     │ │    │
│  │  │ (fs.promises) │  │(child_process│  │ (download   │ │    │
│  │  │               │  │  .spawn)     │  │  +install)  │ │    │
│  │  └──────────────┘  └──────┬───────┘  └──────┬──────┘ │    │
│  │                           │                  │        │    │
│  │  ┌──────────────┐  ┌─────▼────────┐  ┌─────▼──────┐ │    │
│  │  │ Terminal      │  │ Manim        │  │ Compiler   │ │    │
│  │  │ Service       │  │ Renderer     │  │ Store      │ │    │
│  │  │ (node-pty)    │  │ (subprocess) │  │ (local dir)│ │    │
│  │  └──────────────┘  └──────┬───────┘  └────────────┘ │    │
│  │                           │                           │    │
│  └───────────────────────────┼───────────────────────────┘    │
└──────────────────────────────┼────────────────────────────────┘
                               │ HTTPS (only external call)
                        ┌──────▼──────┐
                        │  LLM API    │
                        │ (Gemini /   │
                        │  GPT-4o)    │
                        └─────────────┘
```

---

## 2. How "Analyze" Works (End-to-End Flow)

```
Step 1: User writes code in Monaco Editor
    │
Step 2: User clicks "Analyze"
    │
Step 3: Renderer sends code to Main Process via IPC
    │   ipcRenderer.invoke('analyze:code', { code, language })
    │
Step 4: Main Process calls LLM API
    │   POST https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash
    │   Body: system prompt + user code
    │   Response: Manim Python script
    │
Step 5: Main Process validates the script
    │   - Parse with Python AST
    │   - Check for blocked imports (os, sys, subprocess)
    │   - Verify Scene class exists
    │
Step 6: Main Process writes script to temp file
    │   /tmp/Colon_abc123/animation.py
    │
Step 7: Main Process runs Manim locally
    │   spawn('manim', ['animation.py', 'SceneName', '-ql', '-o', 'output.mp4'])
    │   Sends progress updates to Renderer via IPC
    │
Step 8: Manim finishes → MP4 file on disk
    │   /tmp/Colon_abc123/output.mp4
    │
Step 9: Main Process sends file path to Renderer
    │   ipcRenderer receives 'analyze:complete' event
    │
Step 10: Video Player loads local MP4 file → auto-plays
```

---

## 3. How "Run" Works (Code Execution)

```
Step 1: User clicks "Run"
    │
Step 2: Renderer sends code + language to Main Process via IPC
    │
Step 3: Main Process reads compiler config
    │   compilers.json: { "python": "/app/compilers/python/python3", ... }
    │
Step 4: Compile (if needed)
    │   C++: spawn(g++, ['file.cpp', '-o', 'output'])
    │   Java: spawn(javac, ['Main.java'])
    │
Step 5: Execute
    │   Python: spawn(python3, ['file.py'])
    │   C++: spawn('./output')
    │   Java: spawn(java, ['-cp', '.', 'Main'])
    │
Step 6: Capture stdout/stderr → send to Renderer
    │   Output appears in terminal panel
    │
Step 7: Process exits → show exit code
```

---

## 4. Folder Structure

```
Colon/
├── backend/                      # Electron Main Process
│   ├── main.js                   # App entry, window creation
│   ├── preload.js                # IPC bridge (security)
│   ├── services/
│   │   ├── animEngineService.js  # Animation engine installation & check
│   │   ├── animationGenerator.js # Frame-based code execution animation
│   │   ├── blockDetectorUniversal.js # Syntax block detection
│   │   ├── codeRunner.js         # Compile & run user code
│   │   ├── envScanner.js         # Robust environment/runtime scanner
│   │   ├── linterService.js      # Code linting
│   │   ├── llmService.js         # Call Gemini/GPT/Anthropic API
│   │   ├── lspServer.js          # Language Server Protocol logic
│   │   └── manimService.js       # Validate scripts & Run Manim locally
│   ├── config/
│   │   ├── compilers.json        # Installed compiler paths
│   │   └── languages.json        # Available languages + download URLs
│   ├── package.json
│   └── electron-builder.yml
│
├── frontend/                     # React Renderer Process
│   ├── src/
│   │   ├── components/
│   │   │   ├── FileExplorer/     # Left panel
│   │   │   ├── Editor/           # Middle panel (Monaco)
│   │   │   ├── AnimationPanel/   # Right panel (video + explanation)
│   │   │   ├── Terminal/         # Bottom panel (xterm.js)
│   │   │   ├── LanguageManager/  # Settings: install languages
│   │   │   └── Layout/           # Shell, header, panels
│   │   ├── pages/
│   │   │   ├── IDEPage.jsx       # Main IDE layout
│   │   │   └── SettingsPage.jsx  # Language Manager + preferences
│   │   ├── hooks/
│   │   ├── services/
│   │   └── styles/
│   ├── package.json
│   └── vite.config.js
│
├── docs/                         # This documentation
├── .gitignore
└── package.json                  # Root workspace scripts
```

---

## 5. IPC Communication Map

All communication between the React UI (Renderer) and Node.js (Main) goes through IPC:

| Channel | Direction | Purpose |
|---|---|---|
| `fs:readDir` | Renderer → Main | Read directory contents |
| `fs:readFile` | Renderer → Main | Read file content |
| `fs:writeFile` | Renderer → Main | Save file |
| `fs:watchDir` | Main → Renderer | File system change notifications |
| `dialog:openFolder` | Renderer → Main | Open folder picker dialog |
| `code:run` | Renderer → Main | Run user code |
| `code:output` | Main → Renderer | Stdout/stderr stream |
| `code:exit` | Main → Renderer | Process exit code |
| `analyze:code` | Renderer → Main | Send code for animation |
| `analyze:progress` | Main → Renderer | Render progress (0-100%) |
| `analyze:complete` | Main → Renderer | Video file path |
| `analyze:error` | Main → Renderer | Error message |
| `lang:list` | Renderer → Main | Get installed languages |
| `lang:install` | Renderer → Main | Download a language |
| `lang:progress` | Main → Renderer | Download progress |
| `lang:remove` | Renderer → Main | Uninstall a language |
| `terminal:create` | Renderer → Main | Spawn terminal shell |
| `terminal:input` | Renderer → Main | User keystrokes |
| `terminal:data` | Main → Renderer | Terminal output |

---

## 6. Data Storage (Local — No Database Server)

| Data | Storage | Location |
|---|---|---|
| User preferences | `electron-store` | `~/.config/Colon/config.json` |
| Installed compilers | JSON file | `~/.Colon/compilers/compilers.json` |
| Compiler binaries | Local filesystem | `~/.Colon/compilers/{language}/` |
| Generated videos | Temp directory | OS temp dir, cleaned on exit |
| Recent projects | `electron-store` | `~/.config/Colon/config.json` |

**No MongoDB, no Redis, no server needed for the desktop app.**

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
│     - AST parsing before execution       │
│     - Whitelist: manim, math only        │
│     - Block: os, sys, subprocess         │
│                                          │
│  4. CODE EXECUTION LIMITS                │
│     - Timeout: 30 seconds                │
│     - Kill process if exceeds limit      │
│                                          │
│  5. LLM API KEY                          │
│     - Stored in OS keychain              │
│     - Never exposed to renderer          │
└──────────────────────────────────────────┘
```
