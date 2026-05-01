/**
 * Linter Service — Runs static analysis on code to provide IDE error highlighting.
 * Uses pyright for Python, gcc for C/C++, and javac for Java.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/** On Windows, node_modules/.bin scripts have a .cmd wrapper */
const BIN_EXT = process.platform === 'win32' ? '.cmd' : '';

function runCmd(cmd, args) {
    return new Promise((resolve) => {
        execFile(cmd, args, { timeout: 3000 }, (error, stdout, stderr) => {
            resolve({ error, stdout, stderr });
        });
    });
}

function parsePyright(output) {
    try {
        const data = JSON.parse(output);
        if (!data.generalDiagnostics) return [];
        return data.generalDiagnostics.map(diag => ({
            severity: diag.severity === 'error' ? 8 : 4, // 8 = Error, 4 = Warning in Monaco
            startLineNumber: diag.range.start.line + 1,
            startColumn: diag.range.start.character + 1,
            endLineNumber: diag.range.end.line + 1,
            endColumn: diag.range.end.character + 1,
            message: diag.message,
            source: 'pyright'
        }));
    } catch {
        return [];
    }
}

function parseGcc(output, tmpFile) {
    const markers = [];
    const lines = output.split(/\r?\n/);
    // Regex: filename:line:column: error/warning: message
    const regex = new RegExp(`${escapeRegExp(tmpFile)}:(\\d+):(\\d+):\\s*(error|warning):\\s*(.*)`);

    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            markers.push({
                severity: match[3] === 'error' ? 8 : 4,
                startLineNumber: parseInt(match[1]),
                startColumn: parseInt(match[2]),
                endLineNumber: parseInt(match[1]),
                endColumn: parseInt(match[2]) + 1, // rough estimate
                message: match[4],
                source: 'gcc'
            });
        }
    }
    return markers;
}

function parseJavac(output, tmpFile) {
    const markers = [];
    const lines = output.split(/\r?\n/);
    // Regex: filename:line: error: message
    const regex = new RegExp(`${escapeRegExp(tmpFile)}:(\\d+):\\s*error:\\s*(.*)`);

    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            markers.push({
                severity: 8,
                startLineNumber: parseInt(match[1]),
                startColumn: 1,
                endLineNumber: parseInt(match[1]),
                endColumn: 99, // Highlight whole line
                message: match[2],
                source: 'javac'
            });
        }
    }
    return markers;
}

function parseTsc(output, tmpFile) {
    const markers = [];
    const lines = output.split(/\r?\n/);
    // TSC output: file(line,col): error TS<code>: message
    const regex = /\((\d+),(\d+)\):\s*(error|warning)\s+TS\d+:\s*(.*)/;
    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            markers.push({
                severity: match[3] === 'error' ? 8 : 4,
                startLineNumber: parseInt(match[1]),
                startColumn: parseInt(match[2]),
                endLineNumber: parseInt(match[1]),
                endColumn: parseInt(match[2]) + 1,
                message: match[4].trim(),
                source: 'tsc'
            });
        }
    }
    return markers;
}

function parseGoVet(output) {
    const markers = [];
    const lines = output.split(/\r?\n/);
    // go vet: ./file.go:line:col: message
    const regex = /[^:]+:(\d+):(\d+):\s*(.*)/;
    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            markers.push({
                severity: 8,
                startLineNumber: parseInt(match[1]),
                startColumn: parseInt(match[2]),
                endLineNumber: parseInt(match[1]),
                endColumn: parseInt(match[2]) + 1,
                message: match[3].trim(),
                source: 'go vet'
            });
        }
    }
    return markers;
}

function parseRustc(output, tmpFile) {
    const markers = [];
    const lines = output.split(/\r?\n/);
    // rustc: error[Exx]: message -> file:line:col
    const regex = /--> [^:]+:(\d+):(\d+)/;
    let pendingMsg = '';
    let pendingSeverity = 8;
    for (const line of lines) {
        if (line.startsWith('error') || line.startsWith('warning')) {
            const msgMatch = line.match(/^(error|warning)(?:\[.*?\])?:\s*(.*)/);
            if (msgMatch) {
                pendingMsg = msgMatch[2];
                pendingSeverity = msgMatch[1] === 'error' ? 8 : 4;
            }
        }
        const locMatch = line.match(regex);
        if (locMatch && pendingMsg) {
            markers.push({
                severity: pendingSeverity,
                startLineNumber: parseInt(locMatch[1]),
                startColumn: parseInt(locMatch[2]),
                endLineNumber: parseInt(locMatch[1]),
                endColumn: parseInt(locMatch[2]) + 1,
                message: pendingMsg,
                source: 'rustc'
            });
            pendingMsg = '';
        }
    }
    return markers;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns an array of Monaco Editor Marker objects.
 */
async function lintCode(fileName, content) {
    const ext = path.extname(fileName).toLowerCase();

    const SUPPORTED = ['.py', '.c', '.cpp', '.cc', '.java', '.ts', '.tsx', '.go', '.rs'];
    if (!SUPPORTED.includes(ext)) {
        return [];
    }

    // Write to a temporary file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'colon-lint-'));
    const tmpFile = path.join(tmpDir, path.basename(fileName));
    fs.writeFileSync(tmpFile, content);

    let markers = [];

    try {
        if (ext === '.py') {
            const pyrightBin = path.join(__dirname, '..', 'node_modules', '.bin', 'pyright' + BIN_EXT);
            const result = await runCmd(pyrightBin, ['--outputjson', tmpFile]);
            markers = parsePyright(result.stdout);

        } else if (ext === '.c' || ext === '.cpp' || ext === '.cc') {
            const compiler = ext === '.c' ? 'gcc' : 'g++';
            const result = await runCmd(compiler, ['-fsyntax-only', '-Wall', tmpFile]);
            markers = parseGcc(result.stderr, tmpFile);

        } else if (ext === '.java') {
            const result = await runCmd('javac', ['-Xlint:none', tmpFile]);
            markers = parseJavac(result.stderr, tmpFile);

        } else if (ext === '.ts' || ext === '.tsx') {
            const tscBin = path.join(__dirname, '..', 'node_modules', '.bin', 'tsc' + BIN_EXT);
            // --noEmit: type-check only, --strict: full strictness, --allowJs: for .tsx
            const result = await runCmd(tscBin, [
                '--noEmit', '--strict', '--allowJs', '--jsx', 'react',
                '--target', 'esnext', '--moduleResolution', 'node',
                '--skipLibCheck', tmpFile
            ]);
            markers = parseTsc((result.stdout || '') + (result.stderr || ''), tmpFile);

        } else if (ext === '.go') {
            const result = await runCmd('go', ['vet', tmpFile]);
            markers = parseGoVet((result.stderr || '') + (result.stdout || ''));

        } else if (ext === '.rs') {
            const outDir = path.join(os.tmpdir(), 'colon-lint-rs');
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
            const result = await runCmd('rustc', [
                '--error-format=human', '--edition', '2021',
                '-o', path.join(outDir, 'out' + (process.platform === 'win32' ? '.exe' : '')), tmpFile
            ]);
            markers = parseRustc((result.stderr || '') + (result.stdout || ''), tmpFile);
        }
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    return markers;
}

module.exports = { lintCode };
