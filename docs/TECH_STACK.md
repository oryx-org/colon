# 🛠️ Tech Stack & Tools — Colon Desktop

---

## Complete Technology Map

### Electron (Desktop Shell)

| Technology | Version | Purpose |
|---|---|---|
| **Electron** | 39.x | Desktop app framework (Chromium + Node.js) |
| **electron-builder** | 26.x | Builds .exe / .dmg / .AppImage / .deb installers |
| **electron-store** | 10.x | Persistent local storage (user preferences, settings) |

### Frontend (Renderer Process)

| Technology | Version | Purpose |
|---|---|---|
| **React** | 19.x | UI component framework |
| **Vite** | 7.x | Build tool, HMR for development |
| **TypeScript** | 5.x | Type-safe frontend development |
| **Monaco Editor** | `@monaco-editor/react` 4.x | VS Code-grade code editor |
| **xterm.js** | `@xterm/xterm` 6.x | Terminal emulator in browser |
| **xterm-addon-fit** | `@xterm/addon-fit` 0.11.x | Auto-resize terminal |
| **xterm-addon-webgl** | `@xterm/addon-webgl` 0.19.x | GPU-accelerated terminal rendering |
| **react-player** | 3.x | MP4 video playback |
| **react-router-dom** | 7.x | Client-side routing |
| **react-hot-toast** | 2.x | Toast notifications |
| **react-icons** | 5.x | Icon library |
| **react-split** | 2.x | Resizable split panels |
| **monaco-languageclient** | 10.x | LSP integration for Monaco |
| **vscode-ws-jsonrpc** | 3.x | WebSocket JSON-RPC for LSP |

### Main Process (Node.js Services)

| Technology | Version | Purpose |
|---|---|---|
| **node-pty** | 1.x | Real terminal (bash/powershell) integration |
| **chokidar** | 5.x | File system watcher (for file explorer live updates) |
| **axios** | 1.x | HTTP client for compiler downloads |
| **extract-zip** | 2.x | Extract compiler downloads |
| **dotenv** | 17.x | Environment variable loading |
| **ws** | 8.x | WebSocket server for LSP bridge |
| **pyright** | 1.x | Python language server (bundled) |
| **typescript-language-server** | 5.x | JS/TS language server (bundled) |
| **crypto** (built-in) | — | Code hashing for caching, LSP token generation |

### AI / LLM

| Technology | Purpose |
|---|---|
| **Cloudflare Worker Proxy** | Server-side API key protection for Gemini |
| **Google Gemini API** (via proxy) | Code analysis + Manim script generation |
| **Groq API** (alternative) | Fast inference with Llama models |
| **Anthropic API** (alternative) | Claude-based code analysis |

### Manim (Animation Engine)

| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.8+ | Required runtime for Manim |
| **Manim Community** | Latest | Generates MP4 animation videos |
| **FFmpeg** | Latest | Video encoding (Manim dependency) |
| **Cairo + Pango** | — | 2D graphics rendering (Manim dependency) |

### Development & Testing Tools

| Tool | Purpose |
|---|---|
| **ESLint** | Code linting (frontend) |
| **Node.js Test Runner** | Unit testing (backend — `node --test`) |
| **concurrently** | Run Vite + Electron simultaneously |
| **wait-on** | Wait for Vite dev server before launching Electron |
| **Git** | Version control |
| **GitHub Actions** | CI/CD — lint, test, build installers |

---

## Install Commands

### Desktop (Electron)

```bash
cd backend
npm install
```

### Frontend (React)

```bash
cd frontend
npm install
```

### Manim (Python — installed via Animation Engine in-app)

```bash
# These are installed BY the app via one-click setup, not during development
pip install manim
# System deps (Linux): sudo apt install libcairo2-dev libpango1.0-dev ffmpeg
```

---

## Environment / Config

The app uses a `.env` file in the backend directory for LLM configuration:

```env
# backend/.env
LLM_PROVIDER=gemini
LLM_API_KEY=your-api-key-here
LLM_MODEL=gemini-flash-latest

# Production: route through Cloudflare Worker proxy
PROXY_URL=https://colon-llm-proxy.oryx-org.workers.dev
```

User preferences (font size, theme, word wrap) are stored in localStorage via the Settings Modal in the frontend.

### Runtime Detection

The `envScanner.js` service auto-detects installed runtimes by scanning the system PATH. No manual configuration files needed — detection is automatic on every IDE launch.
