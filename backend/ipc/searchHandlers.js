/**
 * Search IPC Handlers
 * 
 * Handles full-text search and replace across workspace files.
 * Skips binary files and common non-source directories (node_modules, .git, etc.).
 */

const path = require('path');
const fs = require('fs');
const { ipcMain } = require('electron');

const BINARY_EXTS = new Set([
    'png','jpg','jpeg','gif','webp','bmp','ico','svg','pdf',
    'zip','tar','gz','7z','rar','exe','dll','so','bin',
    'mp3','mp4','wav','avi','mov','mkv','webm',
    'ttf','woff','woff2','eot','class','pyc','pyo',
    'lock','map'
]);

const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.colon', 'dist', 'build', '.next', '.venv', 'venv']);

/**
 * Recursively collect text files from a directory.
 * @param {string} dir - Root directory to walk
 * @param {number} maxFiles - Maximum files to collect
 * @returns {Promise<string[]>} Array of file paths
 */
async function collectFiles(dir, maxFiles = 2000) {
    const files = [];
    async function walk(d) {
        if (files.length >= maxFiles) return;
        let entries;
        try { entries = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (files.length >= maxFiles) break;
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) await walk(path.join(d, entry.name));
            } else {
                const ext = entry.name.split('.').pop()?.toLowerCase() || '';
                if (!BINARY_EXTS.has(ext)) {
                    files.push(path.join(d, entry.name));
                }
            }
        }
    }
    await walk(dir);
    return files;
}

/**
 * Register search-related IPC handlers.
 * @param {Function} getLastOpenedDir - Returns the current workspace root
 */
function registerSearchHandlers({ getLastOpenedDir }) {

    ipcMain.handle('search:inFiles', async (event, query, options) => {
        const lastOpenedDir = getLastOpenedDir();
        if (!lastOpenedDir || !query) return { success: false, grouped: [], totalMatches: 0 };
        try {
            const { caseSensitive = false, wholeWord = false, useRegex = false } = options || {};
            let pattern;
            try {
                const escaped = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wordBound = wholeWord ? `\\b${escaped}\\b` : escaped;
                pattern = new RegExp(wordBound, caseSensitive ? 'g' : 'gi');
            } catch { return { success: false, grouped: [], totalMatches: 0 }; }

            const files = await collectFiles(lastOpenedDir);
            const grouped = [];
            let totalMatches = 0;

            for (const filePath of files) {
                let content;
                try { content = await fs.promises.readFile(filePath, 'utf-8'); } catch { continue; }
                const lines = content.split(/\r?\n/);
                const matches = [];

                for (let i = 0; i < lines.length; i += 1) {
                    const line = lines[i];
                    let m;
                    pattern.lastIndex = 0;
                    while ((m = pattern.exec(line)) !== null) {
                        matches.push({
                            filePath,
                            fileName: path.basename(filePath),
                            lineNumber: i + 1,
                            lineContent: line.substring(0, 200),
                            matchStart: m.index,
                            matchEnd: m.index + m[0].length,
                        });
                        totalMatches += 1;
                        if (totalMatches > 5000) break;
                        
                        // Prevent infinite loops on empty matches
                        if (m[0].length === 0) {
                            pattern.lastIndex += 1;
                        }
                    }
                    if (totalMatches > 5000) break;
                }

                if (matches.length > 0) {
                    grouped.push({ filePath, fileName: path.basename(filePath), matches });
                }
                if (totalMatches > 5000) break;
            }

            return { success: true, grouped, totalMatches };
        } catch (err) {
            console.error('[searchHandlers] searchInFiles error:', err);
            return { success: false, grouped: [], totalMatches: 0 };
        }
    });

    ipcMain.handle('search:replaceInFiles', async (event, query, replacement, options) => {
        const lastOpenedDir = getLastOpenedDir();
        if (!lastOpenedDir || !query) return { success: false, replacedCount: 0 };
        try {
            const { caseSensitive = false, wholeWord = false, useRegex = false } = options || {};
            let pattern;
            try {
                const escaped = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wordBound = wholeWord ? `\\b${escaped}\\b` : escaped;
                pattern = new RegExp(wordBound, caseSensitive ? 'g' : 'gi');
            } catch { return { success: false, replacedCount: 0 }; }

            const files = await collectFiles(lastOpenedDir);
            let replacedCount = 0;

            for (const filePath of files) {
                let content;
                try { content = await fs.promises.readFile(filePath, 'utf-8'); } catch { continue; }
                const newContent = content.replace(pattern, () => { replacedCount += 1; return replacement; });
                if (newContent !== content) {
                    await fs.promises.writeFile(filePath, newContent, 'utf-8');
                }
            }

            return { success: true, replacedCount };
        } catch (err) {
            console.error('[searchHandlers] replaceInFiles error:', err);
            return { success: false, replacedCount: 0 };
        }
    });
}

module.exports = { registerSearchHandlers };
