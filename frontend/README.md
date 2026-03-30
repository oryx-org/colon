# 🎨 Frontend Service — Detailed Development Guide

> **Team**: 2 UI Developers  
> **Tech**: React 18 + Vite + Monaco Editor + xterm.js  
> **Role**: Everything the user SEES — the Electron renderer process

---

## What This Service Does

The frontend is a React application that runs inside Electron's browser window. It provides:
1. **File Explorer** (left panel) — browse & open files from local filesystem
2. **Code Editor** (center panel) — write code with syntax highlighting, tabs
3. **Animation Player** (right panel) — play generated MP4 videos + show explanations
4. **Terminal** (bottom panel) — real terminal connected to the user's shell
5. **Header** — Run button, Analyze button, language selector, settings

The frontend **NEVER** accesses the filesystem, runs code, or calls APIs directly. All of that goes through `window.electronAPI` which is provided by the backend's `preload.js`.

---

## Folder Structure to Create

```
frontend/
├── src/
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Layout.jsx            ← Main shell: splits all panels
│   │   │   ├── Layout.css
│   │   │   ├── Header.jsx            ← Top bar: logo, buttons
│   │   │   └── Header.css
│   │   │
│   │   ├── FileExplorer/
│   │   │   ├── FileExplorer.jsx      ← Left panel: directory tree
│   │   │   ├── FileNode.jsx          ← Single file/folder row
│   │   │   └── FileExplorer.css
│   │   │
│   │   ├── Editor/
│   │   │   ├── EditorPanel.jsx       ← Center panel: Monaco editor + tabs
│   │   │   ├── EditorTabs.jsx        ← Open file tab bar
│   │   │   └── Editor.css
│   │   │
│   │   ├── AnimationPanel/
│   │   │   ├── AnimationPanel.jsx    ← Right panel: video + explanations
│   │   │   ├── VideoPlayer.jsx       ← MP4 player wrapper
│   │   │   ├── ExplanationBox.jsx    ← Algorithm + step explanation
│   │   │   └── AnimationPanel.css
│   │   │
│   │   ├── Terminal/
│   │   │   ├── TerminalPanel.jsx     ← Bottom panel: xterm.js
│   │   │   └── Terminal.css
│   │   │
│   │   └── LanguageManager/
│   │       ├── LanguageManager.jsx   ← Settings page: install compilers
│   │       └── LanguageManager.css
│   │
│   ├── pages/
│   │   ├── IDEPage.jsx               ← Main IDE view (default page)
│   │   └── SettingsPage.jsx          ← Settings + Language Manager
│   │
│   ├── hooks/
│   │   ├── useElectron.js            ← Safely access window.electronAPI
│   │   ├── useFileTree.js            ← File explorer state management
│   │   ├── useEditor.js              ← Open files, tabs, active file state
│   │   └── useCodeRunner.js          ← Run code + capture output
│   │
│   ├── context/
│   │   └── AppContext.jsx            ← Global state: language, theme, etc.
│   │
│   ├── styles/
│   │   └── global.css                ← Design system: colors, fonts, reset
│   │
│   ├── App.jsx                       ← Root component with routing
│   └── main.jsx                      ← React entry point
│
├── index.html
├── vite.config.js
└── package.json
```

---

## Step-by-Step Implementation Order

### Step 1: Design System (`styles/global.css`)

**Do this FIRST.** Every component uses these variables.

```css
/* styles/global.css */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

:root {
  /* Backgrounds */
  --bg-primary:     #0a0e17;
  --bg-secondary:   #111827;
  --bg-panel:       #1a1f2e;
  --bg-hover:       #1e2538;
  --bg-active:      #252d3d;

  /* Accent */
  --accent:         #6366f1;
  --accent-hover:   #818cf8;
  --accent-glow:    rgba(99, 102, 241, 0.3);
  --accent-2:       #22d3ee;
  --green:          #10b981;
  --red:            #ef4444;
  --yellow:         #f59e0b;
  --orange:         #f97316;

  /* Text */
  --text-primary:   #f1f5f9;
  --text-secondary: #94a3b8;
  --text-dim:       #64748b;

  /* Borders */
  --border:         #1e293b;
  --border-active:  #6366f1;

  /* Split panel gutter */
  --gutter-bg:      #1e293b;
  --gutter-hover:   #6366f1;

  /* Sizing */
  --header-height:  48px;
  --tab-height:     36px;
  --radius:         8px;
  --radius-sm:      4px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
  height: 100vh;
}

#root {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }

/* Split panel gutters */
.gutter {
  background: var(--gutter-bg);
  transition: background 0.2s;
}
.gutter:hover {
  background: var(--gutter-hover);
}
```

---

### Step 2: Electron API Hook (`hooks/useElectron.js`)

**CRITICAL**: This is how every component talks to the backend.

```jsx
// hooks/useElectron.js

export function useElectron() {
  // window.electronAPI is injected by backend/preload.js
  // It will be undefined if running in a normal browser
  const api = window.electronAPI;

  if (!api) {
    console.warn('electronAPI not available. Running in browser-only mode.');
    return null;
  }

  return api;
}

// Example usage in any component:
//
// import { useElectron } from '../hooks/useElectron';
//
// function MyComponent() {
//   const electron = useElectron();
//
//   const handleRun = async () => {
//     if (!electron) return;
//     const result = await electron.runCode(code, 'python');
//   };
// }
```

**Available methods on `window.electronAPI`** (provided by backend):

| Method | What It Does | Returns |
|---|---|---|
| `readDir(path)` | List files in a directory | Array of `{name, isDirectory, path}` |
| `readFile(path)` | Read file content | String (file content) |
| `writeFile(path, content)` | Save a file | Boolean |
| `openFolder()` | Open native folder picker dialog | String (folder path) or null |
| `runCode(code, language)` | Execute code using installed compiler | void (output comes via events) |
| `onCodeOutput(callback)` | Listen for stdout/stderr during execution | `{type, text}` |
| `onCodeExit(callback)` | Listen for process exit | `{code, time}` |
| `killProcess()` | Kill running process | void |
| `analyzeCode(code, language)` | Send code for Manim animation | void (progress comes via events) |
| `onAnalyzeProgress(callback)` | Listen for render progress | `{phase, percent}` |
| `onAnalyzeComplete(callback)` | Listen for completed video | `{videoPath}` |
| `onAnalyzeError(callback)` | Listen for errors | `{message}` |
| `getLanguages()` | List installed compilers | Object of language configs |
| `installLanguage(name)` | Download and install a compiler | void (progress via events) |
| `removeLanguage(name)` | Uninstall a compiler | void |
| `onInstallProgress(callback)` | Listen for download progress | `{lang, phase, percent}` |
| `createTerminal()` | Spawn a terminal shell | void |
| `sendTerminalInput(data)` | Send keystrokes to terminal | void |
| `onTerminalData(callback)` | Receive terminal output | String |
| `resizeTerminal(cols, rows)` | Resize terminal | void |

---

### Step 3: Layout Component (the shell)

```jsx
// components/Layout/Layout.jsx
import Split from 'react-split';
import Header from './Header';
import FileExplorer from '../FileExplorer/FileExplorer';
import EditorPanel from '../Editor/EditorPanel';
import AnimationPanel from '../AnimationPanel/AnimationPanel';
import TerminalPanel from '../Terminal/TerminalPanel';
import './Layout.css';

function Layout() {
  return (
    <div className="app-layout">
      <Header />

      <div className="main-content">
        {/* Vertical split: workspace (top) + terminal (bottom) */}
        <Split
          direction="vertical"
          sizes={[80, 20]}
          minSize={[300, 80]}
          gutterSize={4}
          className="split-vertical"
        >
          {/* Horizontal split: explorer | editor | animation */}
          <Split
            sizes={[15, 45, 40]}
            minSize={[120, 250, 200]}
            gutterSize={4}
            className="split-horizontal"
          >
            <FileExplorer />
            <EditorPanel />
            <AnimationPanel />
          </Split>

          <TerminalPanel />
        </Split>
      </div>
    </div>
  );
}

export default Layout;
```

```css
/* components/Layout/Layout.css */
.app-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.main-content {
  flex: 1;
  overflow: hidden;
}

.split-vertical {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.split-horizontal {
  display: flex;
  flex-direction: row;
  height: 100%;
}
```

---

### Step 4: Build Each Component

Build in this order (each depends on the previous):

| Order | Component | Description | Difficulty |
|---|---|---|---|
| 1 | `Header.jsx` | Logo, Run button, Analyze button, language dropdown | Easy |
| 2 | `FileExplorer.jsx` + `FileNode.jsx` | TreeView of local files via `electron.readDir()` | Medium |
| 3 | `EditorPanel.jsx` + `EditorTabs.jsx` | Monaco editor, open/close tabs, save file | Medium |
| 4 | `TerminalPanel.jsx` | xterm.js connected to real shell via `electron.createTerminal()` | Medium |
| 5 | `VideoPlayer.jsx` | ReactPlayer loading local `file://` MP4 | Easy |
| 6 | `AnimationPanel.jsx` + `ExplanationBox.jsx` | Video + explanation panels, idle/loading/ready states | Medium |
| 7 | `LanguageManager.jsx` | List languages, install/uninstall with progress bars | Medium |

---

### Step 5: State Management Pattern

Use React Context for shared state:

```jsx
// context/AppContext.jsx
import { createContext, useContext, useState } from 'react';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [language, setLanguage] = useState('python');
  const [activeFile, setActiveFile] = useState(null);
  const [openFiles, setOpenFiles] = useState([]);
  const [code, setCode] = useState('');
  const [videoPath, setVideoPath] = useState(null);
  const [videoStatus, setVideoStatus] = useState('idle'); // idle | rendering | ready | error
  const [progress, setProgress] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [rootFolder, setRootFolder] = useState(null);

  const value = {
    language, setLanguage,
    activeFile, setActiveFile,
    openFiles, setOpenFiles,
    code, setCode,
    videoPath, setVideoPath,
    videoStatus, setVideoStatus,
    progress, setProgress,
    explanation, setExplanation,
    rootFolder, setRootFolder,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
```

---

## Key Rules for Frontend Developers

1. **NEVER use `require()` or `import` Node.js modules** — you're in a browser context
2. **ALWAYS use `window.electronAPI.*`** to interact with the system
3. **ALWAYS check `if (!electron) return`** before calling electron methods
4. **Every async action must have 3 UI states**: idle → loading → success/error
5. **Use CSS variables** from `global.css` — no hardcoded colors
6. **Font**: `JetBrains Mono` for code, `Inter` for UI text
7. **Dark theme only** — the app is always dark

---

## Available Packages

| Package | Import | Purpose |
|---|---|---|
| `@monaco-editor/react` | `import Editor from '@monaco-editor/react'` | Code editor |
| `react-player` | `import ReactPlayer from 'react-player'` | Video playback |
| `react-split` | `import Split from 'react-split'` | Resizable panels |
| `react-icons` | `import { FiFolder } from 'react-icons/fi'` | Icons |
| `react-hot-toast` | `import toast from 'react-hot-toast'` | Notifications |
| `react-router-dom` | `import { BrowserRouter } from 'react-router-dom'` | Page routing |
| `xterm` | `import { Terminal } from 'xterm'` | Terminal emulator |
| `xterm-addon-fit` | `import { FitAddon } from 'xterm-addon-fit'` | Auto-resize terminal |

---

## How to Run (Development)

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
# Note: electronAPI won't be available in browser — use Electron to test full features
```

To test with Electron:
```bash
cd ../backend
npm run dev
# This starts BOTH Vite + Electron together
```
