/**
 * Colon Animation Engine Service
 * 
 * Checks and installs the animation engine (internally: manim + ffmpeg).
 * The name "manim" is NEVER exposed to the user.
 */

const { exec, execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { resolveExecutable, createRuntimeEnv } = require('./envScanner');

// Persistent cache file to remember the last successful detection across restarts
const CACHE_DIR = path.join(require('os').homedir(), '.colon');
const CACHE_FILE = path.join(CACHE_DIR, 'engine-status.json');

/**
 * Read cached engine status from disk.
 * @returns {object|null}
 */
function readCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
            const data = JSON.parse(raw);
            // Cache valid for 30 days (2592000000 ms)
            if (data && data.timestamp && (Date.now() - data.timestamp) < 2592000000) {
                return data.status;
            }
        }
    } catch { /* ignore corrupt cache */ }
    return null;
}

/**
 * Write engine status to cache.
 * @param {object} status
 */
function writeCache(status) {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ status, timestamp: Date.now() }), 'utf-8');
    } catch { /* ignore write errors */ }
}

/**
 * Invalidate the cache (e.g. after an install attempt).
 */
function clearCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
    } catch { /* ignore */ }
}

/**
 * Run a full command string through the system shell (cmd/bash).
 * Use this for simple commands where args don't contain shell metacharacters
 * that could be misinterpreted. Gets proper PATH resolution.
 * @returns {Promise<string|null>} combined output or null
 */
function runShellCmd(cmdString, env) {
    return new Promise((resolve) => {
        try {
            exec(cmdString, { timeout: 15000, env: env || process.env }, (error, stdout, stderr) => {
                if (error) {
                    resolve(null);
                    return;
                }
                resolve((stdout || '') + (stderr || ''));
            });
        } catch {
            resolve(null);
        }
    });
}

/**
 * Run a command with an args array via execFile (NO shell).
 * Use this when args contain semicolons or other shell metacharacters
 * (e.g. Python -c "import foo; print(bar)") that a shell would misinterpret.
 * @returns {Promise<string|null>} combined output or null
 */
function runDirect(cmd, args, env) {
    return new Promise((resolve) => {
        try {
            execFile(cmd, args, { timeout: 15000, env: env || process.env }, (error, stdout, stderr) => {
                if (error) {
                    resolve(null);
                    return;
                }
                resolve((stdout || '') + (stderr || ''));
            });
        } catch {
            resolve(null);
        }
    });
}

/**
 * Find the real Python 3 executable using envScanner's robust detection.
 * This handles Windows Store stubs, PATH resolution, and common install directories.
 * @returns {Promise<{found: boolean, command: string, env: object}>}
 */
async function findPython() {
    const runtimeEnv = await createRuntimeEnv();
    const env = runtimeEnv.env;

    // Try multiple probe commands in order of preference
    const probes = process.platform === 'win32'
        ? ['python3', 'python', 'py']
        : ['python3', 'python'];

    for (const probe of probes) {
        const resolved = resolveExecutable(probe, env);
        if (!resolved) continue;

        // Verify it's actually Python 3 (not Python 2)
        const output = await runDirect(resolved, ['--version'], env);
        if (output && /python\s+3/i.test(output)) {
            console.log(`[animEngine] Found Python: ${resolved} => ${output.trim()}`);
            return { found: true, command: resolved, env };
        }
    }

    // Last resort: check common install directories directly
    const commonPaths = process.platform === 'win32' ? [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python'),
        'C:\\Python313', 'C:\\Python314', 'C:\\Python312', 'C:\\Python311',
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0'),
    ] : ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin'];

    for (const dir of commonPaths) {
        try {
            if (!fs.existsSync(dir)) continue;
            const entries = fs.readdirSync(dir);
            // Look for versioned Python directories (e.g., Python313/)
            for (const entry of entries) {
                const fullDir = path.join(dir, entry);
                const exeName = process.platform === 'win32' ? 'python.exe' : 'python3';
                const candidates = [
                    path.join(fullDir, exeName),
                    path.join(dir, exeName),
                ];
                for (const candidate of candidates) {
                    try {
                        if (!fs.existsSync(candidate)) continue;
                        const stat = fs.statSync(candidate);
                        if (!stat.isFile() || stat.size < 1024) continue;
                        const output = await runDirect(candidate, ['--version'], env);
                        if (output && /python\s+3/i.test(output)) {
                            console.log(`[animEngine] Found Python via directory scan: ${candidate} => ${output.trim()}`);
                            return { found: true, command: candidate, env };
                        }
                    } catch { /* skip */ }
                }
            }
        } catch { /* skip inaccessible dirs */ }
    }

    console.log('[animEngine] Python 3 not found by any method');
    return { found: false, command: '', env };
}

/**
 * Check all animation engine dependencies.
 * @returns {Promise<object>} { installed, pythonFound, engineFound, ffmpegFound, engineVersion, details }
 */
async function checkAnimEngine() {
    const result = {
        installed: false,
        pythonFound: false,
        engineFound: false,
        ffmpegFound: false,
        ffmpegPath: null,
        engineVersion: null,
        details: '',
    };

    // 1. Find Python using robust detection
    const python = await findPython();
    result.pythonFound = python.found;

    if (!result.pythonFound) {
        result.details = 'Python 3 is required but not found. Install Python first from the Extensions tab.';
        return result;
    }

    const pythonCmd = python.command;
    const env = python.env;

    // 2. Check manim via multiple methods for resilience
    let manimOutput = null;

    // Method A: python -m manim --version (direct, no shell)
    manimOutput = await runDirect(pythonCmd, ['-m', 'manim', '--version'], env);

    // Method B: direct "manim --version" on PATH
    if (!manimOutput) {
        manimOutput = await runShellCmd('manim --version', env);
    }

    // Method C: check if manim is importable (pip-installed but not on PATH scripts)
    if (!manimOutput) {
        manimOutput = await runDirect(pythonCmd, [
            '-c', 'import manim; print("Manim " + manim.__version__)'
        ], env);
    }

    result.engineFound = !!manimOutput;
    if (manimOutput) {
        // Parse version: "Manim Community v0.18.0" or "Manim 0.18.0" or similar
        const match = manimOutput.match(/v?([\d.]+)/);
        result.engineVersion = match ? match[1] : 'unknown';
    }

    // 3. Check FFmpeg — first try system PATH
    const ffmpegOutput = await runShellCmd('ffmpeg -version', env);
    if (ffmpegOutput) {
        result.ffmpegFound = true;
        result.ffmpegPath = 'system';
    } else {
        // Fallback: check imageio_ffmpeg bundled binary (installed by manim as a dependency)
        const bundledFfmpeg = await runDirect(pythonCmd, [
            '-c',
            'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'
        ], env);
        if (bundledFfmpeg && bundledFfmpeg.trim() && !bundledFfmpeg.includes('Error') && !bundledFfmpeg.includes('Traceback')) {
            const ffmpegPath = bundledFfmpeg.trim().split(/\r?\n/)[0];
            // Verify the bundled binary actually exists
            if (fs.existsSync(ffmpegPath)) {
                result.ffmpegFound = true;
                result.ffmpegPath = ffmpegPath;
            }
        }
    }

    // Engine is installed when python + manim + ffmpeg (bundled or system) are present
    result.installed = result.pythonFound && result.engineFound && result.ffmpegFound;

    // Store the resolved python command so install can use it
    result._pythonCmd = pythonCmd;

    console.log('[animEngine] Check result:', JSON.stringify({
        installed: result.installed,
        pythonFound: result.pythonFound,
        pythonCmd: pythonCmd,
        engineFound: result.engineFound,
        ffmpegFound: result.ffmpegFound,
        engineVersion: result.engineVersion,
        ffmpegPath: result.ffmpegPath,
    }));

    if (result.installed) {
        // Persist successful detection so restarts don't lose it
        writeCache(result);
    } else if (!result.engineFound && !result.ffmpegFound) {
        // Only use cache as fallback when live detection finds nothing
        // (this handles transient PATH issues after a restart)
        const cached = readCache();
        if (cached && cached.installed) {
            console.log('[animEngine] Live check failed but cache indicates engine was installed. Using cached result.');
            return { ...cached, _fromCache: true };
        }
        result.details = 'Colon Animation Engine is not installed.';
    } else if (!result.engineFound) {
        // Engine core missing but ffmpeg found — check cache
        const cached = readCache();
        if (cached && cached.installed && cached.engineFound) {
            console.log('[animEngine] Engine core not found in live check but cached as installed.');
            return { ...cached, _fromCache: true };
        }
        result.details = 'Animation engine core is missing.';
    } else if (!result.ffmpegFound) {
        // Engine found but ffmpeg missing — check cache for ffmpeg path
        const cached = readCache();
        if (cached && cached.installed && cached.ffmpegFound) {
            console.log('[animEngine] FFmpeg not found in live check but cached as available.');
            return { ...cached, _fromCache: true };
        }
        result.details = 'Engine installed but FFmpeg is missing. Video rendering may not work.';
    }

    return result;
}

/**
 * Install the animation engine via pip.
 * @param {function} onProgress - callback receiving progress strings
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function installAnimEngine(onProgress) {
    onProgress?.('Finding Python...\n');

    // Clear cache before installing so a fresh check runs afterward
    clearCache();

    // Use robust Python detection
    const python = await findPython();
    if (!python.found) {
        return { success: false, error: 'Python 3 is not installed. Install Python from the Extensions tab first.' };
    }

    const pythonCmd = python.command;
    onProgress?.(`Using Python: ${pythonCmd}\n`);
    onProgress?.('Installing Colon Animation Engine... This may take 1-3 minutes.\n');

    return new Promise((resolve) => {
        const proc = spawn(pythonCmd, ['-m', 'pip', 'install', 'manim', 'imageio-ffmpeg'], {
            env: python.env,
            shell: false,
        });

        // spawn() doesn't support timeout — enforce manually
        const killTimer = setTimeout(() => {
            proc.kill();
            resolve({ success: false, error: 'Installation timed out after 10 minutes.' });
        }, 600000);

        proc.stdout.on('data', (data) => {
            onProgress?.(data.toString());
        });

        proc.stderr.on('data', (data) => {
            onProgress?.(data.toString());
        });

        proc.on('close', (code) => {
            clearTimeout(killTimer);
            if (code === 0) {
                onProgress?.('\n✅ Colon Animation Engine installed successfully!\n');
                onProgress?.('⚠️ Please restart the IDE to activate the animation engine.\n');
                resolve({ success: true });
            } else {
                onProgress?.('\n❌ Installation failed.\n');
                resolve({ success: false, error: `Installation failed with exit code ${code}` });
            }
        });

        proc.on('error', (err) => {
            clearTimeout(killTimer);
            resolve({ success: false, error: `Failed to start installer: ${err.message}` });
        });
    });
}

module.exports = { checkAnimEngine, installAnimEngine };
