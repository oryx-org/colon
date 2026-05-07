/**
 * Manim Service — Generates full-file code execution videos using Manim CE.
 *
 * Flow: User code → LLM generates Manim Scene script → `manim render` → MP4
 *
 * Cache: .colon/manim/<basename>/<hash>/
 *   scene.py   — LLM-generated Manim script
 *   media/     — Manim output (contains rendered MP4)
 *   meta.json  — { id, sourceFile, language, createdAt }
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { chatCompletion, isConfigured } = require('./llmService');

const COLON_DIR = '.colon';
const MANIM_DIR = 'manim';
const MAX_LINES = 200;
const SCENE_CLASS = 'CodeScene';

let isRendering = false;
let isCancelled = false;
let currentProc = null;

function cancelManimVideo() {
    isCancelled = true;
    if (currentProc) {
        console.log('[manimService] Cancelling active Manim render...');
        process.platform === 'win32' ? currentProc.kill() : currentProc.kill('SIGTERM');
        currentProc = null;
    }
}

/* ── System Prompt ── */

const SYSTEM_PROMPT = `You are an expert Manim CE animation director and precise code execution engine.

RULE #1: ACCURACY. Mentally execute the code with actual inputs FIRST. Every value on screen must match real execution.

TECHNICAL RULES:
- Return ONLY Python code. No markdown fences, no explanation text.
- Start: from manim import *
- Class: "CodeScene(Scene)" with self.camera.background_color = "#0d1117"
- Use ONLY standard Manim CE objects. NO Code() objects.
- Use Text() for text with font_size parameter. File must run: manim -ql scene.py CodeScene
- SECURITY: DO NOT under any circumstances import 'os', 'sys', 'subprocess', or other system modules. They will trigger a security block.

VISUALIZATION — Show algorithm concepts, NOT source code:
- Arrays → colored Rectangles with labels | Stacks → vertical RoundedRectangles
- Trees → Circles+Lines | Sorting → height bars that swap | Pointers → Triangle arrows
- Queues → horizontal boxes | Hash Maps → key|value grid | Linked Lists → boxes+arrows

STYLE: Large bold shapes (min 0.5 height). Title Text per step. Smooth transitions (FadeIn/Out, Transform, Indicate).
Keep animation under 30 seconds. Max 12-15 distinct steps. self.wait(0.5-1.0) between steps.

COLORS: #3b82f6 (default) #f59e0b (active) #10b981 (done) #ef4444 (error) #f1f5f9 (text) #475569 (borders)`;



/* ── Import Validation (BUG-008/V-08) ── */

/**
 * Whitelist of allowed imports for LLM-generated Manim scripts.
 * Blocks dangerous modules (os, sys, subprocess, etc.) that could allow
 * arbitrary code execution. See ARCHITECTURE.md §Security.
 */
const ALLOWED_IMPORTS = new Set([
    'manim', 'math', 'numpy', 'np', 'colour', 'random', 'itertools', 'functools',
    'collections', 'typing', 'enum', 'dataclasses', 'string', 'textwrap',
]);

const BLOCKED_IMPORTS = new Set([
    'os', 'sys', 'subprocess', 'shutil', 'pathlib', 'socket', 'http',
    'urllib', 'requests', 'ftplib', 'smtplib', 'ctypes', 'importlib',
    'code', 'codeop', 'compile', 'compileall', 'py_compile',
    'signal', 'multiprocessing', 'threading', 'asyncio',
    'pickle', 'shelve', 'marshal', 'tempfile', 'glob', 'fnmatch',
    'webbrowser', 'antigravity', 'turtle', 'tkinter',
]);

/**
 * Validate that a Manim script only imports allowed modules.
 * Throws an Error if a blocked import is found.
 * @param {string} script — Python source code
 */
function validateManimImports(script) {
    const lines = script.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) continue; // skip comments

        // Match: import X, from X import ...
        let match;
        // "from X import ..."
        match = trimmed.match(/^from\s+(\w+)/);
        if (match) {
            const mod = match[1];
            if (BLOCKED_IMPORTS.has(mod)) {
                throw new Error(`Blocked import detected: "${mod}". LLM-generated scripts cannot use ${mod} for security reasons.`);
            }
        }
        // "import X" or "import X, Y, Z"
        match = trimmed.match(/^import\s+(.+)/);
        if (match) {
            const modules = match[1].split(',').map(m => m.trim().split(/\s+/)[0]); // handle "import X as Y"
            for (const mod of modules) {
                if (BLOCKED_IMPORTS.has(mod)) {
                    throw new Error(`Blocked import detected: "${mod}". LLM-generated scripts cannot use ${mod} for security reasons.`);
                }
            }
        }
    }
}


/* ── Helpers ── */

function getManimDir(filePath) {
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    return path.join(dir, COLON_DIR, MANIM_DIR, baseName);
}

function contentHash(code) {
    return crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
}

function findMp4(mediaDir) {
    // Manim outputs to media/videos/scene/480p15/ or similar
    try {
        const walk = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const found = walk(fullPath);
                    if (found) return found;
                } else if (entry.name.endsWith('.mp4')) {
                    return fullPath;
                }
            }
            return null;
        };
        return walk(mediaDir);
    } catch {
        return null;
    }
}

/* ── Core Functions ── */

/**
 * Generate a Manim video for an entire code file.
 * @param {string} filePath — absolute path to the source file
 * @param {string} code — full source code
 * @param {string} language — language identifier
 * @returns {Promise<object>} — { id, sourceFile, videoPath, createdAt }
 */
async function generateManimVideo(filePath, code, language) {
    // Validation
    const lineCount = code.split('\n').length;
    if (lineCount > MAX_LINES) {
        throw new Error(`File too long (${lineCount} lines). Maximum is ${MAX_LINES} lines for video generation.`);
    }

    if (!isConfigured()) {
        throw new Error('LLM not configured. Add your API key to backend/.env');
    }

    if (isRendering) {
        throw new Error('A video is already being rendered. Please wait for it to finish.');
    }

    // Check cache
    const hash = contentHash(code);
    const manimDir = getManimDir(filePath);
    const renderDir = path.join(manimDir, hash);
    const metaPath = path.join(renderDir, 'meta.json');

    if (fs.existsSync(metaPath)) {
        try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            if (meta.videoPath && fs.existsSync(meta.videoPath)) {
                console.log('[manimService] Cache hit:', meta.id);
                return meta;
            }
        } catch { /* cache invalid, regenerate */ }
    }

    isRendering = true;
    isCancelled = false;

    try {
        // Step 1: Generate Manim script via LLM
        console.log(`[manimService] Generating Manim script for ${language} file (${lineCount} lines)...`);

        const userPrompt = `Language: ${language}
Lines: ${lineCount}

Source code:
\`\`\`${language}
${code}
\`\`\`

INSTRUCTIONS:
1. Mentally execute this code with actual inputs. Track every variable and iteration.
2. Write a Manim CE CodeScene visualizing the EXACT execution trace.
3. All values on screen must be correct. Keep to 12-15 animation steps max.
4. Return ONLY Python code.`;

        let manimScript;
        let retries = 0;
        while (retries <= 2) {
            try {
                const response = await chatCompletion(SYSTEM_PROMPT, userPrompt, {
                    temperature: 0.2,
                    maxTokens: 12288,
                });

                // Extract Python code from response
                manimScript = extractPython(response);
                break;
            } catch (err) {
                retries++;
                if (retries > 2) throw err;

                // Auto-wait on rate limit
                const isRateLimit = err.message && (
                    err.message.includes('Rate limit') ||
                    err.message.includes('rate_limit') ||
                    err.message.includes('429') ||
                    err.message.includes('Quota exceeded')
                );

                if (isRateLimit) {
                    // Try to parse wait time
                    // Gemini: "retry in 25.54s"
                    const m1 = err.message.match(/retry in ([\d.]+)s/i);
                    // Groq/OpenAI: "try again in 10s"
                    const m2 = err.message.match(/try again in ([\d.]+)s/i);
                    
                    const waitSec = m1 ? Math.ceil(parseFloat(m1[1])) + 1 : 
                                    (m2 ? Math.ceil(parseFloat(m2[1])) + 1 : 12);

                    console.warn(`[manimService] Rate limited. Waiting ${waitSec}s...`);
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                } else {
                    console.warn(`[manimService] LLM retry ${retries}: ${err.message}`);
                }

                if (retries >= 2 && err.message.includes('Quota exceeded')) {
                    throw new Error("API Quota Exceeded. The free tier of the AI Service has a limit (e.g., 20 requests). Please wait for it to reset or switch to a different AI provider in settings.");
                }
            }
        }

        if (!manimScript) {
            throw new Error('Failed to generate animation script from AI');
        }

        // Ensure script has the correct class name
        if (!manimScript.includes(SCENE_CLASS)) {
            // Try to rename any Scene subclass to CodeScene
            manimScript = manimScript.replace(
                /class\s+(\w+)\s*\(\s*Scene\s*\)/,
                `class ${SCENE_CLASS}(Scene)`
            );
        }

        // Step 2: Write script to disk
        fs.mkdirSync(renderDir, { recursive: true });
        const scenePath = path.join(renderDir, 'scene.py');
        fs.writeFileSync(scenePath, manimScript, 'utf-8');
        console.log('[manimService] Manim script written to:', scenePath);

        // Step 2.25: Validate imports — block dangerous modules (BUG-008/V-08)
        validateManimImports(manimScript);

        // Step 2.5: Pre-validate Python syntax BEFORE running Manim.
        // If invalid, auto-retry LLM up to 2 more times.
        let syntaxOk = await validatePythonSyntax(scenePath);
        let syntaxRetries = 0;
        while (!syntaxOk && syntaxRetries < 2) {
            syntaxRetries++;
            console.warn(`[manimService] Syntax validation failed. Retrying LLM (attempt ${syntaxRetries})...`);
            try {
                const retryResponse = await chatCompletion(SYSTEM_PROMPT, userPrompt, {
                    temperature: 0.1, // lower temp for more precise output
                    maxTokens: 8192,
                });
                manimScript = extractPython(retryResponse);
                fs.writeFileSync(scenePath, manimScript, 'utf-8');
                syntaxOk = await validatePythonSyntax(scenePath);
            } catch (e) {
                console.warn('[manimService] Retry failed:', e.message);
            }
        }

        if (!syntaxOk) {
            throw new Error('Generated script failed Python syntax validation after 3 attempts. The AI could not produce valid code for this file.');
        }

        // Step 3: Run manim render
        console.log('[manimService] Starting Manim render...');
        if (isCancelled) throw new Error('Cancelled');
        await runManim(scenePath, renderDir);
        if (isCancelled) throw new Error('Cancelled');

        // Step 4: Find the rendered MP4
        const mediaDir = path.join(renderDir, 'media');
        let videoPath = findMp4(mediaDir);

        if (!videoPath) {
            // Manim might output to default location
            const defaultMedia = path.join(renderDir, 'media', 'videos', 'scene', '480p15');
            videoPath = findMp4(defaultMedia) || findMp4(renderDir);
        }

        if (!videoPath) {
            throw new Error('Video render completed but no MP4 file was found');
        }

        // Step 5: Save metadata
        const meta = {
            id: `manim-${hash}`,
            sourceFile: filePath,
            language,
            videoPath,
            createdAt: new Date().toISOString(),
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        console.log('[manimService] Video rendered:', videoPath);

        return meta;

    } catch (err) {
        if (isCancelled) {
            console.log('[manimService] Generation cancelled by user.');
            throw new Error('Cancelled');
        }
        throw err;
    } finally {
        isRendering = false;
        isCancelled = false;
        currentProc = null;
    }
}

/**
 * Run `manim render` as a subprocess.
 */
function runManim(scenePath, workDir) {
    return new Promise((resolve, reject) => {
        const args = [
            '-m', 'manim',
            'render',
            '-ql',                    // Low quality (480p, 15fps) for speed
            '--media_dir', path.join(workDir, 'media'),
            scenePath,
            SCENE_CLASS,
        ];

        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        console.log(`[manimService] Running: ${pythonCmd} ${args.join(' ')}`);

        currentProc = spawn(pythonCmd, args, {
            cwd: workDir,
            timeout: 120000,    // 2 minute max
            env: { ...process.env },
        });

        let stdout = '';
        let stderr = '';

        // spawn timeout only sends SIGTERM; enforce manually
        const killTimer = setTimeout(() => {
            try { process.platform === 'win32' ? currentProc.kill() : currentProc.kill('SIGKILL'); } catch { }
            reject(new Error('Manim render timed out after 2 minutes.'));
        }, 120000);

        currentProc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        currentProc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        currentProc.on('close', (code) => {
            clearTimeout(killTimer);
            if (isCancelled) {
                reject(new Error('Cancelled'));
                return;
            }
            if (code === 0) {
                console.log('[manimService] Manim render complete');
                resolve({ stdout, stderr });
            } else {
                console.error('[manimService] Manim stderr:', stderr.slice(-500));
                reject(new Error(`Video render failed (exit code ${code}): ${stderr.slice(-300)}`));
            }
        });

        currentProc.on('error', (err) => {
            clearTimeout(killTimer);
            if (isCancelled) {
                reject(new Error('Cancelled'));
                return;
            }
            reject(new Error(`Colon Animation Engine is not installed. Install it from the Extensions tab in the sidebar.`));
        });
    });
}

/**
 * Extract Python code from LLM response.
 */
function extractPython(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('Empty LLM response');
    }

    // Step 1: Try to extract from markdown fence first
    const fenceMatch = text.match(/```(?:python)?\s*\n([\s\S]*?)\n```/);
    let extracted = fenceMatch ? fenceMatch[1] : text;

    // Step 2: If no fence, find where the python starts
    if (!fenceMatch) {
        const fromIdx = extracted.indexOf('from manim');
        if (fromIdx !== -1) extracted = extracted.slice(fromIdx);
    }

    // Step 3: Strip all remaining markdown fences aggressively
    extracted = extracted.replace(/```python/gi, '');
    extracted = extracted.replace(/```/g, '');

    // Step 4: Find the last valid Python line (cut off AI conversational trailing text).
    const lines = extracted.split('\n');
    let lastValidLine = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const isBlank = trimmed === '';
        const isComment = trimmed.startsWith('#');
        const isIndented = line.startsWith(' ') || line.startsWith('\t');
        const isTopLevel = trimmed.startsWith('from ') || trimmed.startsWith('import ') ||
                           trimmed.startsWith('class ') || trimmed.startsWith('def ') ||
                           trimmed.startsWith('@');
        // Reject bracket-annotation lines like [The rest of the file is empty] or [()]
        const isBracketAnnotation = /^\[.*\]\s*$/.test(trimmed);
        if (!isBracketAnnotation && (isBlank || isComment || isIndented || isTopLevel)) {
            lastValidLine = i;
        }
    }

    return lines.slice(0, lastValidLine + 1).join('\n').trim();
}

/**
 * Validate Python syntax by running `python3 -c "import ast; ast.parse(...)"` on the file.
 * Returns true if valid, false if a SyntaxError is found.
 */
function validatePythonSyntax(filePath) {
    return new Promise((resolve) => {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const proc = spawn(pythonCmd, ['-c', `
import ast, sys
try:
    with open(sys.argv[1]) as f:
        ast.parse(f.read())
    print('OK')
except SyntaxError as e:
    print(f'SYNTAX_ERROR:{e.lineno}:{e.msg}', file=sys.stderr)
    sys.exit(1)
`, filePath]);

        let stderr = '';
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => {
            if (code === 0) {
                console.log('[manimService] Syntax validation: PASSED');
                resolve(true);
            } else {
                console.warn('[manimService] Syntax validation: FAILED —', stderr.trim());
                resolve(false);
            }
        });
        proc.on('error', () => resolve(true)); // if python3 not found, skip validation
    });
}

/**
 * Load all cached Manim videos for a source file.
 */
function loadManimVideos(filePath) {
    const manimDir = getManimDir(filePath);
    const results = [];

    try {
        const dirs = fs.readdirSync(manimDir, { withFileTypes: true });
        for (const dir of dirs) {
            if (!dir.isDirectory()) continue;
            const metaPath = path.join(manimDir, dir.name, 'meta.json');
            if (fs.existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                    // Verify video still exists
                    if (meta.videoPath && fs.existsSync(meta.videoPath)) {
                        results.push(meta);
                    }
                } catch { /* skip corrupt */ }
            }
        }
    } catch { /* dir doesn't exist yet */ }

    results.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    return results;
}

/**
 * Delete a specific Manim video by ID.
 */
function deleteManimVideo(filePath, videoId) {
    const manimDir = getManimDir(filePath);
    // videoId format: manim-<hash>
    const hash = videoId.replace('manim-', '');
    const renderDir = path.join(manimDir, hash);

    try {
        fs.rmSync(renderDir, { recursive: true, force: true });
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    generateManimVideo,
    loadManimVideos,
    deleteManimVideo,
    cancelManimVideo,
    isConfigured,
    MAX_LINES,
};
