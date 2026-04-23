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

/* ── System Prompt ── */

const SYSTEM_PROMPT = `You are a Manim Community Edition animation script generator for an educational IDE.

Given source code, produce a SINGLE Python file with a Scene class called "CodeScene" that visualizes the code's step-by-step execution.

RULES:
1. Return ONLY valid Python code. No markdown fences, no explanations, no comments outside the code.
2. Start with: from manim import *
3. The class MUST be named "CodeScene" and extend Scene.
4. Show the execution flow visually:
   - Display the source code on the LEFT using Code() or Text() objects
   - Highlight the current executing line (use surrounding rectangles or color changes)
   - Show variable values on the RIGHT, updating as execution progresses
   - Show data structures (arrays, lists) as visual objects that animate
   - Show output/print statements appearing at the bottom
5. Use smooth transitions: FadeIn, FadeOut, Transform, Write, Create
6. Keep total animation under 20 seconds (use self.wait(0.3) to self.wait(0.8) between steps)
7. Use ONLY standard Manim CE imports (from manim import *)
8. Use monospace fonts for code: Text("...", font="Monospace", font_size=16)
9. Use a dark background color: self.camera.background_color = "#0a0e17"
10. Maximum 15-20 animation steps (don't animate every single line for long code — summarize loops)
11. For loops: show 2-3 iterations visually, then skip to final state
12. Color scheme: code=#e2e8f0, variables=#3b82f6, highlights=#f59e0b, output=#10b981
13. Place code panel on left (x=-3.5), variables panel on right (x=3.5)
14. Handle errors gracefully — if code has complex imports, just visualize the algorithm flow

IMPORTANT: The Python file must be directly executable by: manim render -ql scene.py CodeScene
Do NOT use any features that require additional packages beyond manim.`;

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

    try {
        // Step 1: Generate Manim script via LLM
        console.log(`[manimService] Generating Manim script for ${language} file (${lineCount} lines)...`);

        const userPrompt = `Language: ${language}
Lines: ${lineCount}

Source code:
\`\`\`${language}
${code}
\`\`\`

Generate the Manim CE Python script (CodeScene class) that visualizes this code's execution step-by-step.`;

        let manimScript;
        let retries = 0;
        while (retries <= 2) {
            try {
                const response = await chatCompletion(SYSTEM_PROMPT, userPrompt, {
                    temperature: 0.2,
                    maxTokens: 3000,
                });

                // Extract Python code from response
                manimScript = extractPython(response);
                break;
            } catch (err) {
                retries++;
                if (retries > 2) throw err;

                // Auto-wait on rate limit
                if (err.message && err.message.includes('Rate limit')) {
                    const m = err.message.match(/try again in ([\d.]+)s/i);
                    const waitSec = m ? Math.ceil(parseFloat(m[1])) + 1 : 12;
                    console.warn(`[manimService] Rate limited. Waiting ${waitSec}s...`);
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                } else {
                    console.warn(`[manimService] LLM retry ${retries}: ${err.message}`);
                }
            }
        }

        if (!manimScript) {
            throw new Error('Failed to generate Manim script from LLM');
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

        // Step 3: Run manim render
        console.log('[manimService] Starting Manim render...');
        await runManim(scenePath, renderDir);

        // Step 4: Find the rendered MP4
        const mediaDir = path.join(renderDir, 'media');
        let videoPath = findMp4(mediaDir);

        if (!videoPath) {
            // Manim might output to default location
            const defaultMedia = path.join(renderDir, 'media', 'videos', 'scene', '480p15');
            videoPath = findMp4(defaultMedia) || findMp4(renderDir);
        }

        if (!videoPath) {
            throw new Error('Manim render completed but no MP4 file was found');
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

    } finally {
        isRendering = false;
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

        console.log(`[manimService] Running: python3 ${args.join(' ')}`);

        const proc = spawn('python3', args, {
            cwd: workDir,
            timeout: 120000,    // 2 minute max
            env: { ...process.env },
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                console.log('[manimService] Manim render complete');
                resolve({ stdout, stderr });
            } else {
                console.error('[manimService] Manim stderr:', stderr.slice(-500));
                reject(new Error(`Manim render failed (exit code ${code}): ${stderr.slice(-300)}`));
            }
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to start manim: ${err.message}. Is manim installed? (python3 -m pip install manim)`));
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

    // Strip markdown fences
    const fenceMatch = text.match(/```(?:python)?\s*\n([\s\S]*?)\n```/);
    if (fenceMatch) return fenceMatch[1].trim();

    // If response starts with import or from, it's raw Python
    const trimmed = text.trim();
    if (trimmed.startsWith('from ') || trimmed.startsWith('import ') || trimmed.startsWith('#')) {
        return trimmed;
    }

    // Try to find Python code block
    const fromIdx = text.indexOf('from manim');
    if (fromIdx !== -1) return text.slice(fromIdx).trim();

    const importIdx = text.indexOf('import ');
    if (importIdx !== -1) return text.slice(importIdx).trim();

    throw new Error('Could not extract Python script from LLM response');
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
    isConfigured,
    MAX_LINES,
};
