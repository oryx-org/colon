/**
 * Colon Animation Engine Service
 * 
 * Checks and installs the animation engine (internally: manim + ffmpeg).
 * The name "manim" is NEVER exposed to the user.
 */

const { execFile, spawn } = require('child_process');
const path = require('path');

const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

/**
 * Check if a command exists on the system.
 * @returns {Promise<string|null>} version output or null
 */
function tryCommand(cmd, args) {
    return new Promise((resolve) => {
        try {
            execFile(cmd, args, { timeout: 10000 }, (error, stdout, stderr) => {
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
 * @returns {Promise<object>} { installed, pythonFound, manimFound, ffmpegFound, manimVersion, details }
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

    // 1. Check Python
    const pythonOutput = await tryCommand(PYTHON_CMD, ['--version']);
    result.pythonFound = !!pythonOutput;

    if (!result.pythonFound) {
        result.details = 'Python is required but not found. Install Python first from the Extensions tab.';
        return result;
    }

    // 2. Check manim (via python -m manim --version)
    const manimOutput = await tryCommand(PYTHON_CMD, ['-m', 'manim', '--version']);
    result.engineFound = !!manimOutput;
    if (manimOutput) {
        // Parse version: "Manim Community v0.18.0" or similar
        const match = manimOutput.match(/v?([\d.]+)/);
        result.engineVersion = match ? match[1] : 'unknown';
    }

    // 3. Check FFmpeg — first try system PATH
    const ffmpegOutput = await tryCommand('ffmpeg', ['-version']);
    if (ffmpegOutput) {
        result.ffmpegFound = true;
        result.ffmpegPath = 'system';
    } else {
        // Fallback: check imageio_ffmpeg bundled binary (installed by manim as a dependency)
        const bundledFfmpeg = await tryCommand(PYTHON_CMD, [
            '-c',
            'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'
        ]);
        if (bundledFfmpeg && bundledFfmpeg.trim() && !bundledFfmpeg.includes('Error')) {
            const ffmpegPath = bundledFfmpeg.trim().split(/\r?\n/)[0];
            // Verify the bundled binary actually exists
            const fs = require('fs');
            if (fs.existsSync(ffmpegPath)) {
                result.ffmpegFound = true;
                result.ffmpegPath = ffmpegPath;
            }
        }
    }

    // Engine is installed when python + manim + ffmpeg (bundled or system) are present
    result.installed = result.pythonFound && result.engineFound && result.ffmpegFound;

    if (!result.engineFound && !result.ffmpegFound) {
        result.details = 'Colon Animation Engine is not installed.';
    } else if (!result.engineFound) {
        result.details = 'Animation engine core is missing.';
    } else if (!result.ffmpegFound) {
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

        // Verify Python exists first
        tryCommand(PYTHON_CMD, ['--version']).then((pythonCheck) => {
            if (!pythonCheck) {
                resolve({ success: false, error: 'Python is not installed. Install Python from the Extensions tab first.' });
                return;
            }

            onProgress?.('Installing Colon Animation Engine... This may take 1-3 minutes.\n');

            const proc = spawn(PYTHON_CMD, ['-m', 'pip', 'install', 'manim', 'imageio-ffmpeg'], {
                env: { ...process.env },
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
