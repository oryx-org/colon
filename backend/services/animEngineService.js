/**
 * Colon Animation Engine Service
 * 
 * Checks and installs the animation engine (internally: manim + ffmpeg).
 * The name "manim" is NEVER exposed to the user.
 */

const { exec, execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

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
function runShellCmd(cmdString) {
    return new Promise((resolve) => {
        try {
            exec(cmdString, { timeout: 15000 }, (error, stdout, stderr) => {
                if (error) resolve(null);
                else resolve((stdout || '') + (stderr || ''));
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
function runDirect(cmd, args) {
    return new Promise((resolve) => {
        try {
            execFile(cmd, args, { timeout: 15000 }, (error, stdout, stderr) => {
                if (error) resolve(null);
                else resolve((stdout || '') + (stderr || ''));
            });
        } catch {
            resolve(null);
        }
    });
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

    // 1. Check Python — try multiple candidates on Windows
    //    Use runShellCmd for PATH resolution (no semicolons in args)
    const pythonCandidates = process.platform === 'win32'
        ? ['python', 'python3']
        : ['python3', 'python'];

    let pythonOutput = null;
    let resolvedPythonCmd = PYTHON_CMD;

    for (const candidate of pythonCandidates) {
        // Try shell-based first (resolves PATH, aliases, app execution aliases)
        let output = await runShellCmd(`${candidate} --version`);
        // Fallback to direct execFile (works when shell lookup differs)
        if (!output) output = await runDirect(candidate, ['--version']);

        if (output && /python\s+3/i.test(output)) {
            pythonOutput = output;
            resolvedPythonCmd = candidate;
            break;
        }
    }

    result.pythonFound = !!pythonOutput;

    if (!result.pythonFound) {
        result.details = 'Python is required but not found. Install Python first from the Extensions tab.';
        return result;
    }

    // 2. Check manim via multiple methods for resilience
    let manimOutput = null;

    // Method A: python -m manim --version (shell-based for PATH)
    manimOutput = await runShellCmd(`${resolvedPythonCmd} -m manim --version`);

    // Method A2: same but without shell (in case shell mangles something)
    if (!manimOutput) {
        manimOutput = await runDirect(resolvedPythonCmd, ['-m', 'manim', '--version']);
    }

    // Method B: direct "manim --version" on PATH
    if (!manimOutput) {
        manimOutput = await runShellCmd('manim --version');
    }

    // Method C: check if manim is importable (pip-installed but not on PATH scripts)
    // MUST use runDirect here — the Python code contains semicolons which a shell
    // would interpret as command separators
    if (!manimOutput) {
        manimOutput = await runDirect(resolvedPythonCmd, [
            '-c', 'import manim; print("Manim " + manim.__version__)'
        ]);
    }

    result.engineFound = !!manimOutput;
    if (manimOutput) {
        // Parse version: "Manim Community v0.18.0" or "Manim 0.18.0" or similar
        const match = manimOutput.match(/v?([\d.]+)/);
        result.engineVersion = match ? match[1] : 'unknown';
    }

    // 3. Check FFmpeg — first try system PATH
    const ffmpegOutput = await runShellCmd('ffmpeg -version');
    if (ffmpegOutput) {
        result.ffmpegFound = true;
        result.ffmpegPath = 'system';
    } else {
        // Fallback: check imageio_ffmpeg bundled binary (installed by manim as a dependency)
        // MUST use runDirect — Python code contains semicolons
        const bundledFfmpeg = await runDirect(resolvedPythonCmd, [
            '-c',
            'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'
        ]);
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

    console.log('[animEngine] Check result:', JSON.stringify({
        installed: result.installed,
        pythonFound: result.pythonFound,
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
function installAnimEngine(onProgress) {
    return new Promise((resolve) => {
        onProgress?.('Checking Python...');

        // Clear cache before installing so a fresh check runs afterward
        clearCache();

        // Verify Python exists first
        runShellCmd(`${PYTHON_CMD} --version`).then((pythonCheck) => {
            if (!pythonCheck) {
                resolve({ success: false, error: 'Python is not installed. Install Python from the Extensions tab first.' });
                return;
            }

            onProgress?.('Installing Colon Animation Engine... This may take 1-3 minutes.\n');

            const proc = spawn(PYTHON_CMD, ['-m', 'pip', 'install', 'manim', 'imageio-ffmpeg'], {
                env: { ...process.env },
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
    });
}

module.exports = { checkAnimEngine, installAnimEngine };
