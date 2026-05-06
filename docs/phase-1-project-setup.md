# 📋 Phase 1 — Project Setup

> **Timeline**: Week 1–2  
> **Team**: DevOps + 1 Electron developer  
> **Goal**: Electron + React dev environment running, all 6 members can develop locally

---

## 1.1 Objectives

- [ ] Set up Electron project with React (Vite) as the renderer
- [ ] Configure IPC communication between Main and Renderer
- [ ] Set up Git repo with branching strategy
- [ ] Create the dev workflow: `npm run dev` opens Electron window with React HMR
- [ ] All 6 team members can clone and run the project

---

## 1.2 Step-by-Step Setup

### Step 1: Root Workspace

```bash
cd backend
# Root package.json already exists
```

### Step 2: Set Up Electron (Desktop)

```bash
cd backend
npm init -y
npm install electron electron-store
npm install -D electron-builder concurrently wait-on
```

**`backend/package.json`** — add scripts:
```json
{
  "name": "Colon-desktop",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "concurrently \"cd ../frontend && npm run dev\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "electron-builder"
  }
}
```

### Step 3: Create Electron Main Process

```javascript
// backend/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#0a0e17',
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // Dev: load from Vite | Prod: load built files
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

### Step 4: Create Preload Script

```javascript
// backend/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform check
  isDesktop: true,
  platform: process.platform,

  // File system
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  onFileChange: (callback) => ipcRenderer.on('fs:change', (_, data) => callback(data)),

  // Code execution
  runCode: (code, lang) => ipcRenderer.invoke('code:run', code, lang),
  onCodeOutput: (callback) => ipcRenderer.on('code:output', (_, data) => callback(data)),
  onCodeExit: (callback) => ipcRenderer.on('code:exit', (_, code) => callback(code)),
  killProcess: () => ipcRenderer.invoke('code:kill'),

  // Animation
  analyzeCode: (code, lang) => ipcRenderer.invoke('analyze:code', code, lang),
  onAnalyzeProgress: (callback) => ipcRenderer.on('analyze:progress', (_, p) => callback(p)),
  onAnalyzeComplete: (callback) => ipcRenderer.on('analyze:complete', (_, data) => callback(data)),
  onAnalyzeError: (callback) => ipcRenderer.on('analyze:error', (_, err) => callback(err)),

  // Language Manager
  getLanguages: () => ipcRenderer.invoke('lang:list'),
  installLanguage: (name) => ipcRenderer.invoke('lang:install', name),
  removeLanguage: (name) => ipcRenderer.invoke('lang:remove', name),
  onInstallProgress: (callback) => ipcRenderer.on('lang:progress', (_, p) => callback(p)),

  // Terminal
  createTerminal: () => ipcRenderer.invoke('terminal:create'),
  sendTerminalInput: (data) => ipcRenderer.send('terminal:input', data),
  onTerminalData: (callback) => ipcRenderer.on('terminal:data', (_, data) => callback(data)),
  resizeTerminal: (cols, rows) => ipcRenderer.send('terminal:resize', cols, rows),
});
```

### Step 5: Configure Vite for Electron

```javascript
// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',     // Important: relative paths for Electron file:// loading
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
});
```

---

## 1.3 Dev Workflow

```bash
# From backend/ folder:
npm run dev

# This does TWO things:
# 1. Starts Vite dev server at http://localhost:5173  (React HMR)
# 2. Waits for Vite, then opens Electron window loading that URL

# Result: Change any React component → instant hot reload in Electron window
```

---

## 1.4 Git Branching Strategy

```
main                      ← Stable releases
  └── develop             ← Integration branch
       ├── feature/ui-shell           (UI Dev 1)
       ├── feature/file-explorer      (UI Dev 2)
       ├── feature/code-runner        (Electron Dev 1)
       ├── feature/language-manager   (Electron Dev 2)
       ├── feature/manim-pipeline     (ML/Manim)
       └── feature/packaging          (DevOps)
```

---

## 1.5 Deliverables

| # | Deliverable | Owner |
|---|---|---|
| 1 | Electron opens with React loaded | DevOps |
| 2 | Preload.js with all IPC channels defined | Electron Dev 1 |
| 3 | Vite HMR works inside Electron | DevOps |
| 4 | All team members can run `npm run dev` | Everyone |
| 5 | Git repo with branching setup | DevOps |
