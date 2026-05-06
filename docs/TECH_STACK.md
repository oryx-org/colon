# 🛠️ Tech Stack & Tools — Colon Desktop

---

## Complete Technology Map

### Electron (Desktop Shell)

| Technology | Version | Purpose |
|---|---|---|
| **Electron** | 33.x | Desktop app framework (Chromium + Node.js) |
| **electron-builder** | 25.x | Builds .exe / .dmg / .AppImage / .deb installers |
| **electron-store** | 10.x | Persistent local storage (user preferences, settings) |
| **electron-updater** | 6.x | Auto-update mechanism |

### Frontend (Renderer Process)

| Technology | Version | Purpose |
|---|---|---|
| **React** | 18.x | UI component framework |
| **Vite** | 5.x | Build tool, HMR for development |
| **Monaco Editor** | `@monaco-editor/react` | VS Code-grade code editor |
| **xterm.js** | 5.x | Terminal emulator in browser |
| **xterm-addon-fit** | 0.10.x | Auto-resize terminal |
| **react-player** | 2.x | MP4 video playback |
| **react-router** | 6.x | Page navigation (IDE / Settings) |
| **react-hot-toast** | 2.x | Toast notifications |
| **react-icons** | 5.x | Icon library |
| **react-split** | 2.x | Resizable split panels |

### Main Process (Node.js Services)

| Technology | Version | Purpose |
|---|---|---|
| **node-pty** | 1.x | Real terminal (bash/powershell) integration |
| **chokidar** | 4.x | File system watcher (for file explorer live updates) |
| **node-fetch** / **axios** | — | HTTP client for LLM API calls and compiler downloads |
| **archiver** / **extract-zip** | — | Zip/extract compiler downloads |
| **crypto** (built-in) | — | Code hashing for caching |

### AI / LLM

| Technology | Purpose |
|---|---|
| **Google Gemini API** (`@google/generative-ai`) | Code analysis + Manim script generation |
| **OpenAI SDK** (fallback) | Alternative LLM provider |

### Manim (Animation Engine)

| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.12+ | Required runtime for Manim |
| **Manim Community** | 0.20.x | Generates MP4 animation videos |
| **FFmpeg** | 6.x | Video encoding (Manim dependency) |
| **Cairo + Pango** | — | 2D graphics rendering (Manim dependency) |

### Development Tools

| Tool | Purpose |
|---|---|
| **VS Code** | IDE for development |
| **Git** | Version control |
| **ESLint + Prettier** | Code linting and formatting |
| **Jest** | Unit testing |
| **Spectron / Playwright** | Electron E2E testing |

---

## Install Commands

### Desktop (Electron)

```bash
mkdir desktop && cd backend
npm init -y
npm install electron electron-store
npm install -D electron-builder electron-devtools-installer
```

### Frontend (React)

```bash
cd frontend
# Already initialized with Vite
npm install @monaco-editor/react react-player react-router-dom
npm install react-hot-toast react-icons react-split
npm install xterm xterm-addon-fit
```

### Main Process Dependencies

```bash
cd backend
npm install node-pty chokidar extract-zip axios
npm install @google/generative-ai
```

### Manim (Python — installed via Language Manager)

```bash
# These are installed BY the app, not during development
pip install manim
# System deps (Linux): sudo apt install libcairo2-dev libpango1.0-dev ffmpeg
```

---

## Environment / Config

Since this is a desktop app, there's no `.env` file on a server. Instead, settings are stored locally:

```json
// ~/.config/Colon/config.json (managed by electron-store)
{
  "llm": {
    "provider": "gemini",
    "apiKey": "stored-in-os-keychain"
  },
  "editor": {
    "fontSize": 14,
    "theme": "vs-dark",
    "wordWrap": true
  },
  "rendering": {
    "quality": "low",
    "maxTimeout": 120
  },
  "recentProjects": [
    "/home/user/projects/sorting",
    "/home/user/projects/trees"
  ]
}
```

### Compiler Config

```json
// ~/.Colon/compilers/compilers.json
{
  "python": {
    "installed": true,
    "version": "3.12.3",
    "path": "/home/user/.Colon/compilers/python/bin/python3"
  },
  "cpp": {
    "installed": true,
    "version": "13.2",
    "path": "/home/user/.Colon/compilers/cpp/bin/g++"
  },
  "java": {
    "installed": false,
    "version": null,
    "path": null
  },
  "node": {
    "installed": false,
    "version": null,
    "path": null
  }
}
```
