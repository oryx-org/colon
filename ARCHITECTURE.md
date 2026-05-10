# Colon IDE — Architecture Document

## System Overview

Colon is a two-tier local Electron application with strict process isolation between the **main process** (backend) and **renderer process** (frontend).

```
┌──────────────────────────────────────────────────┐
│                  Renderer Process                 │
│  ┌─────────────┐  ┌──────────┐  ┌─────────────┐ │
│  │  Code Editor │  │ Terminal  │  │ Animation   │ │
│  │  (Monaco)    │  │ (xterm)   │  │ Player      │ │
│  └──────┬───────┘  └────┬─────┘  └──────┬──────┘ │
│         │               │               │        │
│  ┌──────┴───────────────┴───────────────┴──────┐ │
│  │           window.electronAPI                 │ │
│  │         (preload.js IPC Bridge)              │ │
│  └──────────────────┬──────────────────────────┘ │
└─────────────────────┼────────────────────────────┘
                      │ IPC (contextBridge)
┌─────────────────────┼────────────────────────────┐
│                Main Process                       │
│  ┌──────────────────┴──────────────────────────┐ │
│  │              main.js (Orchestrator)          │ │
│  └─┬────┬────┬────┬────┬────┬──────────────────┘ │
│    │    │    │    │    │    │                     │
│  ┌─┴──┐│  ┌─┴──┐│  ┌─┴──┐│                     │
│  │FS  ││  │Term││  │Anim││  IPC Handler Modules │
│  │Hdlr││  │Hdlr││  │Hdlr││  (ipc/*.js)          │
│  └─┬──┘│  └─┬──┘│  └─┬──┘│                     │
│    │   │    │   │    │   │                      │
│  ┌─┴───┴────┴───┴────┴───┴──────────────────┐  │
│  │           Service Layer                    │  │
│  │  envScanner · manimService · codeRunner    │  │
│  │  scriptValidator · llmService · linter     │  │
│  │  animEngineService · lspServer             │  │
│  └───────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## IPC Handler Modules

| Module | File | IPC Channels |
|---|---|---|
| File System | `ipc/fileSystemHandlers.js` | `dialog:open*`, `fs:read*`, `fs:write*`, `fs:delete`, `fs:rename`, `fs:create*` |
| Search | `ipc/searchHandlers.js` | `search:inFiles`, `search:replaceInFiles` |
| Terminal | `ipc/terminalHandlers.js` | `terminal-create`, `terminal-input`, `terminal-resize`, `terminal-kill` |
| Environment | `ipc/environmentHandlers.js` | `env:scan`, `env:get`, `env:install*`, `code:run`, `code:kill`, `code:lint` |
| Animation | `ipc/animationHandlers.js` | `animation:*`, `manim:*`, `animEngine:*` |
| Window | `ipc/windowHandlers.js` | `window-control`, `window-new` |

## Service Layer

| Service | Responsibility | Key Exports |
|---|---|---|
| `envScanner.js` | Cross-platform runtime detection and PATH resolution | `scanEnvironments()`, `createRuntimeEnv()` |
| `manimService.js` | LLM prompt → Manim script → video rendering pipeline | `generateManimVideo()`, `loadManimVideos()` |
| `scriptValidator.js` | AST-level security validation for generated scripts | `validateManimScript()`, `validateImports()` |
| `codeRunner.js` | Code execution with 30s timeout and output streaming | `runCode()`, `getRunConfig()` |
| `llmService.js` | Multi-provider LLM integration (Gemini, Groq) | `callLlm()`, `isConfigured()` |
| `animEngineService.js` | Manim/FFmpeg environment verification and installation | `checkAnimEngine()`, `installAnimEngine()` |
| `linterService.js` | Code linting for multiple languages | `lintCode()` |
| `lspServer.js` | Language Server Protocol server management | `startLspServer()`, `getLspToken()` |

## Security Architecture

### Threat Model

The primary threat vectors are:
1. **LLM-generated malicious code** — The LLM could generate Manim scripts that import dangerous modules or execute arbitrary commands
2. **Path traversal** — The renderer could attempt to read/write files outside the workspace
3. **Protocol abuse** — Direct `file://` access from the renderer

### Mitigations

| Threat | Mitigation | Implementation |
|---|---|---|
| Malicious imports | Import allowlist/blocklist | `scriptValidator.js` — `ALLOWED_PYTHON_IMPORTS`, `BLOCKED_PYTHON_IMPORTS` |
| Dangerous function calls | Pattern detection | `scriptValidator.js` — `DANGEROUS_PATTERNS` (eval, exec, subprocess, etc.) |
| Banned Manim objects | Object blocklist | `scriptValidator.js` — `BLOCKED_MANIM_OBJECTS` (MathTex, SVGMobject, etc.) |
| Path traversal | Workspace jail | `isPathWithinWorkspace()` in main.js |
| File protocol abuse | Custom protocol | `colon-media://` registered via `protocol.handle()` |
| Process isolation | Electron security | `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true` |

### Timeout Enforcement

| Operation | Timeout | Implementation |
|---|---|---|
| Code execution | 30 seconds | `codeRunner.js` — `spawn({ timeout: 30000 })` |
| Manim rendering | 120 seconds | `manimService.js` — `setTimeout` on child process |
| Compilation | 30 seconds | `codeRunner.js` — `spawn({ timeout: 30000 })` |

## Data Flow: Animation Pipeline

```
User Code → LLM Prompt → Gemini/Groq API → Manim Script
    → scriptValidator.validateManimScript()  [SECURITY GATE]
    → Python subprocess (manim render)
    → MP4 file validation (duration + size check)
    → Cache in .colon/manim/<hash>/
    → Serve via colon-media:// protocol
    → <video> element in AnimationTab
```

## Future Roadmap

| Feature | Module | Status |
|---|---|---|
| GIF Export | `services/gifExporter.js` | Planned (v2.0) |
| Code-to-Video Scrubber | `services/videoScrubber.js` | Planned (v2.0) |
| GitHub Gist Sharing | `services/gistSharing.js` | Planned (v2.0) |
