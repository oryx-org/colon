/**
 * Security Path Guards — Tests
 * Validates filesystem sandboxing: isPathWithinWorkspace() must prevent
 * path traversal and restrict access to the workspace root only.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');

// Recreate the isPathWithinWorkspace logic locally for unit testing
// (the real one lives in main.js but depends on app state)
function createPathGuard(workspaceRoot, allowedFiles = new Set()) {
    return function isPathWithinWorkspace(targetPath) {
        try {
            const resolved = path.resolve(targetPath);
            if (workspaceRoot) {
                const workspace = path.resolve(workspaceRoot);
                const relative = path.relative(workspace, resolved);
                if (relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative))) {
                    return true;
                }
            }
            return allowedFiles.has(resolved);
        } catch {
            return false;
        }
    };
}

describe('Security Path Guards', () => {
    let isPathWithinWorkspace;
    const testWorkspace = path.join(os.tmpdir(), 'colon-test-workspace');

    beforeEach(() => {
        isPathWithinWorkspace = createPathGuard(testWorkspace);
    });

    it('should allow paths within the workspace', () => {
        assert.strictEqual(isPathWithinWorkspace(path.join(testWorkspace, 'src', 'main.js')), true);
    });

    it('should allow the workspace root itself', () => {
        assert.strictEqual(isPathWithinWorkspace(testWorkspace), true);
    });

    it('should block paths outside the workspace', () => {
        assert.strictEqual(isPathWithinWorkspace('/etc/passwd'), false);
        assert.strictEqual(isPathWithinWorkspace('C:\\Windows\\System32\\cmd.exe'), false);
    });

    it('should block path traversal attacks', () => {
        assert.strictEqual(isPathWithinWorkspace(path.join(testWorkspace, '..', '..', 'etc', 'passwd')), false);
        assert.strictEqual(isPathWithinWorkspace(path.join(testWorkspace, '..', 'other-project', 'secret.env')), false);
    });

    it('should block absolute paths outside workspace', () => {
        assert.strictEqual(isPathWithinWorkspace(os.homedir()), false);
    });

    it('should allow explicitly permitted files outside workspace', () => {
        const externalFile = path.resolve('/tmp/allowed-file.txt');
        const guard = createPathGuard(testWorkspace, new Set([externalFile]));
        assert.strictEqual(guard(externalFile), true);
    });

    it('should not allow non-permitted external files', () => {
        const guard = createPathGuard(testWorkspace, new Set(['/tmp/allowed.txt']));
        assert.strictEqual(guard('/tmp/not-allowed.txt'), false);
    });

    it('should handle null/undefined workspace gracefully', () => {
        const guard = createPathGuard(null);
        assert.strictEqual(guard('/any/path'), false);
    });
});

describe('Script Validation — Import Security', () => {
    const { validateImports, BLOCKED_PYTHON_IMPORTS, ALLOWED_PYTHON_IMPORTS } = require('../services/scriptValidator');

    it('should have comprehensive blocked imports list', () => {
        const criticalBlocks = ['os', 'sys', 'subprocess', 'shutil', 'socket', 'ctypes'];
        for (const mod of criticalBlocks) {
            assert.ok(BLOCKED_PYTHON_IMPORTS.has(mod), `${mod} should be blocked`);
        }
    });

    it('should have manim in allowed imports', () => {
        assert.ok(ALLOWED_PYTHON_IMPORTS.has('manim'));
        assert.ok(ALLOWED_PYTHON_IMPORTS.has('math'));
        assert.ok(ALLOWED_PYTHON_IMPORTS.has('numpy'));
    });

    it('should reject network-related imports', () => {
        const result = validateImports('import socket\nimport http\nimport urllib');
        assert.strictEqual(result.safe, false);
        assert.ok(result.violations.length >= 1);
    });

    it('should reject code execution imports', () => {
        const result = validateImports('import pickle\nimport marshal');
        assert.strictEqual(result.safe, false);
    });
});
