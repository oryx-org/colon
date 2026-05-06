const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class DebugService {
    constructor() {
        this.activeSessions = new Map();
        this.nextSessionId = 1;
    }

    resolveLanguage(filePath, language) {
        if (language) return String(language).toLowerCase();
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.py') return 'python';
        if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.ts') return 'javascript';
        return 'unknown';
    }

    startSession(filePath, language, options = {}) {
        if (!filePath) {
            return { success: false, error: 'Missing file path' };
        }
        if (!fs.existsSync(filePath)) {
            return { success: false, error: `File not found: ${filePath}` };
        }

        const resolvedLanguage = this.resolveLanguage(filePath, language);
        const cwd = options.cwd || path.dirname(filePath);

        let cmd;
        let args;
        if (resolvedLanguage === 'python') {
            cmd = options.pythonCommand || (process.platform === 'win32' ? 'python' : 'python3');
            args = ['-m', 'pdb', filePath];
        } else if (resolvedLanguage === 'javascript') {
            cmd = options.nodeCommand || 'node';
            args = ['--inspect-brk', filePath];
        } else {
            return {
                success: false,
                error: `Debugging is currently supported for JavaScript/TypeScript and Python only. Received: ${resolvedLanguage}`
            };
        }

        const child = spawn(cmd, args, {
            cwd,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const id = this.nextSessionId++;
        const session = {
            id,
            child,
            filePath,
            language: resolvedLanguage,
            state: 'starting',
            output: [],
            startedAt: Date.now(),
            exited: false,
            exitCode: null,
            exitSignal: null
        };

        const appendOutput = (chunk, stream) => {
            const text = chunk.toString();
            session.output.push({ stream, text, ts: Date.now() });
            if (session.output.length > 400) {
                session.output = session.output.slice(-400);
            }

            if (resolvedLanguage === 'python' && text.includes('(Pdb)')) {
                session.state = 'paused';
            }
            if (resolvedLanguage === 'javascript') {
                if (text.toLowerCase().includes('break in')) session.state = 'paused';
                if (text.toLowerCase().includes('debug>')) session.state = 'paused';
            }
        };

        child.stdout.on('data', (data) => appendOutput(data, 'stdout'));
        child.stderr.on('data', (data) => appendOutput(data, 'stderr'));

        child.on('error', (err) => {
            session.output.push({ stream: 'stderr', text: err.message, ts: Date.now() });
            session.state = 'error';
        });

        child.on('close', (code, signal) => {
            session.exited = true;
            session.exitCode = code;
            session.exitSignal = signal;
            session.state = 'stopped';
            this.activeSessions.delete(id);
        });

        this.activeSessions.set(id, session);

        return {
            success: true,
            sessionId: id,
            pid: child.pid,
            language: resolvedLanguage,
            status: 'started'
        };
    }

    sendStep(sessionId, action) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return { success: false, error: 'Session not found' };

        const maps = {
            python: {
                continue: 'c\n',
                stepOver: 'n\n',
                stepInto: 's\n',
                stepOut: 'r\n',
                pause: 'where\n'
            },
            javascript: {
                continue: 'cont\n',
                stepOver: 'next\n',
                stepInto: 'step\n',
                stepOut: 'out\n',
                pause: 'pause\n'
            }
        };

        const command = maps[session.language]?.[action];
        if (!command) {
            return { success: false, error: `Unsupported action: ${action}` };
        }

        try {
            session.child.stdin.write(command);
            session.state = action === 'continue' ? 'running' : 'paused';
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    getSessionStatus(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return { success: false, error: 'Session not found' };

        return {
            success: true,
            session: {
                sessionId: session.id,
                pid: session.child.pid,
                state: session.state,
                language: session.language,
                filePath: session.filePath,
                startedAt: session.startedAt,
                exited: session.exited,
                exitCode: session.exitCode,
                exitSignal: session.exitSignal
            },
            output: session.output.slice(-80)
        };
    }

    stopSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return { success: false, error: 'Session not found' };

        try {
            process.platform === 'win32' ? session.child.kill() : session.child.kill('SIGTERM');
            this.activeSessions.delete(sessionId);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

module.exports = new DebugService();
