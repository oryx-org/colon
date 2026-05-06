const { execFile } = require('child_process');
const util = require('util');
const path = require('path');
const execFilePromise = util.promisify(execFile);

function normalizeArgs(command) {
    if (Array.isArray(command)) {
        return command.map(arg => String(arg));
    }

    if (typeof command !== 'string') {
        throw new Error('Git command must be an argument array or string');
    }

    const args = [];
    const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|[^\s]+/g;
    let match;
    while ((match = re.exec(command)) !== null) {
        const token = match[1] ?? match[2] ?? match[0];
        args.push(token.replace(/\\"/g, '"').replace(/\\'/g, "'"));
    }
    return args;
}

/**
 * Run a git command safely using execFile() with argument arrays.
 * This prevents shell injection by avoiding string interpolation in exec().
 */
async function runGit(command, cwd) {
    try {
        const args = normalizeArgs(command);
        const { stdout, stderr } = await execFilePromise('git', args, { cwd });
        return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error) {
        return { success: false, stdout: error.stdout?.trim(), stderr: error.stderr?.trim() || error.message };
    }
}

async function getStatus(cwd) {
    const res = await runGit('status -s', cwd);
    if (!res.success) return { isRepo: false };
    
    const lines = res.stdout.split(/\r?\n/).filter(Boolean);
    const files = lines.map(line => {
        const status = line.substring(0, 2);
        const file = line.substring(3);
        return { file, status, path: cwd ? path.resolve(cwd, file) : file };
    });
    
    return { isRepo: true, files };
}

module.exports = {
    runGit,
    getStatus
};
