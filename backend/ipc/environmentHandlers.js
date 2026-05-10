/**
 * Environment & Code Runner IPC Handlers
 * Handles runtime scanning, installation, and code execution.
 */
const os = require('os');
const path = require('path');
const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const {
    scanEnvironments, getRuntimeForExtension, buildRunCommand,
    RUNTIMES, createRuntimeEnv, getRuntimeInstallPlan
} = require('../services/envScanner');
const { lintCode } = require('../services/linterService');
const { runCode } = require('../services/codeRunner');

let cachedEnvironments = null;
const runtimeInstallProcesses = {};
const activeRunProcesses = {};

function getInstallShellConfig(command) {
    if (process.platform === 'win32') {
        return { shell: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command] };
    }
    return { shell: 'bash', args: ['-lc', command] };
}

function registerEnvironmentHandlers({ isPathWithinWorkspace }) {
    ipcMain.handle('env:scan', async () => {
        cachedEnvironments = await scanEnvironments();
        const summary = Object.keys(cachedEnvironments).map(k => `${k}: ${cachedEnvironments[k].installed ? '✓' : '✗'}`).join(', ');
        console.log('[envHandlers] Scan complete:', summary);
        return cachedEnvironments;
    });

    ipcMain.handle('env:get', async () => {
        if (!cachedEnvironments) cachedEnvironments = await scanEnvironments();
        return cachedEnvironments;
    });

    ipcMain.handle('env:getInstallCommand', async (event, runtimeId) => {
        try {
            const runtime = RUNTIMES.find((r) => r.id === runtimeId);
            if (!runtime) return { success: false, reason: `Unknown runtime: ${runtimeId}` };
            if (!cachedEnvironments) cachedEnvironments = await scanEnvironments();
            if (cachedEnvironments[runtimeId]?.installed) return { success: false, alreadyInstalled: true, reason: `${runtime.name} is already installed.` };
            const runtimeEnv = await createRuntimeEnv();
            const installPlan = await getRuntimeInstallPlan(runtime, cachedEnvironments, runtimeEnv);
            if (!installPlan.ok) return { success: false, reason: installPlan.reason };
            return { success: true, command: installPlan.displayCommand || installPlan.command, runtimeId, runtimeName: runtime.name, manager: installPlan.manager, requiresElevation: Boolean(installPlan.requiresElevation) };
        } catch (err) { return { success: false, reason: err.message }; }
    });

    ipcMain.handle('env:installRuntime', async (event, runtimeId) => {
        try {
            const runtime = RUNTIMES.find((r) => r.id === runtimeId);
            if (!runtime) return { success: false, reason: `Unknown runtime id: ${runtimeId}` };
            if (!cachedEnvironments) cachedEnvironments = await scanEnvironments();
            if (cachedEnvironments[runtime.id]?.installed) {
                return { success: true, alreadyInstalled: true, runtimeId: runtime.id, runtimeName: runtime.name, reason: `${runtime.name} is already installed.` };
            }
            const runtimeEnv = await createRuntimeEnv();
            const installPlan = await getRuntimeInstallPlan(runtime, cachedEnvironments, runtimeEnv);
            if (!installPlan.ok) return { success: false, reason: installPlan.reason };

            const installCmd = installPlan.command;
            const installId = `${runtimeId}-${Date.now()}`;
            const { shell, args } = getInstallShellConfig(installCmd);
            const child = spawn(shell, args, { cwd: os.homedir(), env: runtimeEnv.env, stdio: ['pipe', 'pipe', 'pipe'] });
            runtimeInstallProcesses[installId] = child;

            const sendEvent = (type, message, extra = {}) => {
                if (!event.sender.isDestroyed()) {
                    event.sender.send('env:install:event', { installId, runtimeId, runtimeName: runtime.name, type, message, timestamp: Date.now(), ...extra });
                }
            };

            sendEvent('start', `Installing ${runtime.name} with ${installPlan.manager}...`);
            if (installPlan.requiresElevation) sendEvent('stdout', 'A Windows administrator permission prompt may appear.\n');
            sendEvent('command', installPlan.displayCommand || installCmd, { manager: installPlan.manager, requiresElevation: installPlan.requiresElevation });

            let outputBuffer = '';
            child.stdout.on('data', (data) => { const t = data.toString(); outputBuffer += t; if (outputBuffer.length > 20000) outputBuffer = outputBuffer.slice(-16000); sendEvent('stdout', t); });
            child.stderr.on('data', (data) => { const t = data.toString(); outputBuffer += t; if (outputBuffer.length > 20000) outputBuffer = outputBuffer.slice(-16000); sendEvent('stderr', t); });
            child.on('error', (err) => { delete runtimeInstallProcesses[installId]; sendEvent('error', err.message); });

            child.on('close', async (code, signal) => {
                delete runtimeInstallProcesses[installId];
                const validExitCodes = installPlan.validExitCodes || [0];
                const commandSucceeded = code !== null && validExitCodes.includes(code);
                let verified = false;
                const delays = [3000, 5000, 7000];
                for (let attempt = 0; attempt < delays.length; attempt += 1) {
                    sendEvent('stdout', `\nVerifying installation (attempt ${attempt + 1}/${delays.length})...\n`);
                    await new Promise(resolve => setTimeout(resolve, delays[attempt]));
                    cachedEnvironments = await scanEnvironments();
                    verified = Boolean(cachedEnvironments[runtime.id]?.installed);
                    if (verified) break;
                }
                const exitText = signal ? `Install process stopped (${signal}).` : `Install process exited with code ${code}.`;
                const verifyText = verified ? `${runtime.name} is ready.` : `${runtime.name} was not detected. ${commandSucceeded ? 'Restart Colon or check PATH.' : 'The installer did not complete successfully.'}`;
                sendEvent('exit', `${exitText} ${verifyText}`, { code, signal, success: verified, verified, manager: installPlan.manager, installed: cachedEnvironments[runtime.id] || null });
            });

            return { success: true, installId, runtimeId, runtimeName: runtime.name, command: installPlan.displayCommand || installCmd, manager: installPlan.manager, requiresElevation: installPlan.requiresElevation };
        } catch (err) { return { success: false, reason: err.message }; }
    });

    ipcMain.handle('env:cancelRuntimeInstall', async (event, installId) => {
        try {
            const proc = runtimeInstallProcesses[installId];
            if (!proc) return { success: false, reason: 'No active install process found.' };
            if (process.platform === 'win32') { spawn('taskkill.exe', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }); }
            else { proc.kill('SIGTERM'); }
            return { success: true };
        } catch (err) { return { success: false, reason: err.message }; }
    });

    ipcMain.handle('code:getRunCommand', async (event, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const runtime = getRuntimeForExtension(ext);
        if (!runtime) return { success: false, reason: `No runtime configured for "${ext}" files.` };
        if (!cachedEnvironments) cachedEnvironments = await scanEnvironments();
        const envInfo = cachedEnvironments[runtime.id];
        if (!envInfo || !envInfo.installed) {
            return { success: false, reason: `${runtime.name} is not installed.`, runtime: envInfo || { id: runtime.id, name: runtime.name, installed: false, installCmd: runtime.installCmd[process.platform] || null } };
        }
        const command = buildRunCommand(runtime.id, envInfo, filePath);
        return { success: true, command, runtime: envInfo };
    });

    // code:run — Execute a code file with 30-second timeout and output streaming
    ipcMain.handle('code:run', async (event, { filePath, runtimeId }) => {
        try {
            if (!isPathWithinWorkspace(filePath)) {
                return { success: false, error: 'Access denied: path outside workspace' };
            }
            if (!cachedEnvironments) cachedEnvironments = await scanEnvironments();
            const envInfo = cachedEnvironments[runtimeId];
            if (!envInfo || !envInfo.installed) {
                return { success: false, error: `${runtimeId} is not installed.` };
            }

            const runId = `run-${Date.now()}`;
            const killFn = runCode(filePath, runtimeId, envInfo.command, (type, data) => {
                if (!event.sender.isDestroyed()) {
                    event.sender.send('code:run:output', { runId, type, data });
                }
            });
            activeRunProcesses[runId] = killFn;
            return { success: true, runId };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('code:kill', async (event, runId) => {
        try {
            const killFn = activeRunProcesses[runId];
            if (killFn) { killFn(); delete activeRunProcesses[runId]; }
            return { success: true };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('code:lint', async (event, { filePath, content }) => {
        try { return await lintCode(filePath, content); }
        catch (err) { console.error('[envHandlers] Linting error:', err); return []; }
    });
}

module.exports = { registerEnvironmentHandlers };
