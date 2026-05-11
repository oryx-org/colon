# 🎨 Frontend — React Renderer Process

> **Tech**: React 19 + TypeScript + Vite 7 + Monaco Editor + xterm.js  
> **Role**: Everything the user sees — the Electron renderer process

---

## What This Service Does

The frontend is a React + TypeScript application that runs inside Electron's renderer window. It provides the full IDE experience:

- **File Explorer** (left panel) — Browse, create, rename, and delete files
- **Code Editor** (center panel) — Monaco editor with LSP, syntax highlighting, and multi-tab support
- **Animation Tab** (right panel) — Play generated MP4 videos + view block animations
- **Terminal** (bottom panel) — Multi-tab PTY terminal with WebGL rendering
- **Search Panel** — Full-text search and replace across workspace
- **Language Manager** — Detect and install runtimes (Python, Node, GCC, etc.)
- **Command Palette** — Ctrl+Shift+P quick action launcher
- **Settings Modal** — Font size, theme, word wrap, format on save

**The frontend NEVER accesses the filesystem or runs code directly. All system access goes through `window.electronAPI` provided by `preload.js`.**

---

## Quick Start

```bash
cd frontend
npm install
npm run dev       # Standalone dev server at http://localhost:5173

# OR: Start via Electron (from backend/ folder):
cd ../backend
npm run dev
```

---

## Folder Structure

```
frontend/src/
├── App.tsx                          # Root component — layout + state management
├── main.tsx                         # React entry point (Monaco loader configured here)
├── vite-env.d.ts                    # Vite type declarations
│
├── hooks/                           # Custom React hooks (extracted from App.tsx)
│   ├── useFileManagement.ts         # Open files, tabs, save, close, rename
│   ├── useAnimationState.ts         # LLM animations + Manim video state
│   └── useCodeRunner.ts             # Run code, stop, install missing runtimes
│
├── components/
│   ├── AnimationTab/                # Video player + block animation visualizer
│   ├── CommandPalette/              # Ctrl+Shift+P quick action launcher
│   ├── ExplorerPanel/               # File tree with CRUD operations
│   ├── FileIcon/                    # Language-aware file icons
│   ├── LanguageManagerPanel/        # Runtime detection + one-click install UI
│   ├── MenuBar/                     # Custom frameless title bar with dropdown menus
│   ├── RightSidebar/                # Animation tab toggle rail
│   ├── SearchPanel/                 # Full-text search + replace across workspace
│   ├── SettingsModal/               # Editor preferences (font, theme, etc.)
│   ├── Sidebar/                     # Left icon rail (explorer, search, languages)
│   ├── StatusBar/                   # Bottom bar (language, cursor line:column)
│   ├── TerminalPanel/               # Multi-tab PTY terminal (xterm.js + WebGL)
│   └── Workspace/                   # Monaco editor + tab bar + LSP integration
│
├── styles/
│   └── global.css                   # Design system: CSS variables, colors, fonts
│
└── utils/                           # Shared utility functions
```

---

## State Architecture

State is managed in `App.tsx` via three custom hooks:

| Hook | Responsibility |
|------|---------------|
| `useFileManagement` | Open file list, active file, save, close, rename, binary detection |
| `useAnimationState` | LLM block animations, Manim videos, engine status, per-file keying |
| `useCodeRunner` | Run active file, stop execution, environment scanning, runtime install |

State flows down through props. No global context or state library — the hook pattern keeps state co-located with the features that need it.

---

## Accessing Electron API

The backend exposes `window.electronAPI` via the preload script:

```tsx
const api = (window as any).electronAPI;

// File system
const content = await api.readFile(filePath);
await api.writeFile(filePath, content);

// Terminal
api.terminal.create(id);
api.terminal.input(id, data);

// Animation
const result = await api.manim.generate(filePath, code, language);

// Environment
const envs = await api.scanEnvironments();
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save active file |
| `Ctrl+W` | Close active tab |
| `F5` | Run active file |
| `Ctrl+Shift+F5` | Stop running code |
| `Ctrl+Shift+P` | Open Command Palette |
| `Ctrl+Shift+F` | Open Search Panel |
| `Ctrl++` / `Ctrl+-` | Zoom in / out |

---

## Design Guidelines

- **Dark theme** via CSS custom properties (see `global.css`)
- **Fonts**: System fonts for UI, monospace for code
- **Split panels**: `react-split` with persisted sizes
- **States**: Every async action shows loading → success/error
- **Icons**: `react-icons` library
- **Frameless window**: Custom title bar via `MenuBar` component

---

## Key Packages

| Package | Purpose |
|---------|---------|
| `@monaco-editor/react` | VS Code-grade code editor |
| `@xterm/xterm` + addons | Terminal emulator with WebGL rendering |
| `react-player` | MP4 video playback for animations |
| `react-split` | Resizable panel dividers |
| `react-icons` | Icon library |
| `react-hot-toast` | Toast notifications |
| `monaco-languageclient` | LSP integration for Monaco |
