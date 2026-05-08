/**
 * Universal Block Detector — regex-based detection
 * of animatable code blocks for ALL supported languages.
 *
 * Returns blocks with: type, startLine, endLine, label, code, language
 */

/**
 * Language-specific block patterns.
 * Each pattern: { type, regex (matches first line of block), endStrategy }
 * endStrategy: 'indent' (Python) | 'brace' (C-family) | 'keyword' (Ruby)
 */
const LANGUAGE_PATTERNS = {
    python: {
        strategy: 'indent',
        patterns: [
            { type: 'function', regex: /^(\s*)def\s+(\w+)\s*\(/ },
            { type: 'class', regex: /^(\s*)class\s+(\w+)/ },
            { type: 'for_loop', regex: /^(\s*)for\s+.+\s+in\s+/ },
            { type: 'while_loop', regex: /^(\s*)while\s+/ },
            { type: 'if_block', regex: /^(\s*)if\s+/ },
            { type: 'with_block', regex: /^(\s*)with\s+/ },
            { type: 'try_block', regex: /^(\s*)try\s*:/ },
        ],
    },
    javascript: {
        strategy: 'brace',
        patterns: [
            { type: 'function', regex: /^(\s*)(?:async\s+)?function\s+(\w+)\s*\(/ },
            { type: 'function', regex: /^(\s*)(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/ },
            { type: 'class', regex: /^(\s*)class\s+(\w+)/ },
            { type: 'for_loop', regex: /^(\s*)for\s*\(/ },
            { type: 'while_loop', regex: /^(\s*)while\s*\(/ },
            { type: 'if_block', regex: /^(\s*)if\s*\(/ },
            { type: 'try_block', regex: /^(\s*)try\s*\{/ },
        ],
    },
    typescript: { strategy: 'brace', patterns: null }, // inherits JS
    java: {
        strategy: 'brace',
        patterns: [
            { type: 'function', regex: /^(\s*)(?:public|private|protected|static|\s)*\s+\w+\s+(\w+)\s*\(/ },
            { type: 'class', regex: /^(\s*)(?:public|private|protected)?\s*class\s+(\w+)/ },
            { type: 'for_loop', regex: /^(\s*)for\s*\(/ },
            { type: 'while_loop', regex: /^(\s*)while\s*\(/ },
            { type: 'if_block', regex: /^(\s*)if\s*\(/ },
            { type: 'try_block', regex: /^(\s*)try\s*\{/ },
        ],
    },
    c: {
        strategy: 'brace',
        patterns: [
            { type: 'function', regex: /^(\s*)\w[\w\s*]*\s+(\w+)\s*\([^;]*$/ },
            { type: 'for_loop', regex: /^(\s*)for\s*\(/ },
            { type: 'while_loop', regex: /^(\s*)while\s*\(/ },
            { type: 'if_block', regex: /^(\s*)if\s*\(/ },
        ],
    },
    cpp: { strategy: 'brace', patterns: null }, // inherits C
    go: {
        strategy: 'brace',
        patterns: [
            { type: 'function', regex: /^(\s*)func\s+(\w+)/ },
            { type: 'for_loop', regex: /^(\s*)for\s+/ },
            { type: 'if_block', regex: /^(\s*)if\s+/ },
        ],
    },
    rust: {
        strategy: 'brace',
        patterns: [
            { type: 'function', regex: /^(\s*)(?:pub\s+)?fn\s+(\w+)/ },
            { type: 'for_loop', regex: /^(\s*)for\s+\w+\s+in\s+/ },
            { type: 'while_loop', regex: /^(\s*)while\s+/ },
            { type: 'if_block', regex: /^(\s*)if\s+/ },
            { type: 'class', regex: /^(\s*)(?:pub\s+)?(?:struct|enum|impl)\s+(\w+)/ },
        ],
    },
    ruby: {
        strategy: 'keyword',
        endKeyword: 'end',
        patterns: [
            { type: 'function', regex: /^(\s*)def\s+(\w+)/ },
            { type: 'class', regex: /^(\s*)class\s+(\w+)/ },
            { type: 'for_loop', regex: /^(\s*)(?:\w+\.)?each\s/ },
            { type: 'while_loop', regex: /^(\s*)while\s+/ },
            { type: 'if_block', regex: /^(\s*)if\s+/ },
        ],
    },
    php: {
        strategy: 'brace',
        patterns: [
            { type: 'function', regex: /^(\s*)(?:public|private|protected|static|\s)*function\s+(\w+)/ },
            { type: 'class', regex: /^(\s*)class\s+(\w+)/ },
            { type: 'for_loop', regex: /^(\s*)for(?:each)?\s*\(/ },
            { type: 'while_loop', regex: /^(\s*)while\s*\(/ },
            { type: 'if_block', regex: /^(\s*)if\s*\(/ },
        ],
    },
};

// Language aliases
const LANG_ALIAS = {
    typescript: 'javascript',
    tsx: 'javascript',
    jsx: 'javascript',
    cpp: 'c',
    cc: 'c',
    cxx: 'c',
    'c++': 'c',
    csharp: 'java',
    cs: 'java',
    kotlin: 'java',
    kt: 'java',
    swift: 'java',
};

/**
 * Map file extension to language key.
 */
function extToLanguage(ext) {
    const map = {
        '.py': 'python', '.pyw': 'python',
        '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
        '.ts': 'typescript', '.tsx': 'typescript',
        '.java': 'java', '.kt': 'java', '.kts': 'java',
        '.c': 'c', '.h': 'c',
        '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
        '.go': 'go',
        '.rs': 'rust',
        '.rb': 'ruby',
        '.php': 'php',
        '.cs': 'java',
        '.swift': 'java',
    };
    return map[ext.toLowerCase()] || null;
}

/**
 * Get patterns for a language, following alias chain.
 */
function getPatternsForLang(lang) {
    let config = LANGUAGE_PATTERNS[lang];
    if (config && !config.patterns) {
        const alias = LANG_ALIAS[lang];
        if (alias) config = { ...LANGUAGE_PATTERNS[alias], strategy: config.strategy || LANGUAGE_PATTERNS[alias].strategy };
    }
    return config || null;
}

/**
 * Find the end of a brace-delimited block starting at lineIndex.
 */
function findBraceEnd(lines, startIdx) {
    let depth = 0;
    let foundOpen = false;
    for (let i = startIdx; i < lines.length; i += 1) {
        for (const ch of lines[i]) {
            if (ch === '{') { depth += 1; foundOpen = true; }
            if (ch === '}') { depth -= 1; }
            if (foundOpen && depth === 0) return i;
        }
    }
    return Math.min(startIdx + 50, lines.length - 1);
}

/**
 * Find the end of an indentation-based block starting at lineIndex.
 */
function findIndentEnd(lines, startIdx) {
    const startIndent = lines[startIdx].search(/\S/);
    if (startIndent < 0) return startIdx;
    let lastLine = startIdx;
    for (let i = startIdx + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.trim() === '') continue; // skip blank lines
        const indent = line.search(/\S/);
        if (indent <= startIndent) break;
        lastLine = i;
    }
    return lastLine;
}

/**
 * Find the end of a keyword-based block (e.g., Ruby's "end").
 */
function findKeywordEnd(lines, startIdx, endKeyword) {
    const startIndent = lines[startIdx].search(/\S/);
    for (let i = startIdx + 1; i < lines.length; i += 1) {
        const trimmed = lines[i].trim();
        const indent = lines[i].search(/\S/);
        if (trimmed === endKeyword && indent <= startIndent) return i;
    }
    return Math.min(startIdx + 50, lines.length - 1);
}

/**
 * Generate a human-readable label for a block.
 */
function makeLabel(type, match, line) {
    const name = match[2] || '';
    switch (type) {
        case 'function': return name ? `fn ${name}(...)` : line.trim().slice(0, 40);
        case 'class': return name ? `class ${name}` : line.trim().slice(0, 40);
        case 'for_loop': return line.trim().slice(0, 40);
        case 'while_loop': return line.trim().slice(0, 40);
        case 'if_block': return line.trim().slice(0, 40);
        case 'try_block': return 'try/catch';
        case 'with_block': return line.trim().slice(0, 40);
        default: return line.trim().slice(0, 40);
    }
}

/**
 * Detect animatable blocks in source code.
 * @param {string} code — full source code
 * @param {string} language — language identifier (e.g., 'python', 'javascript')
 * @returns {Array} — sorted block list
 */
function detectBlocks(code, language) {
    const langKey = language.toLowerCase();
    const config = getPatternsForLang(langKey);
    if (!config?.patterns) return [];

    const lines = code.split('\n');
    const blocks = [];

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.trim() === '' || line.trim().startsWith('//') || line.trim().startsWith('#')) continue;

        for (const pattern of config.patterns) {
            const match = pattern.regex.exec(line);
            if (!match) continue;

            let endLine;
            switch (config.strategy) {
                case 'indent':
                    endLine = findIndentEnd(lines, i);
                    break;
                case 'brace':
                    endLine = findBraceEnd(lines, i);
                    break;
                case 'keyword':
                    endLine = findKeywordEnd(lines, i, config.endKeyword || 'end');
                    break;
                default:
                    endLine = i;
            }

            const blockCode = lines.slice(i, endLine + 1).join('\n');

            blocks.push({
                type: pattern.type,
                startLine: i + 1, // 1-indexed
                endLine: endLine + 1,
                label: makeLabel(pattern.type, match, line),
                code: blockCode,
                language: langKey,
            });

            // Skip to end of block to avoid nested matches at top level
            break;
        }
    }

    // Sort by start line
    blocks.sort((a, b) => a.startLine - b.startLine);
    return blocks;
}

module.exports = { detectBlocks, extToLanguage };
