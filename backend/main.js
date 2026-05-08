const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');
const os = require('os');
const { spawn } = require('child_process');
const {
    scanEnvironments,
    getRuntimeForExtension,
    buildRunCommand,
    RUNTIMES,
    createRuntimeEnv,
    getRuntimeInstallPlan
} = require('./services/envScanner');
const { lintCode } = require('./services/linterService');

// LLM Animation Engine
const { detectBlocks, extToLanguage } = require('./services/blockDetectorUniversal');
const { generateAnimation, loadAnimations, deleteAnimation: deleteAnim, clearAnimations } = require('./services/animationGenerator');
const { isConfigured: isLlmConfigured, getConfig: getLlmConfig } = require('./services/llmService');
const { generateManimVideo, loadManimVideos, deleteManimVideo, cancelManimVideo } = require('./services/manimService');
const { checkAnimEngine, installAnimEngine } = require('./services/animEngineService');
const { startLspServer, getLspToken } = require('./services/lspServer');

ipcMain.handle('lsp:getToken', () => getLspToken());

// Load environment variables via dotenv
require('dotenv').config({ path: path.join(__dirname, '.env') });

let lastOpenedDir = null;
const explicitlyAllowedFiles = new Set();

function resolveDefaultCwd(cwd) {
    return cwd || lastOpenedDir || os.homedir();
}

/**
 * Security: Validate that a given path is within the current workspace root.
 * Prevents the renderer from accessing arbitrary filesystem paths.
 */
function isPathWithinWorkspace(targetPath) {
    try {
        const resolved = path.resolve(targetPath);
        if (lastOpenedDir) {
            const workspace = path.resolve(lastOpenedDir);
            const relative = path.relative(workspace, resolved);
            if (relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative))) {
                return true;
            }
        }
        return explicitlyAllowedFiles.has(resolved);
    } catch {
        return false;
    }
}

// IPC Handlers for file system
ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled) return null;
    lastOpenedDir = path.resolve(filePaths[0]);
    return lastOpenedDir;
});

ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'All Files', extensions: ['*'] },
            { name: 'Source Code', extensions: ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'md', 'txt', 'sh', 'bat'] },
        ]
    });
    if (canceled) return null;
    for (const filePath of filePaths) {
        explicitlyAllowedFiles.add(path.resolve(filePath));
    }
    return filePaths;
});

ipcMain.handle('fs:readDirectory', async (event, dirPath) => {
    if (!isPathWithinWorkspace(dirPath)) {
        console.warn('[main.js] readDirectory blocked — path outside workspace:', dirPath);
        return [];
    }
    try {
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const files = items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.join(dirPath, item.name)
        }));
        return files.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
    } catch (error) {
        console.error("Error reading directory:", error);
        return [];
    }
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
    if (!isPathWithinWorkspace(filePath)) {
        console.warn('[main.js] readFile blocked — path outside workspace:', filePath);
        throw new Error('Access denied: path outside workspace');
    }
    console.log('[main.js] readFile called for:', filePath);
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        console.log('[main.js] readFile success, length:', content.length);
        return content;
    } catch (error) {
        console.error("[main.js] Error reading file:", error);
        throw error;
    }
});

ipcMain.handle('fs:writeFile', async (event, { filePath, content }) => {
    if (!isPathWithinWorkspace(filePath)) {
        console.warn('[main.js] writeFile blocked — path outside workspace:', filePath);
        return false;
    }
    try {
        await fs.promises.writeFile(filePath, content, 'utf-8');
        return true;
    } catch (error) {
        console.error("Error writing file:", error);
        return false;
    }
});

ipcMain.handle('fs:delete', async (event, targetPath) => {
    if (!isPathWithinWorkspace(targetPath)) {
        console.warn('[main.js] delete blocked — path outside workspace:', targetPath);
        return false;
    }
    try {
        const stats = await fs.promises.stat(targetPath);
        if (stats.isDirectory()) {
            await fs.promises.rm(targetPath, { recursive: true, force: true });
        } else {
            await fs.promises.unlink(targetPath);
        }
        return true;
    } catch (error) {
        console.error("Error deleting:", error);
        return false;
    }
});

ipcMain.handle('fs:rename', async (event, { oldPath, newPath }) => {
    if (!isPathWithinWorkspace(oldPath) || !isPathWithinWorkspace(newPath)) {
        console.warn('[main.js] rename blocked — path outside workspace');
        return false;
    }
    try {
        await fs.promises.rename(oldPath, newPath);
        return true;
    } catch (error) {
        console.error("Error renaming:", error);
        return false;
    }
});

ipcMain.handle('fs:createFile', async (event, filePath) => {
    if (!isPathWithinWorkspace(filePath)) {
        console.warn('[main.js] createFile blocked — path outside workspace:', filePath);
        return false;
    }
    try {
        await fs.promises.writeFile(filePath, '', 'utf-8');
        return true;
    } catch (error) {
        console.error("Error creating file:", error);
        return false;
    }
});

ipcMain.handle('fs:createDirectory', async (event, dirPath) => {
    if (!isPathWithinWorkspace(dirPath)) {
        console.warn('[main.js] createDirectory blocked — path outside workspace:', dirPath);
        return false;
    }
    try {
        await fs.promises.mkdir(dirPath, { recursive: true });
        return true;
    } catch (error) {
        console.error("Error creating directory:", error);
        return false;
    }
});

/* ── Search in Files ── */

const BINARY_EXTS = new Set([
    'png','jpg','jpeg','gif','webp','bmp','ico','svg','pdf',
    'zip','tar','gz','7z','rar','exe','dll','so','bin',
    'mp3','mp4','wav','avi','mov','mkv','webm',
    'ttf','woff','woff2','eot','class','pyc','pyo',
    'lock','map'
]);

const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.colon', 'dist', 'build', '.next', '.venv', 'venv']);

async function collectFiles(dir, maxFiles = 2000) {
    const files = [];
    async function walk(d) {
        if (files.length >= maxFiles) return;
        let entries;
        try { entries = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (files.length >= maxFiles) break;
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) await walk(path.join(d, entry.name));
            } else {
                const ext = entry.name.split('.').pop()?.toLowerCase() || '';
                if (!BINARY_EXTS.has(ext)) {
                    files.push(path.join(d, entry.name));
                }
            }
        }
    }
    await walk(dir);
    return files;
}

ipcMain.handle('search:inFiles', async (event, query, options) => {
    console.log('[main.js] searchInFiles called with:', { query, lastOpenedDir });
    if (!lastOpenedDir || !query) return { success: false, grouped: [], totalMatches: 0 };
    try {
        const { caseSensitive = false, wholeWord = false, useRegex = false } = options || {};
        let pattern;
        try {
            const escaped = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordBound = wholeWord ? `\\b${escaped}\\b` : escaped;
            pattern = new RegExp(wordBound, caseSensitive ? 'g' : 'gi');
        } catch { return { success: false, grouped: [], totalMatches: 0 }; }

        const files = await collectFiles(lastOpenedDir);
        console.log(`[main.js] searchInFiles found ${files.length} files to scan`);
        const grouped = [];
        let totalMatches = 0;

        for (const filePath of files) {
            let content;
            try { content = await fs.promises.readFile(filePath, 'utf-8'); } catch { continue; }
            const lines = content.split(/\r?\n/);
            const matches = [];

            for (let i = 0; i < lines.length; i += 1) {
                const line = lines[i];
                let m;
                pattern.lastIndex = 0;
                while ((m = pattern.exec(line)) !== null) {
                    matches.push({
                        filePath,
                        fileName: path.basename(filePath),
                        lineNumber: i + 1,
                        lineContent: line.substring(0, 200),
                        matchStart: m.index,
                        matchEnd: m.index + m[0].length,
                    });
                    totalMatches += 1;
                    if (totalMatches > 5000) break;
                    
                    // Prevent infinite loops on empty matches (e.g. `.*?` or `^`)
                    if (m[0].length === 0) {
                        pattern.lastIndex += 1;
                    }
                }
                if (totalMatches > 5000) break;
            }

            if (matches.length > 0) {
                grouped.push({ filePath, fileName: path.basename(filePath), matches });
            }
            if (totalMatches > 5000) break;
        }

        return { success: true, grouped, totalMatches };
    } catch (err) {
        console.error('[main.js] searchInFiles error:', err);
        return { success: false, grouped: [], totalMatches: 0 };
    }
});

ipcMain.handle('search:replaceInFiles', async (event, query, replacement, options) => {
    if (!lastOpenedDir || !query) return { success: false, replacedCount: 0 };
    try {
        const { caseSensitive = false, wholeWord = false, useRegex = false } = options || {};
        let pattern;
        try {
            const escaped = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordBound = wholeWord ? `\\b${escaped}\\b` : escaped;
            pattern = new RegExp(wordBound, caseSensitive ? 'g' : 'gi');
        } catch { return { success: false, replacedCount: 0 }; }

        const files = await collectFiles(lastOpenedDir);
        let replacedCount = 0;

        for (const filePath of files) {
            let content;
            try { content = await fs.promises.readFile(filePath, 'utf-8'); } catch { continue; }
            const newContent = content.replace(pattern, () => { replacedCount += 1; return replacement; });
            if (newContent !== content) {
                await fs.promises.writeFile(filePath, newContent, 'utf-8');
            }
        }

        return { success: true, replacedCount };
    } catch (err) {
        console.error('[main.js] replaceInFiles error:', err);
        return { success: false, replacedCount: 0 };
    }
});

/* ── Environment Scanner & Code Runner IPC ── */

let cachedEnvironments = null;
const runtimeInstallProcesses = {};

function getInstallShellConfig(command) {
    if (process.platform === 'win32') {
        // Use PowerShell for installs: winget is an App Execution Alias that
        // resolves more reliably in PowerShell than in cmd.exe on some PCs.
        return {
            shell: 'powershell.exe',
            args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]
        };
    }
    return { shell: 'bash', args: ['-lc', command] };
}

ipcMain.handle('env:scan', async () => {
    console.log('[main.js] Scanning environments...');
    cachedEnvironments = await scanEnvironments();
    const summary = Object.keys(cachedEnvironments)
        .map(k => `${k}: ${cachedEnvironments[k].installed ? '✓' : '✗'}`)
        .join(', ');
    console.log('[main.js] Scan complete:', summary);
    return cachedEnvironments;
});

ipcMain.handle('env:get', async () => {
    if (!cachedEnvironments) {
        cachedEnvironments = await scanEnvironments();
    }
    return cachedEnvironments;
});

ipcMain.handle('env:getInstallCommand', async (event, runtimeId) => {
    try {
        const runtime = RUNTIMES.find((r) => r.id === runtimeId);
        if (!runtime) {
            return { success: false, reason: `Unknown runtime: ${runtimeId}` };
        }
        if (!cachedEnvironments) {
            cachedEnvironments = await scanEnvironments();
        }
        if (cachedEnvironments[runtimeId]?.installed) {
            return { success: false, alreadyInstalled: true, reason: `${runtime.name} is already installed.` };
        }
        const runtimeEnv = await createRuntimeEnv();
        const installPlan = await getRuntimeInstallPlan(runtime, cachedEnvironments, runtimeEnv);
        if (!installPlan.ok) {
            return { success: false, reason: installPlan.reason };
        }
        return {
            success: true,
            command: installPlan.displayCommand || installPlan.command,
            runtimeId,
            runtimeName: runtime.name,
            manager: installPlan.manager,
            requiresElevation: Boolean(installPlan.requiresElevation)
        };
    } catch (err) {
        return { success: false, reason: err.message };
    }
});

ipcMain.handle('env:installRuntime', async (event, runtimeId) => {
    try {
        const runtime = RUNTIMES.find((r) => r.id === runtimeId);
        if (!runtime) {
            return { success: false, reason: `Unknown runtime id: ${runtimeId}` };
        }

        if (!cachedEnvironments) {
            cachedEnvironments = await scanEnvironments();
        }

        if (cachedEnvironments[runtime.id]?.installed) {
            return {
                success: true,
                alreadyInstalled: true,
                runtimeId: runtime.id,
                runtimeName: runtime.name,
                reason: `${runtime.name} is already installed.`
            };
        }

        const runtimeEnv = await createRuntimeEnv();
        const installPlan = await getRuntimeInstallPlan(runtime, cachedEnvironments, runtimeEnv);
        if (!installPlan.ok) {
            return {
                success: false,
                reason: installPlan.reason
            };
        }

        const installCmd = installPlan.command;
        const installId = `${runtimeId}-${Date.now()}`;
        const { shell, args } = getInstallShellConfig(installCmd);
        const child = spawn(shell, args, {
            cwd: os.homedir(),
            env: runtimeEnv.env,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        runtimeInstallProcesses[installId] = child;
        let outputBuffer = '';

        const sendEvent = (type, message, extra = {}) => {
            if (!event.sender.isDestroyed()) {
                event.sender.send('env:install:event', {
                    installId,
                    runtimeId,
                    runtimeName: runtime.name,
                    type,
                    message,
                    timestamp: Date.now(),
                    ...extra
                });
            }
        };

        sendEvent('start', `Installing ${runtime.name} with ${installPlan.manager}...`);
        if (installPlan.requiresElevation) {
            sendEvent('stdout', 'A Windows administrator permission prompt may appear. Approve it to continue the install.\n');
        }
        sendEvent('command', installPlan.displayCommand || installCmd, {
            manager: installPlan.manager,
            requiresElevation: installPlan.requiresElevation
        });

        child.stdout.on('data', (data) => {
            const text = data.toString();
            outputBuffer += text;
            if (outputBuffer.length > 20000) outputBuffer = outputBuffer.slice(-16000);
            sendEvent('stdout', text);
        });

        child.stderr.on('data', (data) => {
            const text = data.toString();
            outputBuffer += text;
            if (outputBuffer.length > 20000) outputBuffer = outputBuffer.slice(-16000);
            sendEvent('stderr', text);
        });

        child.on('error', (err) => {
            delete runtimeInstallProcesses[installId];
            sendEvent('error', err.message);
        });

        child.on('close', async (code, signal) => {
            delete runtimeInstallProcesses[installId];
            const validExitCodes = installPlan.validExitCodes || [0];
            const commandSucceeded = code !== null && validExitCodes.includes(code);

            // Re-scan with retries: PATH registry updates can take several seconds
            // to propagate, especially with WinGet. Try up to 3 times with
            // increasing delays before giving up.
            let verified = false;
            const delays = [3000, 5000, 7000];
            for (let attempt = 0; attempt < delays.length; attempt += 1) {
                sendEvent('stdout', `\nVerifying installation (attempt ${attempt + 1}/${delays.length})...\n`);
                await new Promise(resolve => setTimeout(resolve, delays[attempt]));
                // Force a completely fresh scan (re-reads registry PATH)
                cachedEnvironments = await scanEnvironments();
                verified = Boolean(cachedEnvironments[runtime.id]?.installed);
                if (verified) {
                    console.log(`[main.js] ${runtime.name} verified on attempt ${attempt + 1}`);
                    break;
                }
                console.log(`[main.js] ${runtime.name} not detected on attempt ${attempt + 1}, retrying...`);
            }

            const success = verified;
            const exitText = signal
                ? `Install process stopped (${signal}).`
                : `Install process exited with code ${code}.`;
            const verifyText = verified
                ? `${runtime.name} is ready.`
                : `${runtime.name} was not detected after installation. ${commandSucceeded ? 'Restart Colon or check PATH if the installer says it completed.' : 'The installer command did not complete successfully; check the log above.'}`;

            sendEvent('exit', `${exitText} ${verifyText}`, {
                code,
                signal,
                success,
                verified,
                manager: installPlan.manager,
                installed: cachedEnvironments[runtime.id] || null
            });
        });

        return {
            success: true,
            installId,
            runtimeId,
            runtimeName: runtime.name,
            command: installPlan.displayCommand || installCmd,
            manager: installPlan.manager,
            requiresElevation: installPlan.requiresElevation
        };
    } catch (err) {
        return { success: false, reason: err.message };
    }
});

ipcMain.handle('env:cancelRuntimeInstall', async (event, installId) => {
    try {
        const proc = runtimeInstallProcesses[installId];
        if (!proc) {
            return { success: false, reason: 'No active install process found.' };
        }
        if (process.platform === 'win32') {
            spawn('taskkill.exe', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true });
        } else {
            proc.kill('SIGTERM');
        }
        return { success: true };
    } catch (err) {
        return { success: false, reason: err.message };
    }
});

/**
 * Get the run command for a file.
 * The frontend will type this command into the active terminal.
 * Returns: { success, command, runtime } or { success: false, reason, runtime }
 */
ipcMain.handle('code:getRunCommand', async (event, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const runtime = getRuntimeForExtension(ext);

    if (!runtime) {
        return { success: false, reason: `No runtime configured for "${ext}" files.` };
    }

    if (!cachedEnvironments) {
        cachedEnvironments = await scanEnvironments();
    }

    const envInfo = cachedEnvironments[runtime.id];
    if (!envInfo || !envInfo.installed) {
        return {
            success: false,
            reason: `${runtime.name} is not installed.`,
            runtime: envInfo || {
                id: runtime.id,
                name: runtime.name,
                installed: false,
                installCmd: runtime.installCmd[process.platform] || null
            }
        };
    }

    // Build the actual shell command
    const command = buildRunCommand(runtime.id, envInfo, filePath);
    return { success: true, command, runtime: envInfo };
});

ipcMain.handle('code:lint', async (event, { filePath, content }) => {
    try {
        return await lintCode(filePath, content);
    } catch (err) {
        console.error('[main.js] Linting error:', err);
        return [];
    }
});

/* ── LLM Animation Engine IPC ── */

ipcMain.handle('animation:detectBlocksUniversal', async (event, { code, language }) => {
    try {
        const blocks = detectBlocks(code, language);
        return { success: true, blocks };
    } catch (err) {
        console.error('[main.js] Universal block detection error:', err);
        return { success: false, error: err.message, blocks: [] };
    }
});

ipcMain.handle('animation:generateAnimation', async (event, { filePath, code, language, blockInfo }) => {
    try {
        const record = await generateAnimation(filePath, code, language, blockInfo);
        return { success: true, record };
    } catch (err) {
        console.error('[main.js] Animation generation error:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('animation:loadAnimations', async (event, filePath) => {
    try {
        const animations = loadAnimations(filePath);
        return { success: true, animations };
    } catch (err) {
        return { success: false, error: err.message, animations: [] };
    }
});

ipcMain.handle('animation:deleteAnimation', async (event, { filePath, animId }) => {
    try {
        return { success: deleteAnim(filePath, animId) };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('animation:clearAnimations', async (event, filePath) => {
    try {
        return { success: clearAnimations(filePath) };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('animation:getLlmStatus', async () => {
    return {
        configured: isLlmConfigured(),
        config: getLlmConfig(),
    };
});

ipcMain.handle('animation:cancel', async () => {
    // Soft cancel signal (handled in frontend via ignoring promise)
    // No backend abort logic for Gemini yet since fetch isn't exposed with AbortSignal
    return { success: true };
});

// Git Integration

/* ── Manim Video IPC ── */

ipcMain.handle('manim:generate', async (event, { filePath, code, language }) => {
    try {
        const record = await generateManimVideo(filePath, code, language);
        return { success: true, record };
    } catch (err) {
        console.error('[main.js] Manim generation error:', err.message);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('manim:cancel', async () => {
    cancelManimVideo();
    return { success: true };
});

ipcMain.handle('manim:loadVideos', async (event, filePath) => {
    try {
        const videos = loadManimVideos(filePath);
        return { success: true, videos };
    } catch (err) {
        return { success: false, error: err.message, videos: [] };
    }
});

ipcMain.handle('manim:delete', async (event, { filePath, videoId }) => {
    try {
        return { success: deleteManimVideo(filePath, videoId) };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

/* ── Colon Animation Engine IPC ── */

ipcMain.handle('animEngine:check', async () => {
    try {
        return await checkAnimEngine();
    } catch (err) {
        return { installed: false, error: err.message };
    }
});

ipcMain.handle('animEngine:install', async (event) => {
    try {
        const result = await installAnimEngine((msg) => {
            // Send progress to renderer
            event.sender.send('animEngine:install:progress', msg);
        });
        return result;
    } catch (err) {
        return { success: false, error: err.message };
    }
});





const ptyProcesses = {};

ipcMain.on('terminal-create', (event, payload) => {
    // payload can be a string (terminalId) or { terminalId, cwd }
    const terminalId = typeof payload === 'string' ? payload : payload.terminalId;
    const cwd = (typeof payload === 'object' && payload.cwd && isPathWithinWorkspace(payload.cwd))
        ? payload.cwd
        : resolveDefaultCwd();

    // Pick the best shell for the platform.
    // Windows: pwsh (PS7, supports &&) → cmd.exe (supports &&) → powershell.exe (fallback)
    // macOS/Linux: user's $SHELL → bash
    // Windows is pinned to cmd.exe so PATH refresh commands work consistently.
    let shell, shellArgs;
    if (process.platform === 'win32') {
        shell = process.env.ComSpec || 'cmd.exe';
        shellArgs = [];
    } else {
        shell = process.env.SHELL || '/bin/bash';
        shellArgs = ['--login'];
    }

    // Prevent zombie PTYs if frontend reconnects/remounts the same terminal ID
    if (ptyProcesses[terminalId]) {
        try {
            ptyProcesses[terminalId].kill();
        } catch (e) {
            console.error('Failed to kill existing PTY:', e);
        }
        delete ptyProcesses[terminalId];
    }

    const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
    });

    ptyProcesses[terminalId] = ptyProcess;

    ptyProcess.onData((data) => {
        // Guard: don't send to a destroyed renderer (avoids uncaught exception on window close)
        if (!event.sender.isDestroyed()) {
            event.sender.send(`terminal-incoming-data-${terminalId}`, data);
        }
    });
});

ipcMain.on('terminal-input', (event, { terminalId, data }) => {
    const ptyProcess = ptyProcesses[terminalId];
    if (ptyProcess) {
        ptyProcess.write(data);
    }
});

ipcMain.on('terminal-resize', (event, { terminalId, cols, rows }) => {
    const ptyProcess = ptyProcesses[terminalId];
    if (ptyProcess) {
        ptyProcess.resize(cols, rows);
    }
});

ipcMain.on('terminal-kill', (event, terminalId) => {
    const ptyProcess = ptyProcesses[terminalId];
    if (ptyProcess) {
        ptyProcess.kill();
        delete ptyProcesses[terminalId];
    }
});

let mainWindow;

function createWindow() {
    startLspServer();

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
        },
        backgroundColor: '#0a0e17',
        frame: false,
        show: false,
    });

    // Remove the default OS/Application menu bar
    mainWindow.removeMenu();

    // Load React app
    if (process.env.NODE_ENV !== 'production') {
        const tryPorts = [5173, 5174, 5175];
        let loaded = false;

        const loadWithCheck = async (port) => {
            if (loaded) return;
            try {
                await mainWindow.loadURL(`http://localhost:${port}`);
                loaded = true;
                console.log(`Loaded on port ${port}`);
            } catch (e) {
                console.log(`Port ${port} failed, trying next...`);
            }
        };

        (async () => {
            for (const port of tryPorts) {
                await loadWithCheck(port);
                if (loaded) break;
            }
            if (!loaded) console.error("Could not load frontend on any port.");
        })();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

}



// Window control — registered once at module level to avoid duplicate handlers on macOS
ipcMain.on('window-control', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    switch (action) {
        case 'minimize':
            win.minimize();
            break;
        case 'maximize':
            if (win.isMaximized()) {
                win.unmaximize();
            } else {
                win.maximize();
            }
            break;
        case 'close':
            win.close();
            break;
    }
});

ipcMain.on('window-new', () => {
    createWindow();
});

app.whenReady().then(() => {
    createWindow();
    return undefined;
}).catch((err) => {
    console.error('[main.js] Failed to create window:', err);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Kill all orphaned PTY processes when the app fully quits
app.on('will-quit', () => {
    for (const [id, ptyProcess] of Object.entries(ptyProcesses)) {
        try { ptyProcess.kill(); } catch { /* ignore */ }
        delete ptyProcesses[id];
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
