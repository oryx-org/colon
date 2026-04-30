/**
 * Animation Generator — Uses an LLM to produce structured animation data
 * from source code blocks. The output is a frame-based animation description
 * that the frontend AnimationPlayer renders with smooth SVG transitions.
 *
 * Animation Schema (what the LLM generates):
 * {
 *   title: string,
 *   frames: [
 *     {
 *       caption: string,          // explanation of what happens in this step
 *       code: {
 *         source: string,          // relevant code snippet
 *         highlight: number[]      // 1-indexed lines to highlight
 *       },
 *       variables: [
 *         { name: string, value: string, color: string, changed: boolean }
 *       ],
 *       output: string[],          // cumulative stdout lines
 *       visuals: [                 // data structure visualizations
 *         {
 *           type: "array" | "stack" | "linkedList" | "tree" | "grid" | "pointer" | "callStack",
 *           label: string,
 *           items: (string|number)[],
 *           highlight: number[],   // indices to highlight
 *           arrows: [{ from: number, to: number }]  // optional connections
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { chatCompletion, isConfigured } = require('./llmService');

const COLON_DIR = '.colon';
const ANIM_DIR = 'animations';

const SYSTEM_PROMPT = `You are a PRECISE CODE EXECUTION ENGINE and algorithm visualization teacher.

RULE #1: ACCURACY. Every value, every data structure state MUST be 100% correct — exactly what a real machine would produce. No approximations.

BEFORE generating frames, mentally execute the code line by line with ACTUAL input values. Track every variable and data structure change.

EFFICIENCY RULES:
- Maximum 15-20 frames total. Be smart about grouping.
- Group trivial consecutive operations (e.g. multiple simple assignments) into ONE frame.
- Show EVERY loop iteration that changes data structures, but combine setup steps.
- For recursion: show key call/return moments, not every single line.
- Each frame = one MEANINGFUL state change with the EXACT correct values.

CAPTION: Under 10 words. Punchy. Show values: "Swap 5↔2", "Push '('", "i=2: check arr[2]=7"

VISUALS — use multiple per frame when needed:
- "array": row of boxes | "stack": vertical column | "linkedList": chain | "tree": nodes+edges
- "grid": 2D matrix | "callStack": call frames | "pointer": index arrows
- Colors: #3B82F6 (default), #F59E0B (active), #10B981 (done), #EF4444 (error), #8B5CF6 (secondary)

JSON FORMAT (return ONLY this, no markdown, no \`\`\`):
{
  "title": "Algorithm title",
  "frames": [{
    "caption": "Short explanation",
    "code": { "source": "", "highlight": [] },
    "variables": [],
    "output": [],
    "visuals": [{ "type": "array", "label": "Label", "items": ["exact","values"], "highlight": [0], "arrows": [] }]
  }]
}`;



/**
 * Get cache directory for animation data.
 */
function getAnimDir(filePath) {
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const animDir = path.join(dir, COLON_DIR, ANIM_DIR, baseName);
    fs.mkdirSync(animDir, { recursive: true });
    return animDir;
}

/**
 * Hash for cache key.
 */
function cacheKey(code, language) {
    return crypto.createHash('sha256')
        .update(`${language}:${code}`)
        .digest('hex')
        .slice(0, 16);
}

/**
 * Check cache for existing animation.
 */
function getCached(filePath, code, language) {
    try {
        const animDir = getAnimDir(filePath);
        const key = cacheKey(code, language);
        const cachePath = path.join(animDir, `anim-${key}.json`);
        if (fs.existsSync(cachePath)) {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            return cached;
        }
    } catch { /* miss */ }
    return null;
}

/**
 * Save animation to cache.
 */
function saveToCache(filePath, code, language, animationData) {
    const animDir = getAnimDir(filePath);
    const key = cacheKey(code, language);
    const cachePath = path.join(animDir, `anim-${key}.json`);
    const record = {
        id: `anim-${key}`,
        sourceFile: filePath,
        language,
        animation: animationData,
        createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(cachePath, JSON.stringify(record, null, 2), 'utf-8');
    return record;
}

/**
 * Load all saved animations for a source file.
 */
function loadAnimations(filePath) {
    const animDir = getAnimDir(filePath);
    const results = [];
    try {
        const files = fs.readdirSync(animDir);
        for (const file of files) {
            if (file.startsWith('anim-') && file.endsWith('.json')) {
                const content = fs.readFileSync(path.join(animDir, file), 'utf-8');
                results.push(JSON.parse(content));
            }
        }
    } catch { /* dir doesn't exist yet */ }
    results.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    return results;
}

/**
 * Delete a specific animation by ID.
 */
function deleteAnimation(filePath, animId) {
    const animDir = getAnimDir(filePath);
    const animPath = path.join(animDir, `${animId}.json`);
    try { fs.unlinkSync(animPath); return true; } catch { return false; }
}

/**
 * Delete all animations for a file.
 */
function clearAnimations(filePath) {
    const animDir = getAnimDir(filePath);
    try {
        const files = fs.readdirSync(animDir);
        for (const file of files) {
            if (file.startsWith('anim-') && file.endsWith('.json')) {
                fs.unlinkSync(path.join(animDir, file));
            }
        }
        return true;
    } catch { return false; }
}

/**
 * Parse retry-after seconds from LLM rate limit error messages.
 * Handles Groq, OpenAI, and Gemini formats.
 */
function parseRetryAfter(message) {
    // Gemini: "retry in 25.54s"
    const m1 = message.match(/retry in ([\d.]+)s/i);
    if (m1) return Math.ceil(parseFloat(m1[1])) + 1;
    
    // Groq/OpenAI: "try again in 10s"
    const m2 = message.match(/try again in ([\d.]+)s/i);
    if (m2) return Math.ceil(parseFloat(m2[1])) + 1;
    
    return 10;
}

/**
 * Extract JSON from LLM response that may be truncated mid-stream.
 * Smart repair: removes the last incomplete frame to ensure valid JSON.
 */
function extractJSON(text) {
    console.log('[animationGenerator] Raw LLM response (first 500 chars):', text?.slice(0, 500));

    if (!text || typeof text !== 'string') {
        throw new Error('Empty LLM response');
    }

    // Strip control characters that break JSON.parse
    let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    // Try raw parse first (happy path)
    try { return JSON.parse(cleaned); } catch { /* continue */ }

    // Strip markdown fences
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
        try { return JSON.parse(fenceMatch[1]); } catch { /* continue */ }
    }

    // Find the JSON object start
    const start = cleaned.indexOf('{');
    if (start === -1) {
        throw new Error('Could not parse animation JSON from LLM response');
    }
    let slice = cleaned.slice(start);

    // Try parsing with the last '}' as boundary
    const end = slice.lastIndexOf('}');
    if (end !== -1) {
        try { return JSON.parse(slice.slice(0, end + 1)); } catch { /* continue */ }
    }

    // SMART REPAIR: The LLM ran out of tokens mid-frame.
    // Strategy: Find the last COMPLETE frame by scanning backwards for a full
    // "}," or "}" pattern that closes a frame object, then rebuild the JSON.
    console.warn('[animationGenerator] JSON truncated. Attempting smart repair...');

    // Find the "frames" array start
    const framesIdx = slice.indexOf('"frames"');
    if (framesIdx === -1) {
        throw new Error('Could not parse animation JSON from LLM response');
    }

    // Find the last complete frame: look for the pattern of a closing brace
    // followed by optional whitespace then either ',' or end-of-array ']'
    // Walk backwards through the string to find where the last clean frame ended
    let repaired = slice;

    // Try progressively cutting the tail until JSON parses
    // Find all positions of '}' and try each as a potential end of last complete frame
    const bracePositions = [];
    for (let i = repaired.length - 1; i >= 0; i--) {
        if (repaired[i] === '}') bracePositions.push(i);
        if (bracePositions.length > 20) break; // Only try last 20 brace positions
    }

    for (const pos of bracePositions) {
        const candidate = repaired.slice(0, pos + 1);
        // Close the frames array and root object
        const attempts = [
            candidate + ']}',
            candidate + ']}'  ,
            candidate + '}]}',
        ];
        for (const attempt of attempts) {
            try {
                const parsed = JSON.parse(attempt);
                if (parsed.frames && parsed.frames.length > 0) {
                    console.warn(`[animationGenerator] Smart repair succeeded: recovered ${parsed.frames.length} frames.`);
                    return parsed;
                }
            } catch { /* try next */ }
        }
    }

    console.error('[animationGenerator] Full unparseable response:', text);
    throw new Error('Could not parse animation JSON from LLM response');
}

/**
 * Validate the animation data structure.
 */
function validateAnimation(data) {
    if (!data || typeof data !== 'object') throw new Error('Animation data is not an object');
    if (!data.title || typeof data.title !== 'string') throw new Error('Missing animation title');
    if (!Array.isArray(data.frames) || data.frames.length === 0) throw new Error('Missing or empty frames array');

    for (let i = 0; i < data.frames.length; i++) {
        const f = data.frames[i];
        if (!f.caption) f.caption = `Step ${i + 1}`;
        if (!f.code) f.code = { source: '', highlight: [] };
        if (!f.variables) f.variables = [];
        if (!f.output) f.output = [];
        if (!f.visuals) f.visuals = [];

        // Ensure highlight is always an array of numbers
        if (!Array.isArray(f.code.highlight)) f.code.highlight = [];

        // Ensure variable values are strings for display
        for (const v of f.variables) {
            if (v.value === undefined || v.value === null) v.value = 'null';
            else v.value = String(v.value);
        }
    }

    return data;
}

/**
 * Generate animation for a code block using LLM.
 * @param {string} filePath — source file path (for caching)
 * @param {string} code — code block to animate
 * @param {string} language — language identifier
 * @param {object} blockInfo — { type, startLine, endLine, label }
 * @returns {Promise<object>} — { id, animation, ... }
 */
async function generateAnimation(filePath, code, language, blockInfo) {
    if (!isConfigured()) {
        throw new Error('LLM not configured. Add your API key to backend/.env');
    }

    // Check cache first
    const cached = getCached(filePath, code, language);
    if (cached) {
        console.log('[animationGenerator] Cache hit:', cached.id);
        return cached;
    }

    // Build user prompt with chain-of-thought forcing
    const lineCount = code.split('\n').length;
    const userPrompt = `Language: ${language}
Block type: ${blockInfo?.type || 'unknown'}
Lines: ${lineCount}

Source code to animate:
\`\`\`${language}
${code}
\`\`\`

INSTRUCTIONS:
1. Mentally execute this code with its ACTUAL input values first.
2. Generate animation JSON with EXACT correct values at each step.
3. Use multiple visuals per frame when the algorithm uses multiple data structures.
4. Keep to 15-20 frames max — group trivial steps.

Generate the animation JSON now.`;

    console.log(`[animationGenerator] Calling LLM for ${language} block (${code.length} chars, ${lineCount} lines)...`);

    let rawResponse;
    let retries = 0;
    const MAX_RETRIES = 2;

    while (retries <= MAX_RETRIES) {
        try {
            rawResponse = await chatCompletion(SYSTEM_PROMPT, userPrompt, {
                temperature: 0.2,
                maxTokens: 8192,
                forceJson: true,
            });

            const animationData = extractJSON(rawResponse);
            const validated = validateAnimation(animationData);

            // Cache the result
            const record = saveToCache(filePath, code, language, validated);
            console.log(`[animationGenerator] Animation generated: ${validated.frames.length} frames, cached as ${record.id}`);
            return record;

        } catch (err) {
            retries++;
            const isRateLimit = err.message && (
                err.message.includes('Rate limit') ||
                err.message.includes('rate_limit') ||
                err.message.includes('429') ||
                err.message.includes('Quota exceeded')
            );

            if (retries > MAX_RETRIES) {
                console.error('[animationGenerator] Failed after retries:', err.message);
                let finalError = err.message;
                if (err.message.includes('Quota exceeded')) {
                    finalError = "API Quota Exceeded. The free tier has a daily limit. Please wait for it to reset or switch to a different AI provider in settings.";
                }
                throw new Error(`Animation generation failed: ${finalError}`);
            }

            if (isRateLimit) {
                const waitSec = parseRetryAfter(err.message);
                console.warn(`[animationGenerator] Rate limited. Waiting ${waitSec}s before retry ${retries}/${MAX_RETRIES}...`);
                await new Promise(r => setTimeout(r, waitSec * 1000));
            } else {
                console.warn(`[animationGenerator] Retry ${retries}: ${err.message}`);
            }
        }
    }
}

module.exports = {
    generateAnimation,
    loadAnimations,
    deleteAnimation,
    clearAnimations,
    isConfigured,
};
