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

const SYSTEM_PROMPT = `You are an expert code animation generator for an educational IDE called Colon.

Your job: Given a code block in any programming language, produce a frame-by-frame animation description as JSON that shows how the code executes step by step.

The animation will be rendered as smooth 2D visuals (like Motion Canvas / 3Blue1Brown style). Each frame represents one logical step of execution.

RULES:
1. Return ONLY valid JSON — no markdown, no backticks, no commentary outside JSON.
2. Each frame shows: what line is executing, variable states, any output, and relevant data structure visualizations.
3. Use vivid colors for variables: #3B82F6 (blue), #8B5CF6 (purple), #14B8A6 (teal), #F59E0B (amber), #EF4444 (red), #EC4899 (pink), #10B981 (green).
4. Mark variables as "changed": true when their value changes from the previous frame.
5. For loops: show each iteration as separate frames with the loop variable changing.
6. For data structures (arrays, stacks, trees): include "visuals" entries showing the structure state.
7. For function calls: show the call stack in visuals.
8. Keep captions short (< 80 chars) and educational — explain WHAT is happening and WHY.
9. Maximum 30 frames. For long loops, show first 3 iterations and last iteration with "..." frame between.
10. Simulate the code execution accurately — track real values, not placeholders.

JSON SCHEMA:
{
  "title": "string — short title for the animation",
  "frames": [
    {
      "caption": "string — explain this step",
      "code": {
        "source": "string — the full code block",
        "highlight": [1]  // 1-indexed line numbers to highlight
      },
      "variables": [
        { "name": "x", "value": "5", "color": "#3B82F6", "changed": true }
      ],
      "output": ["line1", "line2"],
      "visuals": [
        {
          "type": "array",
          "label": "my_list",
          "items": [1, 2, 3],
          "highlight": [0],
          "arrows": []
        }
      ]
    }
  ]
}

VISUAL TYPES:
- "array": horizontal cells (items = values, highlight = indices with emphasis)
- "stack": vertical pile, top-to-bottom (items = stack values, top = first item)
- "linkedList": nodes in a chain with arrows between them
- "callStack": function call stack (items = function names, top = current)
- "grid": 2D grid (items = flattened row-major, needs "cols" property)
- "pointer": arrow pointing from one visual to another

Remember: Return ONLY the JSON object. No other text.`;

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
 * Parse retry-after seconds from a Groq/OpenAI rate limit error message.
 */
function parseRetryAfter(message) {
    const m = message.match(/try again in ([\d.]+)s/i);
    return m ? Math.ceil(parseFloat(m[1])) + 1 : 10;
}

/**
 * Extract JSON from LLM response that may contain markdown fences.
 */
function extractJSON(text) {
    // Log first 500 chars for debugging
    console.log('[animationGenerator] Raw LLM response (first 500 chars):', text?.slice(0, 500));

    if (!text || typeof text !== 'string') {
        throw new Error('Empty LLM response');
    }

    // Strip control characters that break JSON.parse
    let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    // Try raw parse first
    try { return JSON.parse(cleaned); } catch { /* continue */ }

    // Strip markdown fences
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
        try { return JSON.parse(fenceMatch[1]); } catch { /* continue */ }
    }

    // Try to find JSON object boundaries
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
        const slice = cleaned.slice(start, end + 1);
        try { return JSON.parse(slice); } catch (e) {
            // If truncated (missing closing brackets), try to fix
            let fixed = slice;
            // Count open/close braces
            const openBraces = (fixed.match(/{/g) || []).length;
            const closeBraces = (fixed.match(/}/g) || []).length;
            const openBrackets = (fixed.match(/\[/g) || []).length;
            const closeBrackets = (fixed.match(/\]/g) || []).length;

            // Attempt to close unclosed structures
            for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
            for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';

            try { return JSON.parse(fixed); } catch { /* final fail */ }
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

    // Build user prompt
    const userPrompt = `Language: ${language}
Block type: ${blockInfo?.type || 'unknown'}
Code:
\`\`\`${language}
${code}
\`\`\`

Generate the step-by-step animation JSON for this code. Show how each line executes, how variables change, and visualize any data structures.`;

    console.log(`[animationGenerator] Calling LLM for ${language} block (${code.length} chars)...`);

    let rawResponse;
    let retries = 0;
    const MAX_RETRIES = 2;

    while (retries <= MAX_RETRIES) {
        try {
            rawResponse = await chatCompletion(SYSTEM_PROMPT, userPrompt, {
                temperature: retries === 0 ? 0.3 : 0.1,
                maxTokens: 4096,
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
                err.message.includes('429')
            );

            if (retries > MAX_RETRIES) {
                console.error('[animationGenerator] Failed after retries:', err.message);
                throw new Error(`Animation generation failed: ${err.message}`);
            }

            if (isRateLimit) {
                const waitSec = parseRetryAfter(err.message);
                console.warn(`[animationGenerator] Rate limited. Waiting ${waitSec}s before retry ${retries}...`);
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
