const WebSocket = require('ws');
const { spawn, execFileSync } = require('child_process');
const path = require('path');

let wss = null;

/** Find a binary on PATH, returns null if not found */
function findBin(name) {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    try {
        return execFileSync(finder, [name], { timeout: 3000 }).toString().trim().split('\n')[0];
    } catch {
        return null;
    }
}

const crypto = require('crypto');

let lspToken = crypto.randomBytes(16).toString('hex');

function getLspToken() {
    return lspToken;
}

function getNodeCommand() {
    return process.versions.electron ? 'node' : process.execPath;
}

function spawnCommand(command, args = [], options = {}) {
    return spawn(command, args, {
        ...options,
        windowsHide: true,
    });
}

function startLspServer() {
    if (wss) {
        return;
    }

    // Start WebSocket server on port 3001, binding ONLY to localhost (127.0.0.1) for security
    wss = new WebSocket.Server({ port: 3001, host: '127.0.0.1' });

    wss.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error('[lspServer.js] Port 3001 is already in use. LSP features will be unavailable.');
        } else {
            console.error('[lspServer.js] WebSocket server error:', err.message);
        }
        try { wss.close(); } catch { /* ignore */ }
        wss = null;
    });

    wss.on('listening', () => {
        console.log('[lspServer.js] LSP WebSocket Server started on ws://127.0.0.1:3001');
    });

    wss.on('connection', (ws, req) => {
        // Parse URL: /<lang>?token=<token>
        let urlObj;
        try {
            urlObj = new URL(req.url || '/', 'ws://127.0.0.1:3001');
        } catch {
            ws.close(4000, 'Bad request');
            return;
        }
        const lang = urlObj.pathname.substring(1);
        const token = urlObj.searchParams.get('token');

        // Security check: require correct token and origin
        if (token !== lspToken) {
            console.warn('[lspServer.js] Rejected connection: invalid or missing security token.');
            ws.close(4003, 'Forbidden');
            return;
        }

        console.log(`[lspServer.js] New secure connection for language: ${lang}`);

        let lsProcess = null;

        try {
            if (lang === 'python') {
                const pyrightScript = path.join(__dirname, '..', 'node_modules', 'pyright', 'langserver.index.js');
                lsProcess = spawnCommand(getNodeCommand(), [pyrightScript, '--stdio']);
                console.log('[lspServer.js] Spawned pyright-langserver');

            } else if (lang === 'javascript' || lang === 'typescript' ||
                       lang === 'javascriptreact' || lang === 'typescriptreact') {
                const tslsScript = path.join(__dirname, '..', 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs');
                lsProcess = spawnCommand(getNodeCommand(), [tslsScript, '--stdio'], {
                    env: { ...process.env, TSS_LOG: '' }
                });
                console.log('[lspServer.js] Spawned typescript-language-server');

            } else if (lang === 'go') {
                const gopls = findBin('gopls');
                if (!gopls) {
                    console.warn('[lspServer.js] gopls not found. Install with: go install golang.org/x/tools/gopls@latest');
                    ws.close();
                    return;
                }
                lsProcess = spawnCommand(gopls, ['serve']);
                console.log('[lspServer.js] Spawned gopls');

            } else if (lang === 'rust') {
                const ra = findBin('rust-analyzer');
                if (!ra) {
                    console.warn('[lspServer.js] rust-analyzer not found. Install from: https://rust-analyzer.github.io');
                    ws.close();
                    return;
                }
                lsProcess = spawnCommand(ra, []);
                console.log('[lspServer.js] Spawned rust-analyzer');

            } else {
                console.log(`[lspServer.js] No LSP server configured for: ${lang}`);
                ws.close();
                return;
            }
        } catch (err) {
            console.error(`[lspServer.js] Failed to spawn ${lang} language server:`, err.message);
            ws.close(1011, 'Language server failed to start');
            return;
        }

        lsProcess.on('error', (err) => {
            console.error(`[lspServer.js] ${lang} server error:`, err.message);
            if (ws.readyState === WebSocket.OPEN) {
                ws.close(1011, 'Language server error');
            }
        });

        // Bridge: Language Server stdout -> WebSocket
        lsProcess.stdout.on('data', (data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        // Bridge: WebSocket -> Language Server stdin
        ws.on('message', (msg) => {
            if (lsProcess && !lsProcess.killed) {
                // Buffer because the message might be text or binary, but lsProcess needs buffer
                lsProcess.stdin.write(msg);
            }
        });

        // Handle errors
        lsProcess.stderr.on('data', (data) => {
            console.error(`[lspServer.js] ${lang} stderr:`, data.toString());
        });

        ws.on('close', () => {
            console.log(`[lspServer.js] Connection closed for ${lang}, killing process.`);
            if (lsProcess && !lsProcess.killed) {
                lsProcess.kill();
            }
        });

        lsProcess.on('exit', (code) => {
            console.log(`[lspServer.js] ${lang} server exited with code ${code}`);
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        });
    });
}

function stopLspServer() {
    if (wss) {
        wss.close();
        wss = null;
    }
}

module.exports = { startLspServer, stopLspServer, getLspToken };
