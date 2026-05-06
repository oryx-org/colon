# 🎬 Phase 5 — Manim Integration (Local Rendering)

> **Timeline**: Week 5–7  
> **Team**: ML/Manim Engineer + 1 Electron developer  
> **Goal**: User clicks "Analyze" → LLM generates Manim script → Manim renders MP4 locally → video plays

---

## 5.1 Objectives

- [ ] Build the full Analyze pipeline (code → LLM → script → validate → render → play)
- [ ] Call LLM API from Electron main process
- [ ] Validate generated Manim scripts (security)
- [ ] Execute Manim locally via child_process
- [ ] Stream render progress to UI
- [ ] Cache results (same code = skip re-rendering)

---

## 5.2 End-to-End Pipeline

```
User clicks "Analyze"
    │
    ▼
┌────────────────────────────────────────────────┐
│  STEP 1: Hash the code                         │
│  SHA-256(code + language)                       │
│  Check cache: ~/.Colon/cache/{hash}.mp4    │
│  Found? → Return cached video instantly ⚡      │
└────────────────┬───────────────────────────────┘
                 │ MISS
                 ▼
┌────────────────────────────────────────────────┐
│  STEP 2: Call LLM API                           │
│  Send: system prompt + user code                │
│  Receive: Manim Python script                   │
│  Progress → 20%                                 │
└────────────────┬───────────────────────────────┘
                 ▼
┌────────────────────────────────────────────────┐
│  STEP 3: Validate script                        │
│  Parse Python AST                               │
│  Block dangerous imports (os, sys, subprocess)  │
│  Verify Scene class exists                      │
│  Progress → 30%                                 │
└────────────────┬───────────────────────────────┘
                 ▼
┌────────────────────────────────────────────────┐
│  STEP 4: Write script + run Manim              │
│  Write to: /tmp/Colon_{hash}/animation.py  │
│  Execute: manim animation.py SceneName -ql      │
│  Progress → 40-90%                              │
└────────────────┬───────────────────────────────┘
                 ▼
┌────────────────────────────────────────────────┐
│  STEP 5: Collect output                         │
│  Find MP4 in Manim's output directory           │
│  Copy to cache: ~/.Colon/cache/{hash}.mp4  │
│  Progress → 100%                                │
│  Send video path to renderer                    │
└────────────────────────────────────────────────┘
```

---

## 5.3 Implementation

```javascript
// backend/services/manimRenderer.js
const { ipcMain, app } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { callLLM } = require('./llmClient');
const { validateScript } = require('./scriptValidator');

const CACHE_DIR = path.join(app.getPath('userData'), 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function registerManimIPC(mainWindow) {

  ipcMain.handle('analyze:code', async (event, code, language) => {
    try {
      const send = (phase, percent, extra = {}) => {
        mainWindow.webContents.send('analyze:progress', { phase, percent, ...extra });
      };

      // Step 1: Check cache
      const hash = crypto.createHash('sha256').update(code + language).digest('hex');
      const cachedPath = path.join(CACHE_DIR, `${hash}.mp4`);

      if (fs.existsSync(cachedPath)) {
        mainWindow.webContents.send('analyze:complete', {
          videoPath: cachedPath,
          cached: true,
        });
        return;
      }

      // Step 2: Call LLM
      send('Analyzing code...', 10);
      const manimScript = await callLLM(code, language);
      if (!manimScript) throw new Error('LLM failed to generate animation script');
      send('Script generated', 25);

      // Step 3: Validate
      send('Validating script...', 30);
      const validation = validateScript(manimScript);
      if (!validation.valid) {
        throw new Error(`Security check failed: ${validation.error}`);
      }
      send('Script validated', 35);

      // Step 4: Render
      send('Rendering animation...', 40);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'Colon-manim-'));
      const scriptPath = path.join(tmpDir, 'animation.py');
      fs.writeFileSync(scriptPath, manimScript);

      const sceneName = extractSceneName(manimScript);
      const manimPath = getManimPath();

      const result = await runManim(manimPath, scriptPath, sceneName, tmpDir, (progress) => {
        send('Rendering animation...', 40 + Math.floor(progress * 0.5));
      });

      if (!result.success) {
        // Retry once with error feedback
        send('Fixing script...', 60);
        const fixedScript = await callLLM(code, language, result.error);
        const fixValidation = validateScript(fixedScript);
        if (!fixValidation.valid) throw new Error('Retry also failed validation');

        fs.writeFileSync(scriptPath, fixedScript);
        const retryResult = await runManim(manimPath, scriptPath,
          extractSceneName(fixedScript), tmpDir);
        if (!retryResult.success) throw new Error(`Render failed: ${retryResult.error}`);
        result.videoPath = retryResult.videoPath;
      }

      // Step 5: Cache + return
      send('Finalizing...', 95);
      fs.copyFileSync(result.videoPath, cachedPath);

      // Cleanup tmp
      fs.rmSync(tmpDir, { recursive: true, force: true });

      mainWindow.webContents.send('analyze:complete', {
        videoPath: cachedPath,
        cached: false,
      });

    } catch (err) {
      mainWindow.webContents.send('analyze:error', { message: err.message });
    }
  });
}

function runManim(manimPath, scriptPath, sceneName, tmpDir, onProgress) {
  return new Promise((resolve) => {
    const proc = spawn(manimPath, [
      scriptPath, sceneName, '-ql', '--media_dir', tmpDir
    ], { cwd: tmpDir, timeout: 120000 });

    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      // Parse Manim progress from stderr (e.g., "Animation 3/10")
      const match = d.toString().match(/(\d+)%/);
      if (match && onProgress) onProgress(parseInt(match[1]) / 100);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        // Find the mp4
        const videoPath = findMp4(tmpDir);
        resolve({ success: true, videoPath });
      } else {
        resolve({ success: false, error: stderr.slice(-500) });
      }
    });
  });
}

function findMp4(dir) {
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { const r = walk(full); if (r) return r; }
      else if (entry.name.endsWith('.mp4')) return full;
    }
    return null;
  };
  return walk(dir);
}

function extractSceneName(script) {
  const match = script.match(/class\s+(\w+)\s*\(\s*Scene\s*\)/);
  return match ? match[1] : 'MainScene';
}

function getManimPath() {
  const configPath = path.join(app.getPath('userData'), 'compilers', 'compilers.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.manim?.path) return config.manim.path;
  }
  // Fallback: try system manim
  try { execSync('which manim'); return 'manim'; } catch {}
  throw new Error('Manim not installed. Go to Settings → Language Manager.');
}

module.exports = { registerManimIPC };
```

---

## 5.4 Script Validator

```javascript
// backend/services/scriptValidator.js
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

function validateScript(script) {
  // Write a Python validation script
  const validatorPy = `
import ast, sys, json

BLOCKED_IMPORTS = {'os','sys','subprocess','socket','http','urllib',
  'requests','shutil','pathlib','io','pickle','importlib','ctypes','signal'}
BLOCKED_FUNCS = {'exec','eval','compile','open','__import__','globals','locals'}

try:
    tree = ast.parse(sys.argv[1] if len(sys.argv)>1 else sys.stdin.read())
except SyntaxError as e:
    print(json.dumps({"valid":False,"error":f"Syntax error: {e}"}))
    sys.exit(0)

for node in ast.walk(tree):
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
        for name in names:
            root = name.split('.')[0]
            if root in BLOCKED_IMPORTS:
                print(json.dumps({"valid":False,"error":f"Blocked import: {name}"}))
                sys.exit(0)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        if node.func.id in BLOCKED_FUNCS:
            print(json.dumps({"valid":False,"error":f"Blocked function: {node.func.id}"}))
            sys.exit(0)

has_scene = any(isinstance(n, ast.ClassDef) and any(
    (isinstance(b, ast.Name) and b.id=='Scene') or
    (isinstance(b, ast.Attribute) and b.attr=='Scene')
    for b in n.bases) for n in ast.walk(tree))

if not has_scene:
    print(json.dumps({"valid":False,"error":"No class extending Scene found"}))
else:
    print(json.dumps({"valid":True,"error":""}))
`;

  const tmpFile = path.join(os.tmpdir(), 'Colon_validator.py');
  const scriptFile = path.join(os.tmpdir(), 'Colon_tovalidate.py');
  fs.writeFileSync(tmpFile, validatorPy);
  fs.writeFileSync(scriptFile, script);

  try {
    const result = execSync(`python3 "${tmpFile}" < "${scriptFile}"`, {
      encoding: 'utf-8', timeout: 5000
    });
    return JSON.parse(result.trim());
  } catch (err) {
    return { valid: false, error: 'Validation process failed' };
  }
}

module.exports = { validateScript };
```

---

## 5.5 Local Caching

```
~/.Colon/cache/
├── a1b2c3d4...hash.mp4     # Cached video
├── e5f6g7h8...hash.mp4
└── ...

Cache policy:
- TTL: 30 days
- Max size: 2 GB
- LRU eviction when limit reached
```

---

## 5.6 Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | LLM called from Electron main process | ⬜ |
| 2 | Generated script validated for security | ⬜ |
| 3 | Manim renders MP4 locally | ⬜ |
| 4 | Progress updates stream to UI (0-100%) | ⬜ |
| 5 | Video auto-plays in animation panel | ⬜ |
| 6 | Cache hit returns instant video | ⬜ |
| 7 | Retry with error feedback on failure | ⬜ |
| 8 | Explanation text shown alongside video | ⬜ |
