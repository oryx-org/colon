/**
 * Terminal IPC Handlers
 * Manages PTY processes for the integrated terminal.
 */
const os = require('os');
const { ipcMain } = require('electron');
const pty = require('node-pty');

const ptyProcesses = {};

function registerTerminalHandlers({ isPathWithinWorkspace, resolveDefaultCwd }) {
    ipcMain.on('terminal-create', (event, payload) => {
        const terminalId = typeof payload === 'string' ? payload : payload.terminalId;
        const cwd = (typeof payload === 'object' && payload.cwd && isPathWithinWorkspace(payload.cwd))
            ? payload.cwd : resolveDefaultCwd();

        let shell, shellArgs;
        if (process.platform === 'win32') {
            shell = process.env.ComSpec || 'cmd.exe';
            shellArgs = [];
        } else {
            shell = process.env.SHELL || '/bin/bash';
            shellArgs = ['--login'];
        }

        if (ptyProcesses[terminalId]) {
            try { ptyProcesses[terminalId].kill(); } catch (e) { console.error('Failed to kill PTY:', e); }
            delete ptyProcesses[terminalId];
        }

        const ptyProcess = pty.spawn(shell, shellArgs, {
            name: 'xterm-256color', cols: 80, rows: 24, cwd,
            env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
        });
        ptyProcesses[terminalId] = ptyProcess;
        ptyProcess.onData((data) => {
            if (!event.sender.isDestroyed()) event.sender.send(`terminal-incoming-data-${terminalId}`, data);
        });
    });

    ipcMain.on('terminal-input', (event, { terminalId, data }) => {
        if (ptyProcesses[terminalId]) ptyProcesses[terminalId].write(data);
    });

    ipcMain.on('terminal-resize', (event, { terminalId, cols, rows }) => {
        if (ptyProcesses[terminalId]) ptyProcesses[terminalId].resize(cols, rows);
    });

    ipcMain.on('terminal-kill', (event, terminalId) => {
        if (ptyProcesses[terminalId]) { ptyProcesses[terminalId].kill(); delete ptyProcesses[terminalId]; }
    });
}

function killAllPtyProcesses() {
    for (const [id, p] of Object.entries(ptyProcesses)) {
        try { p.kill(); } catch { /* ignore */ }
        delete ptyProcesses[id];
    }
}

module.exports = { registerTerminalHandlers, killAllPtyProcesses };
