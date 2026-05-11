/**
 * Colon IDE — Main Process Entry Point
 *
 * Architecture: Thin orchestrator that registers modular IPC handlers.
 * Each domain (filesystem, search, terminal, environment, animation, window)
 * has its own handler module in the ipc/ directory.
 *
 * Security model:
 * - contextIsolation: true, nodeIntegration: false
 * - All filesystem ops sandboxed via isPathWithinWorkspace()
 * - Custom colon-media:// protocol for secure video serving
 * - Script validation via services/scriptValidator.js
 */

const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Services
const { startLspServer, stopLspServer, getLspToken } = require('./services/lspServer');

// IPC Handler Modules
const { registerFileSystemHandlers } = require('./ipc/fileSystemHandlers');
const { registerSearchHandlers } = require('./ipc/searchHandlers');
const { registerTerminalHandlers, killAllPtyProcesses } = require('./ipc/terminalHandlers');
const { registerEnvironmentHandlers } = require('./ipc/environmentHandlers');
const { registerAnimationHandlers } = require('./ipc/animationHandlers');
const { registerWindowHandlers } = require('./ipc/windowHandlers');

// ── State ──
let mainWindow = null;
let lastOpenedDir = null;
const explicitlyAllowedFiles = new Set();

// ── Helpers ──
function getMainWindow() { return mainWindow; }
function getLastOpenedDir() { return lastOpenedDir; }
function setLastOpenedDir(dir) { lastOpenedDir = dir; }
function resolveDefaultCwd(cwd) { return cwd || lastOpenedDir || os.homedir(); }

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

// ── Register Custom Protocol (must be before app.whenReady) ──
protocol.registerSchemesAsPrivileged([{
    scheme: 'colon-media',
    privileges: { stream: true, supportFetchAPI: true, bypassCSP: true }
}]);

// ── Shared context for all IPC handler modules ──
const sharedContext = {
    getMainWindow,
    isPathWithinWorkspace,
    getLastOpenedDir,
    setLastOpenedDir,
    resolveDefaultCwd,
    explicitlyAllowedFiles,
    createWindow: () => createWindow(),
};

// ── Register all IPC handlers ──
ipcMain.handle('lsp:getToken', () => getLspToken());

registerFileSystemHandlers(sharedContext);
registerSearchHandlers(sharedContext);
registerTerminalHandlers(sharedContext);
registerEnvironmentHandlers(sharedContext);
registerAnimationHandlers();
registerWindowHandlers(sharedContext);

// ── Window Creation ──
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

    mainWindow.removeMenu();

    // Load the frontend
    const isDev = !app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        const prodPath = path.join(__dirname, 'frontend-dist', 'index.html');
        console.log('[main.js] Loading production frontend from:', prodPath);
        console.log('[main.js] File exists:', fs.existsSync(prodPath));
        mainWindow.loadFile(prodPath);
    }

    // ── Production Error Diagnostics ──
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        console.error(`[main.js] Page failed to load: ${errorDescription} (code: ${errorCode}, url: ${validatedURL})`);
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        console.error('[main.js] Render process gone:', details.reason);
    });

    mainWindow.webContents.on('console-message', (_event, level, message) => {
        if (level >= 2) { // warnings and errors only
            console.warn(`[renderer] ${message}`);
        }
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize();
    });
}

// ── App Lifecycle ──
app.whenReady().then(() => {
    // Register the colon-media:// protocol handler for serving local video files
    protocol.handle('colon-media', (request) => {
        try {
            const url = new URL(request.url);
            const filePath = decodeURIComponent(url.searchParams.get('path') || '');
            if (!filePath) return new Response('Missing path parameter', { status: 400 });

            const ext = path.extname(filePath).toLowerCase();
            if (!['.mp4', '.webm', '.mov'].includes(ext)) {
                return new Response('Only video files are allowed', { status: 403 });
            }

            const normalized = filePath.replace(/\\/g, '/').toLowerCase();
            if (!normalized.includes('.colon/') && !normalized.includes('/tmp/') && !normalized.includes('/temp/')) {
                console.warn('[main.js] colon-media blocked — path not in .colon:', filePath);
                return new Response('Access denied', { status: 403 });
            }

            const { pathToFileURL } = require('url');
            return net.fetch(pathToFileURL(filePath).href);
        } catch (err) {
            console.error('[main.js] colon-media protocol error:', err);
            return new Response('Internal error', { status: 500 });
        }
    });

    createWindow();
    return undefined;
}).catch((err) => {
    console.error('[main.js] Failed to create window:', err);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    killAllPtyProcesses();
    stopLspServer();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
