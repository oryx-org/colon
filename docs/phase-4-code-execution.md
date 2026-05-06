# ▶️ Phase 4 — Code Execution Engine

> **Timeline**: Week 4–6  
> **Team**: 1 Electron developer  
> **Goal**: Users can write code and run it locally using installed compilers, with output shown in terminal

---

## 4.1 Objectives

- [ ] Run code for Python, C++, Java, JavaScript using local compilers
- [ ] Capture stdout/stderr and stream to terminal panel
- [ ] Handle compilation step (C++, Java) before execution
- [ ] Support stdin input during execution
- [ ] Implement timeout to prevent infinite loops
- [ ] Show exit code and execution time

---

## 4.2 Execution Flow

```
User clicks ▶ Run
    │
    ├── Get current file's code + language
    ├── Write code to temp file
    │
    ├── Is compiled language? (C++, Java)
    │   ├── YES → Compile first
    │   │   ├── Success → Execute binary
    │   │   └── Error → Show compile error in terminal
    │   └── NO → Execute directly (Python, JS)
    │
    ├── Capture stdout → stream to terminal
    ├── Capture stderr → stream to terminal (in red)
    │
    └── Process exits
        ├── Show exit code
        └── Show execution time
```

---

## 4.3 Implementation

```javascript
// backend/services/codeRunner.js
const { ipcMain } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let currentProcess = null;

function getCompilerPath(language) {
  // Read from compilers.json
  const configPath = path.join(
    require('electron').app.getPath('userData'),
    'compilers', 'compilers.json'
  );
  if (!fs.existsSync(configPath)) return null;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return config[language]?.path || null;
}

function registerCodeRunnerIPC(mainWindow) {

  ipcMain.handle('code:run', async (event, code, language, filePath) => {
    // Kill any existing process
    if (currentProcess) {
      currentProcess.kill();
      currentProcess = null;
    }

    const startTime = Date.now();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'Colon-'));

    try {
      let cmd, args;

      switch (language) {
        case 'python': {
          const pyPath = getCompilerPath('python');
          if (!pyPath) throw new Error('Python not installed. Go to Settings → Language Manager.');
          const tempFile = path.join(tmpDir, 'main.py');
          fs.writeFileSync(tempFile, code);
          cmd = pyPath;
          args = [tempFile];
          break;
        }

        case 'cpp': {
          const gccPath = getCompilerPath('cpp');
          if (!gccPath) throw new Error('C++ compiler not installed. Go to Settings → Language Manager.');
          const srcFile = path.join(tmpDir, 'main.cpp');
          const outFile = path.join(tmpDir, 'main');
          fs.writeFileSync(srcFile, code);

          // Compile
          mainWindow.webContents.send('code:output', {
            type: 'info', text: '⚙️ Compiling...\n'
          });

          try {
            execSync(`"${gccPath}" "${srcFile}" -o "${outFile}"`, {
              encoding: 'utf-8', timeout: 15000
            });
          } catch (compileErr) {
            mainWindow.webContents.send('code:output', {
              type: 'error', text: compileErr.stderr || compileErr.stdout || compileErr.message
            });
            mainWindow.webContents.send('code:exit', { code: 1, time: Date.now() - startTime });
            return;
          }

          mainWindow.webContents.send('code:output', {
            type: 'info', text: '✅ Compiled successfully\n\n'
          });

          cmd = outFile;
          args = [];
          break;
        }

        case 'java': {
          const javaPath = getCompilerPath('java');
          if (!javaPath) throw new Error('Java not installed. Go to Settings → Language Manager.');
          const javacPath = javaPath; // javac
          const javaRunPath = javaPath.replace('javac', 'java');

          // Extract class name
          const classMatch = code.match(/class\s+(\w+)/);
          const className = classMatch ? classMatch[1] : 'Main';
          const srcFile = path.join(tmpDir, `${className}.java`);
          fs.writeFileSync(srcFile, code);

          // Compile
          mainWindow.webContents.send('code:output', {
            type: 'info', text: '⚙️ Compiling...\n'
          });

          try {
            execSync(`"${javacPath}" "${srcFile}"`, {
              encoding: 'utf-8', timeout: 15000
            });
          } catch (compileErr) {
            mainWindow.webContents.send('code:output', {
              type: 'error', text: compileErr.stderr || compileErr.message
            });
            mainWindow.webContents.send('code:exit', { code: 1, time: Date.now() - startTime });
            return;
          }

          mainWindow.webContents.send('code:output', {
            type: 'info', text: '✅ Compiled successfully\n\n'
          });

          cmd = javaRunPath;
          args = ['-cp', tmpDir, className];
          break;
        }

        case 'javascript': {
          const nodePath = getCompilerPath('node');
          if (!nodePath) throw new Error('Node.js not installed. Go to Settings → Language Manager.');
          const tempFile = path.join(tmpDir, 'main.js');
          fs.writeFileSync(tempFile, code);
          cmd = nodePath;
          args = [tempFile];
          break;
        }

        default:
          throw new Error(`Unsupported language: ${language}`);
      }

      // Execute
      mainWindow.webContents.send('code:output', {
        type: 'info', text: `▶ Running ${language}...\n`
      });

      currentProcess = spawn(cmd, args, {
        cwd: tmpDir,
        timeout: 30000,  // 30 sec max
      });

      currentProcess.stdout.on('data', (data) => {
        mainWindow.webContents.send('code:output', {
          type: 'stdout', text: data.toString()
        });
      });

      currentProcess.stderr.on('data', (data) => {
        mainWindow.webContents.send('code:output', {
          type: 'stderr', text: data.toString()
        });
      });

      currentProcess.on('close', (exitCode) => {
        const elapsed = Date.now() - startTime;
        mainWindow.webContents.send('code:output', {
          type: 'info',
          text: `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Process exited with code ${exitCode} (${elapsed}ms)\n`
        });
        mainWindow.webContents.send('code:exit', { code: exitCode, time: elapsed });
        currentProcess = null;

        // Cleanup temp dir
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      currentProcess.on('error', (err) => {
        mainWindow.webContents.send('code:output', {
          type: 'error', text: `Execution error: ${err.message}\n`
        });
        currentProcess = null;
      });

    } catch (err) {
      mainWindow.webContents.send('code:output', {
        type: 'error', text: `❌ ${err.message}\n`
      });
      mainWindow.webContents.send('code:exit', { code: 1, time: Date.now() - startTime });
    }
  });

  // Kill running process
  ipcMain.handle('code:kill', () => {
    if (currentProcess) {
      currentProcess.kill('SIGTERM');
      currentProcess = null;
      mainWindow.webContents.send('code:output', {
        type: 'info', text: '\n⛔ Process killed by user\n'
      });
    }
  });
}

module.exports = { registerCodeRunnerIPC };
```

---

## 4.4 Terminal Output Formatting

```
▶ Running python...
Hello World!
The sum is: 15

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Process exited with code 0 (42ms)
```

For C++/Java with compilation step:
```
⚙️ Compiling...
✅ Compiled successfully

▶ Running cpp...
Sorted array: 1 2 3 4 5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Process exited with code 0 (156ms)
```

For errors:
```
⚙️ Compiling...
main.cpp:5:10: error: expected ';' after expression
    int x = 5
             ^

Process exited with code 1 (12ms)
```

---

## 4.5 Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | Python execution working | ⬜ |
| 2 | C++ compile + execute working | ⬜ |
| 3 | Java compile + execute working | ⬜ |
| 4 | JavaScript execution working | ⬜ |
| 5 | stdout/stderr streams to terminal | ⬜ |
| 6 | 30-second timeout enforced | ⬜ |
| 7 | Kill button stops running process | ⬜ |
| 8 | Temp files cleaned up after exit | ⬜ |
