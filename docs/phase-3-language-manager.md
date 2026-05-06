# 📦 Phase 3 — Language Manager

> **Timeline**: Week 3–5  
> **Team**: 1 Electron developer  
> **Goal**: Users can browse, download, and install compilers/interpreters from within the app

---

## 3.1 Objectives

- [ ] Build the Language Manager UI (list, install, uninstall, progress)
- [ ] Create the remote language registry (JSON on your server)
- [ ] Implement download + extract logic in Electron main process
- [ ] Store installed compilers in app data directory
- [ ] Auto-detect system-installed compilers as well
- [ ] Handle cross-platform (Windows/macOS/Linux) binaries

---

## 3.2 Language Manager UI

```
┌──────────────────────────────────────────────────────┐
│  ⚙️ Settings → Language Manager                      │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │ 🐍 Python          3.12.3                        ││
│  │    Status: ✅ Installed (System: /usr/bin/python3)││
│  │    [Uninstall]                                    ││
│  ├──────────────────────────────────────────────────┤│
│  │ ⚙️ C++ (GCC/MinGW)  13.2                         ││
│  │    Status: ✅ Installed (App: ~/.Colon/...)  ││
│  │    [Uninstall]                                    ││
│  ├──────────────────────────────────────────────────┤│
│  │ ☕ Java (OpenJDK)    21.0.2                       ││
│  │    Status: ❌ Not Installed     Size: ~180MB      ││
│  │    [📥 Install]                                   ││
│  ├──────────────────────────────────────────────────┤│
│  │ 🟢 Node.js          20.11.1                      ││
│  │    Status: ❌ Not Installed     Size: ~28MB       ││
│  │    [📥 Install]                                   ││
│  ├──────────────────────────────────────────────────┤│
│  │ 🎬 Manim (Python)   0.20.1                       ││
│  │    Status: ⚠️ Requires Python                     ││
│  │    [📥 Install] (will install via pip)            ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  💡 Compilers are installed to: ~/.Colon/compilers/│
└──────────────────────────────────────────────────────┘
```

---

## 3.3 How It Works

```
1. App starts → fetches remote registry JSON from your server
2. App checks local compilers.json → what's already installed?
3. App also auto-detects system compilers (which/where)
4. Shows combined list to user

User clicks "Install Java":
   ├── Download OpenJDK zip from your CDN (~180MB)
   ├── Show progress bar (downloaded: 45MB / 180MB)
   ├── Extract to ~/.Colon/compilers/java/
   ├── Update compilers.json with path
   └── Show ✅ Installed
```

---

## 3.4 Remote Language Registry

Host this JSON on your server (GitHub Pages, S3, or any static host). The app fetches it on startup to know what versions are available and where to download.

```json
{
  "lastUpdated": "2026-03-05",
  "languages": {
    "python": {
      "name": "Python",
      "icon": "🐍",
      "versions": ["3.12.3", "3.11.9"],
      "latest": "3.12.3",
      "downloads": {
        "3.12.3": {
          "linux-x64": {
            "url": "https://your-cdn.com/compilers/python-3.12.3-linux-x64.tar.gz",
            "size": 31457280,
            "sha256": "abc123..."
          },
          "win-x64": {
            "url": "https://your-cdn.com/compilers/python-3.12.3-win-x64.zip",
            "size": 28311552,
            "sha256": "def456..."
          },
          "mac-x64": {
            "url": "https://your-cdn.com/compilers/python-3.12.3-mac-x64.tar.gz",
            "size": 30408704,
            "sha256": "ghi789..."
          }
        }
      },
      "runCommand": "{path}/python3",
      "testCommand": "{path}/python3 --version",
      "dependencies": []
    },
    "cpp": {
      "name": "C++ (GCC)",
      "icon": "⚙️",
      "versions": ["13.2"],
      "latest": "13.2",
      "downloads": {
        "13.2": {
          "linux-x64": {
            "url": "https://your-cdn.com/compilers/gcc-13.2-linux-x64.tar.gz",
            "size": 157286400,
            "sha256": "..."
          },
          "win-x64": {
            "url": "https://your-cdn.com/compilers/mingw-13.2-win-x64.zip",
            "size": 167772160,
            "sha256": "..."
          }
        }
      },
      "compileCommand": "{path}/g++ {file} -o {output}",
      "runCommand": "{output}",
      "testCommand": "{path}/g++ --version",
      "dependencies": []
    },
    "java": {
      "name": "Java (OpenJDK)",
      "icon": "☕",
      "versions": ["21.0.2"],
      "latest": "21.0.2",
      "downloads": { "..." : "..." },
      "compileCommand": "{path}/javac {file}",
      "runCommand": "{path}/java -cp {dir} {classname}",
      "testCommand": "{path}/javac -version",
      "dependencies": []
    },
    "node": {
      "name": "Node.js",
      "icon": "🟢",
      "versions": ["20.11.1"],
      "latest": "20.11.1",
      "downloads": { "..." : "..." },
      "runCommand": "{path}/node {file}",
      "testCommand": "{path}/node --version",
      "dependencies": []
    },
    "manim": {
      "name": "Manim (Animation Engine)",
      "icon": "🎬",
      "versions": ["0.20.1"],
      "latest": "0.20.1",
      "installMethod": "pip",
      "installCommand": "{python_path} -m pip install manim",
      "testCommand": "{python_path} -m manim --version",
      "dependencies": ["python"]
    }
  }
}
```

---

## 3.5 Implementation — Main Process

```javascript
// backend/services/languageManager.js
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { createWriteStream } = require('fs');
const extract = require('extract-zip');
const { execSync } = require('child_process');

const COMPILERS_DIR = path.join(app.getPath('userData'), 'compilers');
const CONFIG_PATH = path.join(COMPILERS_DIR, 'compilers.json');
const REGISTRY_URL = 'https://your-server.com/compiler-registry.json';

// Ensure directories exist
if (!fs.existsSync(COMPILERS_DIR)) fs.mkdirSync(COMPILERS_DIR, { recursive: true });

// ==================
// Read local config
// ==================
function getInstalledLanguages() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ==================
// Auto-detect system compilers
// ==================
function detectSystemCompilers() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const detected = {};

  const checks = {
    python: ['python3', 'python'],
    cpp: ['g++', 'gcc'],
    java: ['javac'],
    node: ['node'],
    manim: ['manim'],
  };

  for (const [lang, commands] of Object.entries(checks)) {
    for (const command of commands) {
      try {
        const result = execSync(`${cmd} ${command}`, { encoding: 'utf-8' }).trim();
        if (result) {
          detected[lang] = {
            installed: true,
            source: 'system',
            path: result.split('\n')[0],
            version: getVersion(command),
          };
          break;
        }
      } catch { /* not found */ }
    }
  }
  return detected;
}

function getVersion(command) {
  try {
    const out = execSync(`${command} --version`, { encoding: 'utf-8' });
    const match = out.match(/(\d+\.\d+[\.\d]*)/);
    return match ? match[1] : 'unknown';
  } catch { return 'unknown'; }
}

// ==================
// Download + Install
// ==================
async function installLanguage(langName, registry, mainWindow) {
  const platform = getPlatformKey();
  const langInfo = registry.languages[langName];
  const version = langInfo.latest;

  // Special case: Manim installs via pip
  if (langInfo.installMethod === 'pip') {
    return installViaPip(langName, langInfo, mainWindow);
  }

  const downloadInfo = langInfo.downloads[version][platform];
  if (!downloadInfo) throw new Error(`No download for ${platform}`);

  const destDir = path.join(COMPILERS_DIR, langName);
  const tempFile = path.join(COMPILERS_DIR, `${langName}-download.zip`);

  // Step 1: Download with progress
  await downloadFile(downloadInfo.url, tempFile, (progress) => {
    mainWindow.webContents.send('lang:progress', {
      lang: langName,
      phase: 'downloading',
      percent: progress,
    });
  });

  // Step 2: Extract
  mainWindow.webContents.send('lang:progress', {
    lang: langName, phase: 'extracting', percent: 0,
  });

  if (tempFile.endsWith('.zip')) {
    await extract(tempFile, { dir: destDir });
  } else {
    execSync(`tar -xzf "${tempFile}" -C "${destDir}"`);
  }

  // Step 3: Cleanup temp file
  fs.unlinkSync(tempFile);

  // Step 4: Find the binary and update config
  const binaryPath = findBinary(destDir, langName);
  const config = getInstalledLanguages();
  config[langName] = {
    installed: true,
    source: 'app',
    path: binaryPath,
    version: version,
    directory: destDir,
  };
  saveConfig(config);

  mainWindow.webContents.send('lang:progress', {
    lang: langName, phase: 'complete', percent: 100,
  });

  return config[langName];
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    https.get(url, (response) => {
      const total = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        file.write(chunk);
        if (total) onProgress(Math.round((downloaded / total) * 100));
      });

      response.on('end', () => { file.end(); resolve(); });
      response.on('error', reject);
    }).on('error', reject);
  });
}

function getPlatformKey() {
  const p = process.platform;
  const a = process.arch;
  if (p === 'linux' && a === 'x64') return 'linux-x64';
  if (p === 'win32' && a === 'x64') return 'win-x64';
  if (p === 'darwin' && a === 'x64') return 'mac-x64';
  if (p === 'darwin' && a === 'arm64') return 'mac-arm64';
  throw new Error(`Unsupported platform: ${p}-${a}`);
}

// ==================
// IPC Handlers
// ==================
function registerLanguageManagerIPC(mainWindow) {
  // Get merged list (system-detected + app-installed)
  ipcMain.handle('lang:list', async () => {
    const system = detectSystemCompilers();
    const app = getInstalledLanguages();
    // Merge: app-installed takes priority
    return { ...system, ...app };
  });

  ipcMain.handle('lang:install', async (event, langName) => {
    const res = await fetch(REGISTRY_URL);
    const registry = await res.json();
    return installLanguage(langName, registry, mainWindow);
  });

  ipcMain.handle('lang:remove', async (event, langName) => {
    const config = getInstalledLanguages();
    if (config[langName] && config[langName].source === 'app') {
      fs.rmSync(config[langName].directory, { recursive: true, force: true });
      delete config[langName];
      saveConfig(config);
    }
    return config;
  });
}

module.exports = { registerLanguageManagerIPC };
```

---

## 3.6 Where Compilers Are Stored

| OS | App Data Path | Compilers Path |
|---|---|---|
| Linux | `~/.config/Colon/` | `~/.Colon/compilers/` |
| macOS | `~/Library/Application Support/Colon/` | Same |
| Windows | `%APPDATA%/Colon/` | Same |

```
~/.Colon/compilers/
├── compilers.json              # Tracks all installations
├── python/
│   └── bin/python3             # Python binary
├── cpp/
│   └── bin/g++                 # GCC binary
├── java/
│   └── bin/javac               # JDK binary
└── node/
    └── bin/node                # Node.js binary
```

---

## 3.7 Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | Language Manager UI with install/uninstall | ⬜ |
| 2 | Remote registry JSON hosted | ⬜ |
| 3 | Download with progress bar | ⬜ |
| 4 | Extract + configure compiler path | ⬜ |
| 5 | Auto-detect system compilers | ⬜ |
| 6 | Cross-platform (Linux/Windows/macOS) paths | ⬜ |
| 7 | Manim installed via pip | ⬜ |
| 8 | Uninstall removes compiler files | ⬜ |
