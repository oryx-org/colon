# Colon IDE

**AI-Powered Desktop IDE with Code Animation**

Colon is a local-first, Electron-based desktop IDE that transforms source code into step-by-step animated video explanations using Manim CE. It combines a full-featured code editor with an AI-driven animation pipeline to help developers visualize and understand code execution.

## Key Features

- **AI Code Animation** — Select any code block and generate visual, step-by-step animation traces powered by LLM
- **Manim Video Generation** — Full-file code visualization rendered as MP4 videos using Manim Community Edition
- **Integrated Terminal** — Built-in PTY terminal with cross-platform shell support
- **Multi-Language Support** — Auto-detect and run Python, Node.js, C/C++, Java, Go, Rust, TypeScript
- **One-Click Runtime Install** — Detect missing runtimes and install them directly from the IDE
- **LSP-Based Editing** — Language Server Protocol integration for intelligent code assistance
- **Code Linting** — Real-time linting feedback for supported languages
- **Full-Text Search** — Search and replace across entire workspace with regex support

## Architecture

```
colon/
├── frontend/              # React + TypeScript UI (Vite)
│   └── src/
│       ├── components/    # Editor, Terminal, AnimationTab, Explorer, etc.
│       └── App.tsx        # Root component with state management
├── backend/
│   ├── main.js            # Electron orchestrator (~150 lines)
│   ├── preload.js         # IPC bridge (contextIsolation: true)
│   ├── ipc/               # Modular IPC handler modules
│   │   ├── fileSystemHandlers.js
│   │   ├── searchHandlers.js
│   │   ├── terminalHandlers.js
│   │   ├── environmentHandlers.js
│   │   ├── animationHandlers.js
│   │   └── windowHandlers.js
│   ├── services/          # Business logic services
│   │   ├── manimService.js         # LLM → Manim script → video pipeline
│   │   ├── scriptValidator.js      # AST security sandboxing
│   │   ├── animEngineService.js    # Python/Manim environment management
│   │   ├── envScanner.js           # Cross-platform runtime detection
│   │   ├── codeRunner.js           # Code execution with 30s timeout
│   │   ├── llmService.js           # Multi-provider LLM integration
│   │   ├── linterService.js        # Code linting
│   │   ├── lspServer.js            # Language Server Protocol
│   │   ├── gifExporter.js          # [Planned] GIF export
│   │   ├── videoScrubber.js        # [Planned] Code-to-video scrubber
│   │   └── gistSharing.js          # [Planned] GitHub Gist sharing
│   └── tests/             # Test suite (Node.js test runner)
└── .github/workflows/     # CI/CD (test on push, release on tag)
```

## Security Model

- **Context Isolation** — `contextIsolation: true`, `nodeIntegration: false`
- **Filesystem Jail** — All file operations validated via `isPathWithinWorkspace()`
- **Script Sandboxing** — AST-level validation of generated Manim scripts (`scriptValidator.js`)
- **Import Allowlist** — Only approved Python modules (manim, math, numpy) can be imported
- **Dangerous Pattern Detection** — Blocks `eval()`, `exec()`, `subprocess`, `os.system`, etc.
- **Custom Protocol** — `colon-media://` for secure local video serving (no raw `file://`)

## Getting Started

### Prerequisites

- Node.js 22+
- Python 3.8+ (for Manim animations)
- FFmpeg (for video processing)

### Development

```bash
# Install dependencies
npm --prefix frontend install
npm --prefix backend install

# Start in development mode
cd backend
npm run dev
```

### Testing

```bash
cd backend
npm test
```

### Building

```bash
# Build for current platform
cd backend
npm run package

# Build for specific platform
npm run package:win
npm run package:linux
npm run package:mac
```

## CI/CD

- **CI** — Runs tests and frontend build on every push to `main`
- **Release** — Builds cross-platform installers when a `v*` tag is pushed

## License

MIT
