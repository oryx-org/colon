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
const { createRuntimeEnv, resolveExecutable } = require('./envScanner');

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

MANDATORY STRUCTURE (you MUST follow this exactly):
from manim import *
class CodeScene(Scene):
    def construct(self):
        self.camera.background_color = "#0d1117"
        # ... all animation code here, directly in construct() ...

ALLOWED OBJECTS (use ONLY these — others may cause silent rendering failure):
- Text(string, font_size=N, color=C) — for ALL text (titles, labels, values)
- Rectangle, Square, RoundedRectangle, Circle, Triangle, Polygon — shapes
- Line, Arrow, DashedLine, CurvedArrow, DoubleArrow — connectors
- VGroup — grouping
- Dot, Star — markers

BANNED OBJECTS (these WILL cause zero-duration or broken videos):
- MathTex, Tex — BANNED, requires LaTeX which is not installed
- Code — BANNED, requires special font rendering
- SVGMobject, ImageMobject — BANNED, requires external files
- Table — BANNED, use Rectangle+Text grid instead
- NumberPlane, Axes, NumberLine — BANNED, use Lines/Arrows instead
- Brace, BraceBetweenPoints — BANNED, uses LaTeX internally

ANIMATION RULES (CRITICAL — violating these produces empty/zero-length video):
- EVERY object MUST appear via self.play(FadeIn(...)), self.play(Create(...)), or self.play(Write(...))
- NEVER use self.add() by itself — it adds objects instantly with ZERO animation time
- You MUST have at least 6 self.play() calls with real Manim animation objects
- You MUST have at least 3 self.wait() calls for pacing
- Use self.wait(0.5) to self.wait(1.0) between EVERY step
- DO NOT define helper functions or utility methods — write everything directly in construct()
- Keep the script SHORT (under 120 lines) and SIMPLE
- SECURITY: DO NOT import os, sys, subprocess, or other system modules

VISUALIZATION PATTERNS:
- Arrays → colored Rectangles with Text labels inside
- Stacks → vertical RoundedRectangles
- Trees → Circles + Lines
- Sorting → side-by-side Rectangles with height proportional to value
- Pointers/Indices → Triangle arrows below elements
- Variables → Text objects updated via Transform(old_text, new_text)

STYLE:
- Colors: #3b82f6 (default) #f59e0b (active/highlight) #10b981 (done) #ef4444 (error) #f1f5f9 (text) #475569 (borders)
- Large shapes (min side_length=0.6)
- Title text per step
- Max 8-10 animation steps, under 30 seconds total

COMPLETE EXAMPLE (follow this exact pattern):
from manim import *
class CodeScene(Scene):
    def construct(self):
        self.camera.background_color = "#0d1117"
        title = Text("Bubble Sort", font_size=36, color="#f1f5f9")
        self.play(Write(title))
        self.wait(0.5)
        self.play(FadeOut(title))
        self.wait(0.3)
        boxes = VGroup(*[Square(side_length=0.8, color="#3b82f6", fill_opacity=0.7) for _ in range(4)])
        boxes.arrange(RIGHT, buff=0.3)
        labels = VGroup(*[Text(str(v), font_size=24, color="#f1f5f9").move_to(b) for v, b in zip([4,2,7,1], boxes)])
        self.play(FadeIn(boxes), FadeIn(labels))
        self.wait(0.5)
        step = Text("Compare 4 and 2", font_size=20, color="#f59e0b").to_edge(UP)
        self.play(FadeIn(step))
        self.play(boxes[0].animate.set_color("#f59e0b"), boxes[1].animate.set_color("#f59e0b"))
        self.wait(0.3)
        self.play(Swap(boxes[0], boxes[1]), Swap(labels[0], labels[1]))
        self.wait(0.3)
        self.play(FadeOut(step))
        done = Text("Sorted!", font_size=28, color="#10b981").to_edge(DOWN)
        self.play(FadeIn(done))
        self.wait(1.0)
        self.play(FadeOut(boxes), FadeOut(labels), FadeOut(done))
`;



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
            const [, mod] = match;
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

/**
 * Validate that a Manim script will actually produce a video with content.
 * Checks for sufficient self.play() calls and warns about self.add()-only usage.
 * @param {string} script — Python source code
 * @returns {{ ok: boolean, reason: string }} validation result
 */
function validateManimScript(script) {
    // Strip comments and string literals to avoid false positives in counting
    const stripped = script
        .replace(/#.*$/gm, '')           // Remove single-line comments
        .replace(/"""[\s\S]*?"""/g, '')  // Remove triple-double-quote strings
        .replace(/'''[\s\S]*?'''/g, '')  // Remove triple-single-quote strings
        .replace(/"[^"\n]*"/g, '""')    // Collapse double-quote strings
        .replace(/'[^'\n]*'/g, "''");    // Collapse single-quote strings

    // Count self.play() calls (these produce actual animation frames)
    const playMatches = stripped.match(/self\.play\s*\(/g);
    const playCount = playMatches ? playMatches.length : 0;

    // Count self.wait() calls
    const waitMatches = stripped.match(/self\.wait\s*\(/g);
    const waitCount = waitMatches ? waitMatches.length : 0;

    // Count self.add() calls (these are instant, no animation)
    const addMatches = stripped.match(/self\.add\s*\(/g);
    const addCount = addMatches ? addMatches.length : 0;

    console.log(`[manimService] Script analysis: ${playCount} self.play(), ${waitCount} self.wait(), ${addCount} self.add()`);

    // Verify construct() method exists
    if (!script.includes('def construct(self')) {
        return { ok: false, reason: 'Script is missing the construct(self) method' };
    }

    // Check for banned objects that cause silent rendering failures
    // (e.g., MathTex/Tex require LaTeX which is typically not installed)
    const BANNED_PATTERNS = [
        { pattern: /MathTex\s*\(/g, name: 'MathTex (requires LaTeX)' },
        { pattern: /(?<!#.*)\bTex\s*\(/g, name: 'Tex (requires LaTeX)' },
        { pattern: /\bCode\s*\(/g, name: 'Code (requires Pygments fonts)' },
        { pattern: /SVGMobject\s*\(/g, name: 'SVGMobject (requires external SVG file)' },
        { pattern: /ImageMobject\s*\(/g, name: 'ImageMobject (requires external image)' },
        { pattern: /NumberPlane\s*\(/g, name: 'NumberPlane (complex, often fails)' },
        { pattern: /(?<!#.*)\bAxes\s*\(/g, name: 'Axes (complex, often fails)' },
        { pattern: /\bBrace\s*\(/g, name: 'Brace (uses LaTeX internally)' },
        { pattern: /BraceBetweenPoints\s*\(/g, name: 'BraceBetweenPoints (uses LaTeX)' },
    ];
    for (const { pattern, name } of BANNED_PATTERNS) {
        if (pattern.test(stripped)) {
            return { ok: false, reason: `Script uses banned object ${name} which causes rendering failure. Use Text() and basic shapes only.` };
        }
    }

    if (playCount === 0 && waitCount === 0) {
        return { ok: false, reason: 'Script has no self.play() or self.wait() calls — video will have zero duration' };
    }

    if (playCount === 0 && addCount > 0) {
        return { ok: false, reason: 'Script only uses self.add() without self.play() — objects appear instantly with no animation timeline' };
    }

    if (playCount < 5) {
        return { ok: false, reason: `Script has only ${playCount} self.play() call(s) — need at least 5 for a meaningful animation` };
    }

    if (waitCount < 2) {
        return { ok: false, reason: `Script has only ${waitCount} self.wait() call(s) — need at least 2 for proper pacing` };
    }

    return { ok: true, reason: '' };
}

/**
 * Get the duration of an MP4 video in seconds using Python.
 * Falls back to file-size heuristic if Python/ffprobe unavailable.
 * @param {string} videoPath — absolute path to the MP4 file
 * @returns {Promise<number>} duration in seconds
 */
function getVideoDuration(videoPath) {
    return new Promise((resolve) => {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

        // Use Python struct to parse the MP4 mvhd atom for duration
        // This avoids any dependency on ffprobe
        const proc = spawn(pythonCmd, ['-c', `
import struct, sys

def get_mp4_duration(path):
    try:
        with open(path, 'rb') as f:
            data = f.read()
        # Find 'mvhd' atom
        idx = data.find(b'mvhd')
        if idx == -1:
            print('0')
            return
        idx += 4  # skip 'mvhd'
        version = data[idx]
        if version == 0:
            # 4-byte fields
            time_scale = struct.unpack('>I', data[idx+12:idx+16])[0]
            duration = struct.unpack('>I', data[idx+16:idx+20])[0]
        else:
            # 8-byte fields (version 1)
            time_scale = struct.unpack('>I', data[idx+20:idx+24])[0]
            duration = struct.unpack('>Q', data[idx+24:idx+32])[0]
        if time_scale > 0:
            print(f'{duration / time_scale:.2f}')
        else:
            print('0')
    except Exception:
        print('-1')

get_mp4_duration(sys.argv[1])
`, videoPath]);

        let stdout = '';
        proc.stdout.on('data', d => stdout += d.toString());
        proc.on('close', () => {
            const val = parseFloat(stdout.trim());
            if (isNaN(val) || val < 0) {
                // Python script failed or returned unexpected output.
                // Be CONSERVATIVE: a real 480p15 Manim video is typically > 50KB.
                // Empty containers / zero-frame MP4s are usually < 20KB.
                try {
                    const stat = fs.statSync(videoPath);
                    console.log(`[manimService] Duration parse failed, file size fallback: ${stat.size} bytes`);
                    resolve(stat.size > 50000 ? 999 : 0);
                } catch {
                    resolve(0); // Can't verify — assume bad (be conservative)
                }
            } else {
                resolve(val);
            }
        });
        proc.on('error', () => {
            // Python not available, fallback to file size check
            try {
                const stat = fs.statSync(videoPath);
                console.log(`[manimService] Python unavailable for duration check, file size fallback: ${stat.size} bytes`);
                resolve(stat.size > 50000 ? 999 : 0);
            } catch {
                resolve(0); // Can't verify — assume bad
            }
        });
    });
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
                // Validate cached video isn't broken (zero-duration / empty)
                const cachedSize = (() => { try { return fs.statSync(meta.videoPath).size; } catch { return 0; } })();
                if (cachedSize < 20000) {
                    console.warn(`[manimService] Cache hit but video is too small (${cachedSize} bytes) — deleting and regenerating`);
                    try { fs.rmSync(renderDir, { recursive: true, force: true }); } catch { /* ignore */ }
                } else {
                    const cachedDuration = await getVideoDuration(meta.videoPath);
                    if (cachedDuration < 1.0) {
                        console.warn(`[manimService] Cache hit but video has zero/near-zero duration (${cachedDuration}s) — deleting and regenerating`);
                        try { fs.rmSync(renderDir, { recursive: true, force: true }); } catch { /* ignore */ }
                    } else {
                        console.log(`[manimService] Cache hit: ${meta.id} (${cachedSize} bytes, ${cachedDuration}s)`);
                        return meta;
                    }
                }
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
3. All values on screen must be correct. Keep to 8-10 animation steps max.
4. Return ONLY Python code. Do NOT define helper functions — write everything directly in construct().
5. You MUST have at least 5 self.play() calls with real animations.`;

        let manimScript;
        let retries = 0;
        while (retries <= 1) {
            try {
                const response = await chatCompletion(SYSTEM_PROMPT, userPrompt, {
                    temperature: 0.2,
                    maxTokens: 16384,
                });

                // Extract Python code from response
                manimScript = extractPython(response);
                break;
            } catch (err) {
                retries += 1;
                if (retries > 1) throw err;

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
                    await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
                } else {
                    console.warn(`[manimService] LLM retry ${retries}: ${err.message}`);
                }

                if (retries > 1 && err.message.includes('Quota exceeded')) {
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

        // Step 2.5: Pre-validate Python syntax and animation quality.
        let syntaxOk = await validatePythonSyntax(scenePath);
        let scriptQuality = validateManimScript(manimScript);
        let validationOk = syntaxOk && scriptQuality.ok;

        if (!scriptQuality.ok) {
            console.warn(`[manimService] Script quality check failed: ${scriptQuality.reason}`);
        }
        
        let syntaxRetries = 0;
        while (!validationOk && syntaxRetries < 2) {
            syntaxRetries += 1;
            const failReason = !syntaxOk ? 'Python syntax error' : scriptQuality.reason;
            console.warn(`[manimService] Validation failed (${failReason}). Retrying LLM (attempt ${syntaxRetries}/2)...`);
            try {
                // Build a retry prompt that tells the LLM what went wrong
                const retryUserPrompt = `${userPrompt}

IMPORTANT: Your previous attempt FAILED because: ${failReason}.
You MUST fix this. Follow these rules EXACTLY:
1. Use ONLY: Text(), Rectangle, Square, Circle, Arrow, Line, VGroup, RoundedRectangle, Triangle, Dot
2. Do NOT use MathTex, Tex, Code, Brace, Table, Axes, NumberPlane, SVGMobject, or ImageMobject
3. Use self.play() with animation objects (FadeIn, Write, Create, Transform) — at least 6 calls
4. Use self.wait(0.5) between every step — at least 3 self.wait() calls total
5. Do NOT define helper functions. Write ALL code directly inside construct()
6. Keep it under 120 lines. Return ONLY valid Python code, no markdown`;

                const retryResponse = await chatCompletion(SYSTEM_PROMPT, retryUserPrompt, {
                    temperature: 0.1,
                    maxTokens: 12288,
                });
                manimScript = extractPython(retryResponse);
                if (!manimScript.includes(SCENE_CLASS)) {
                    manimScript = manimScript.replace(
                        /class\s+(\w+)\s*\(\s*Scene\s*\)/,
                        `class ${SCENE_CLASS}(Scene)`
                    );
                }
                fs.writeFileSync(scenePath, manimScript, 'utf-8');
                validateManimImports(manimScript);
                syntaxOk = await validatePythonSyntax(scenePath);
                scriptQuality = validateManimScript(manimScript);
                validationOk = syntaxOk && scriptQuality.ok;
            } catch (e) {
                console.warn('[manimService] Retry failed:', e.message);
            }
        }

        if (!validationOk) {
            const reason = !syntaxOk ? 'Python syntax error' : scriptQuality.reason;
            throw new Error(`Script validation failed: ${reason}. The AI could not produce valid animation code for this file.`);
        }

        // Step 3: Run manim render
        console.log('[manimService] Starting Manim render...');
        console.log(`[manimService] Generated script (first 500 chars):\n${manimScript.slice(0, 500)}`);
        if (isCancelled) throw new Error('Cancelled');
        const renderResult = await runManim(scenePath, renderDir);
        if (renderResult.stderr) {
            console.log('[manimService] Manim stderr output:', renderResult.stderr.slice(-800));
        }
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

        // Step 4.5: Validate the MP4 has a real duration (not zero-timeline)
        const videoDuration = await getVideoDuration(videoPath);
        const videoSize = (() => { try { return fs.statSync(videoPath).size; } catch { return 0; } })();
        console.log(`[manimService] Video duration: ${videoDuration}s, file size: ${videoSize} bytes`);

        if (videoDuration < 1.0) {
            // Delete the broken video and fail so user can retry
            try { fs.unlinkSync(videoPath); } catch { /* ignore */ }
            throw new Error(`Video rendered but has zero/near-zero duration (${videoDuration}s). The generated script likely used self.add() without self.play(), or used banned objects like MathTex/Tex that require LaTeX. Please try again.`);
        }

        // Step 4.6: Also verify file size — a real 480p15 animation is always > 20KB
        // Even if duration parsing reports OK, a tiny file means the render was empty
        if (videoSize < 20000 && videoDuration < 999) {
            try { fs.unlinkSync(videoPath); } catch { /* ignore */ }
            throw new Error(`Video file is suspiciously small (${videoSize} bytes) suggesting empty or broken content. Please try again.`);
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
 * Uses createRuntimeEnv() for proper Python/PATH resolution.
 */
async function runManim(scenePath, workDir) {
    // Resolve the correct Python command and environment with expanded PATH
    // This ensures Manim is found even if it was installed after Electron started
    const runtimeEnv = await createRuntimeEnv();
    const env = runtimeEnv.env;

    // Find the real Python 3 executable
    const pythonProbes = process.platform === 'win32' ? ['python3', 'python', 'py'] : ['python3', 'python'];
    let pythonCmd = null;
    for (const probe of pythonProbes) {
        const resolved = resolveExecutable(probe, env);
        if (resolved) {
            pythonCmd = resolved;
            break;
        }
    }
    if (!pythonCmd) {
        pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        console.warn('[manimService] Could not resolve Python executable, falling back to:', pythonCmd);
    }

    const args = [
        '-m', 'manim',
        'render',
        '-ql',                    // Low quality (480p, 15fps) for speed
        '--media_dir', path.join(workDir, 'media'),
        scenePath,
        SCENE_CLASS,
    ];

    console.log(`[manimService] Running: ${pythonCmd} ${args.join(' ')}`);
    console.log(`[manimService] Using PATH with ${runtimeEnv.pathEntries.length} entries`);

    return new Promise((resolve, reject) => {
        currentProc = spawn(pythonCmd, args, {
            cwd: workDir,
            timeout: 120000,    // 2 minute max
            env,
        });

        let stdout = '';
        let stderr = '';

        // spawn timeout only sends SIGTERM; enforce manually
        const killTimer = setTimeout(() => {
            try { process.platform === 'win32' ? currentProc.kill() : currentProc.kill('SIGKILL'); } catch { /* ignore */ }
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
            // Always log stderr — it often contains Manim warnings about
            // missing LaTeX, font issues, or deprecated API usage that
            // explain why the video is empty even when exit code is 0
            if (stderr.trim()) {
                console.log(`[manimService] Manim stderr (exit ${code}):`, stderr.slice(-800));
            }
            if (code === 0) {
                console.log('[manimService] Manim render complete (exit 0)');
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Video render failed (exit code ${code}): ${stderr.slice(-300)}`));
            }
        });

        currentProc.on('error', (err) => {
            clearTimeout(killTimer);
            if (isCancelled) {
                reject(new Error('Cancelled'));
                return;
            }
            console.error('[manimService] Spawn error:', err.message);
            reject(new Error(`Colon Animation Engine is not installed. Install it from the Extensions tab in the sidebar. (${err.message})`));
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
    for (let i = 0; i < lines.length; i += 1) {
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
                    // Verify video still exists AND has real content
                    if (meta.videoPath && fs.existsSync(meta.videoPath)) {
                        const videoSize = (() => { try { return fs.statSync(meta.videoPath).size; } catch { return 0; } })();
                        if (videoSize < 20000) {
                            // Auto-clean broken cached videos
                            console.warn(`[manimService] Removing broken cached video: ${meta.id} (${videoSize} bytes)`);
                            try { fs.rmSync(path.join(manimDir, dir.name), { recursive: true, force: true }); } catch { /* ignore */ }
                        } else {
                            results.push(meta);
                        }
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
