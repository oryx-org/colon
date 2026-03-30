# ⚡ Backend Service — Detailed Development Guide

> **Team**: 2 Electron/System Developers  
> **Tech**: Electron 33 + Node.js + child_process + node-pty  
> **Role**: Everything the user DOESN'T see — the Electron main process (the brain)

---

## What This Service Does

The backend is the Electron **main process**. It's a Node.js process that:
1. Creates the application window and loads the React frontend into it
2. Provides a secure IPC bridge (`preload.js`) between React and Node.js
3. Reads/writes files on the local filesystem
4. Compiles and runs user code using locally installed compilers
5. Manages compiler downloads and installations (Language Manager)
6. Calls the LLM API (Gemini) to generate Manim animation scripts
7. Runs Manim locally to render MP4 videos
8. Manages a real terminal session (node-pty)

**The frontend NEVER talks to the OS directly. ALL system access goes through this backend via IPC.**

---

## Folder Structure to Create

```
backend/
├── main.js                       ← Entry point: create window, register all IPC handlers
├── preload.js                    ← Security bridge: exposes electronAPI to React
│
├── services/
│   ├── fileSystem.js             ← IPC: read/write/watch files and folders
│   ├── codeRunner.js             ← IPC: compile + execute user code
│   ├── languageManager.js        ← IPC: download, install, remove compilers
│   ├── manimRenderer.js          ← IPC: LLM + Manim animation pipeline
│   ├── llmClient.js              ← Call Gemini/GPT API
│   ├── scriptValidator.js        ← Validate Manim scripts for security
│   └── terminalService.js        ← IPC: real terminal via node-pty
│
├── config/
│   └── languages.json            ← Fallback language registry (used if server unreachable)
│
├── assets/
│   └── icon.png                  ← App icon (512x512)
│
├── electron-builder.yml          ← Build configuration for installers
└── package.json
```

---

## Step-by-Step Implementation Order

### Step 1: `main.js` — Application Entry Point

This is the FIRST file to create. It creates the window and registers all services.

```javascript
// backend/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

// Import service registrations
const { registerFileSystemIPC } = require('./services/fileSystem');
const { registerCodeRunnerIPC } = require('./services/codeRunner');
const { registerLanguageManagerIPC } = require('./services/languageManager');
const { registerManimIPC } = require('./services/manimRenderer');
const { registerTerminalIPC } = require('./services/terminalService');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,     // SECURITY: React can't use require()
      contextIsolation: true,     // SECURITY: React can't access Node globals
    },
    backgroundColor: '#0a0e17',
    titleBarStyle: 'hiddenInset',   // Custom title bar on macOS
    show: false,                   // Don't show until ready
  });

  // Register all IPC services — pass mainWindow so they can send events
  registerFileSystemIPC(mainWindow);
  registerCodeRunnerIPC(mainWindow);
  registerLanguageManagerIPC(mainWindow);
  registerManimIPC(mainWindow);
  registerTerminalIPC(mainWindow);

  // Load React app
  if (process.env.NODE_ENV !== 'production') {
    // Development: load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load built files
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  // Show window when React is loaded (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

---

### Step 2: `preload.js` — Security Bridge

This is the ONLY connection between React (frontend) and Node.js (backend). It defines every method the frontend can call.

```javascript
// backend/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  // ========= Platform Info =========
  isDesktop: true,
  platform: process.platform,  // 'linux', 'win32', 'darwin'

  // ========= File System =========
  readDir: (dirPath) =>
    ipcRenderer.invoke('fs:readDir', dirPath),

  readFile: (filePath) =>
    ipcRenderer.invoke('fs:readFile', filePath),

  writeFile: (filePath, content) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),

  openFolder: () =>
    ipcRenderer.invoke('dialog:openFolder'),

  onFileChange: (callback) =>
    ipcRenderer.on('fs:change', (_event, data) => callback(data)),

  // ========= Code Execution =========
  runCode: (code, language) =>
    ipcRenderer.invoke('code:run', code, language),

  onCodeOutput: (callback) =>
    ipcRenderer.on('code:output', (_event, data) => callback(data)),

  onCodeExit: (callback) =>
    ipcRenderer.on('code:exit', (_event, data) => callback(data)),

  killProcess: () =>
    ipcRenderer.invoke('code:kill'),

  // ========= Animation / Analyze =========
  analyzeCode: (code, language) =>
    ipcRenderer.invoke('analyze:code', code, language),

  onAnalyzeProgress: (callback) =>
    ipcRenderer.on('analyze:progress', (_event, data) => callback(data)),

  onAnalyzeComplete: (callback) =>
    ipcRenderer.on('analyze:complete', (_event, data) => callback(data)),

  onAnalyzeError: (callback) =>
    ipcRenderer.on('analyze:error', (_event, data) => callback(data)),

  // ========= Language Manager =========
  getLanguages: () =>
    ipcRenderer.invoke('lang:list'),

  installLanguage: (langName) =>
    ipcRenderer.invoke('lang:install', langName),

  removeLanguage: (langName) =>
    ipcRenderer.invoke('lang:remove', langName),

  onInstallProgress: (callback) =>
    ipcRenderer.on('lang:progress', (_event, data) => callback(data)),

  // ========= Terminal =========
  createTerminal: () =>
    ipcRenderer.invoke('terminal:create'),

  sendTerminalInput: (data) =>
    ipcRenderer.send('terminal:input', data),

  onTerminalData: (callback) =>
    ipcRenderer.on('terminal:data', (_event, data) => callback(data)),

  resizeTerminal: (cols, rows) =>
    ipcRenderer.send('terminal:resize', cols, rows),
});
```

---

### Step 3: `services/fileSystem.js` — File System Service

```javascript
// backend/services/fileSystem.js
const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

function registerFileSystemIPC(mainWindow) {

  // Read directory contents
  ipcMain.handle('fs:readDir', async (_event, dirPath) => {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter(e => !e.name.startsWith('.'))   // Hide hidden files
        .map(entry => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          path: path.join(dirPath, entry.name),
          extension: entry.isFile() ? path.extname(entry.name) : null,
        }))
        .sort((a, b) => {
          // Folders first, then files, alphabetical
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
    } catch (err) {
      throw new Error(`Cannot read directory: ${err.message}`);
    }
  });

  // Read file content
  ipcMain.handle('fs:readFile', async (_event, filePath) => {
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch (err) {
      throw new Error(`Cannot read file: ${err.message}`);
    }
  });

  // Write file content
  ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
    try {
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return true;
    } catch (err) {
      throw new Error(`Cannot write file: ${err.message}`);
    }
  });

  // Open folder dialog
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Open Project Folder',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Watch directory for changes (optional, for live file explorer updates)
  let watcher = null;
  ipcMain.handle('fs:watch', async (_event, dirPath) => {
    if (watcher) watcher.close();
    watcher = chokidar.watch(dirPath, {
      ignored: /(^|[\/\\])\./,   // Ignore hidden files
      depth: 5,
    });
    watcher.on('all', (event, filePath) => {
      mainWindow.webContents.send('fs:change', { event, path: filePath });
    });
  });
}

module.exports = { registerFileSystemIPC };
```

---

### Step 4: `services/codeRunner.js` — Code Execution

Compiles and runs code in Python, C++, Java, JavaScript. **See `docs/phase-4-code-execution.md`** for the complete implementation with all 4 languages.

**Key pattern:**
```javascript
// Every service follows this pattern:
function registerCodeRunnerIPC(mainWindow) {
  ipcMain.handle('code:run', async (event, code, language) => {
    // 1. Get compiler path from compilers.json
    // 2. Write code to temp file
    // 3. If compiled language: compile first (execSync)
    // 4. Execute: spawn(compiler, [tempFile])
    // 5. Stream stdout/stderr to mainWindow via 'code:output'
    // 6. On exit: send 'code:exit' with exit code + time
    // 7. Cleanup temp files
  });

  ipcMain.handle('code:kill', () => {
    // Kill the running process
  });
}
module.exports = { registerCodeRunnerIPC };
```

---

### Step 5: `services/languageManager.js` — Compiler Downloads

Downloads and installs compilers. **See `docs/phase-3-language-manager.md`** for the complete implementation.

**Key pattern:**
```javascript
function registerLanguageManagerIPC(mainWindow) {
  ipcMain.handle('lang:list', async () => {
    // 1. Auto-detect system compilers using which/where
    // 2. Read compilers.json for app-installed ones
    // 3. Return merged list
  });

  ipcMain.handle('lang:install', async (event, langName) => {
    // 1. Fetch registry JSON from server
    // 2. Get download URL for current OS
    // 3. Download with progress → send 'lang:progress'
    // 4. Extract to ~/.codemotion/compilers/{lang}/
    // 5. Update compilers.json
  });

  ipcMain.handle('lang:remove', async (event, langName) => {
    // 1. Delete the compiler directory
    // 2. Update compilers.json
  });
}
module.exports = { registerLanguageManagerIPC };
```

---

### Step 6: `services/manimRenderer.js` — Animation Pipeline

The most complex service. **See `docs/phase-5-manim-integration.md`** for the complete implementation.

**Pipeline:**
```
code → hash → check cache → MISS → call LLM → get Manim script
→ validate script → write to temp file → run manim command
→ find MP4 → copy to cache → send path to frontend
```

---

### Step 7: `services/llmClient.js` — LLM API

Calls Gemini API. **See `docs/phase-6-llm-integration.md`** for prompt and implementation.

---

### Step 8: `services/terminalService.js` — Terminal

```javascript
// backend/services/terminalService.js
const { ipcMain } = require('electron');
// NOTE: node-pty must be installed separately and may need native build tools
// npm install node-pty
// On Linux: sudo apt install build-essential
// If node-pty install fails, this service can be skipped initially

let ptyProcess = null;

function registerTerminalIPC(mainWindow) {

  ipcMain.handle('terminal:create', () => {
    try {
      const pty = require('node-pty');
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 20,
        cwd: process.env.HOME || process.env.USERPROFILE,
        env: process.env,
      });

      // Send terminal output to frontend
      ptyProcess.onData((data) => {
        mainWindow.webContents.send('terminal:data', data);
      });

      return true;
    } catch (err) {
      console.error('Terminal creation failed:', err.message);
      return false;
    }
  });

  // Receive keystrokes from frontend
  ipcMain.on('terminal:input', (_event, input) => {
    if (ptyProcess) ptyProcess.write(input);
  });

  // Resize terminal
  ipcMain.on('terminal:resize', (_event, cols, rows) => {
    if (ptyProcess) ptyProcess.resize(cols, rows);
  });
}

module.exports = { registerTerminalIPC };
```

---

## How Services Connect Together

```
main.js
  │
  ├── Calls registerFileSystemIPC(mainWindow)
  │     └── Registers: fs:readDir, fs:readFile, fs:writeFile, dialog:openFolder
  │
  ├── Calls registerCodeRunnerIPC(mainWindow)
  │     └── Registers: code:run, code:kill
  │     └── Uses: compilers.json (from languageManager)
  │
  ├── Calls registerLanguageManagerIPC(mainWindow)
  │     └── Registers: lang:list, lang:install, lang:remove
  │     └── Uses: languages.json (config), downloads from server
  │
  ├── Calls registerManimIPC(mainWindow)
  │     └── Registers: analyze:code
  │     └── Uses: llmClient.js, scriptValidator.js, compilers.json
  │
  └── Calls registerTerminalIPC(mainWindow)
        └── Registers: terminal:create, terminal:input, terminal:resize
```

---

## Service Implementation Checklist

| # | File | IPC Channels | Priority | Depends On |
|---|---|---|---|---|
| 1 | `main.js` | — | 🔴 P0 | Nothing |
| 2 | `preload.js` | — | 🔴 P0 | Nothing |
| 3 | `fileSystem.js` | `fs:*`, `dialog:*` | 🔴 P0 | main.js |
| 4 | `codeRunner.js` | `code:*` | 🔴 P0 | languageManager |
| 5 | `languageManager.js` | `lang:*` | 🔴 P0 | main.js |
| 6 | `terminalService.js` | `terminal:*` | 🟡 P1 | main.js + node-pty |
| 7 | `llmClient.js` | (internal) | 🟡 P1 | API key |
| 8 | `scriptValidator.js` | (internal) | 🟡 P1 | Python installed |
| 9 | `manimRenderer.js` | `analyze:*` | 🟢 P2 | llmClient + validator + Manim |

---

## Key Rules for Backend Developers

1. **Every service is a function that takes `mainWindow`** and registers its IPC handlers
2. **Use `ipcMain.handle()`** for request-response (frontend awaits the return value)
3. **Use `mainWindow.webContents.send()`** for streaming events (progress, output)
4. **ALWAYS clean up temp files** after code execution or Manim rendering
5. **ALWAYS set timeouts** on child processes (30 sec for code, 120 sec for Manim)
6. **NEVER expose file paths to the renderer** that aren't already user-visible
7. **Test each service independently** before integrating with frontend

---

## How to Run (Development)

```bash
cd backend

# Option 1: Just start Electron (frontend must already be running on :5173)
npm start

# Option 2: Start both frontend + Electron together
npm run dev
```

### Installing node-pty (required for terminal)

```bash
# Linux
sudo apt install build-essential python3
npm install node-pty

# macOS
xcode-select --install
npm install node-pty

# Windows
npm install --global windows-build-tools
npm install node-pty
```

If `node-pty` fails to install, the terminal feature won't work but everything else will. You can skip it initially.
