const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function runGit(command, cwd) {
    try {
        const { stdout, stderr } = await execPromise(`git ${command}`, { cwd });
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
        return { file, status };
    });
    
    return { isRepo: true, files };
}

module.exports = {
    runGit,
    getStatus
};
