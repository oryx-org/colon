/**
 * Environment Scanner — Detects installed programming runtimes on the user's PC.
 */

const { execFile } = require('child_process');
const path = require('path');
const os = require('os');

/** All supported runtimes */
const RUNTIMES = [
    {
        id: 'python',
        name: 'Python 3',
        commands: ['python3', 'python'],
        versionFlag: '--version',
        parseVersion: (output) => {
            const match = output.match(/Python\s+([\d.]+)/i);
            return match ? match[1] : null;
        },
        extensions: ['.py'],
        runTemplate: (cmd, filePath) => `${cmd} "${filePath}"`,
        installCmd: {
            linux: 'sudo apt-get install -y python3 python3-pip',
            darwin: 'brew install python3',
            win32: 'winget install Python.Python.3.12'
        }
    },
    {
        id: 'node',
        name: 'Node.js',
        commands: ['node'],
        versionFlag: '--version',
        parseVersion: (output) => {
            const match = output.match(/v?([\d.]+)/);
            return match ? match[1] : null;
        },
        extensions: ['.js', '.mjs'],
        runTemplate: (cmd, filePath) => `${cmd} "${filePath}"`,
        installCmd: {
            linux: 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs',
            darwin: 'brew install node',
            win32: 'winget install OpenJS.NodeJS.LTS'
        }
    },
    {
        id: 'typescript',
        name: 'TypeScript (ts-node)',
        commands: ['ts-node'],
        versionFlag: '--version',
        parseVersion: (output) => {
            const match = output.match(/v?([\d.]+)/);
            return match ? match[1] : null;
        },
        extensions: ['.ts'],
        runTemplate: (cmd, filePath) => `npx ts-node "${filePath}"`,
        installCmd: {
            linux: 'npm install -g ts-node typescript @types/node',
            darwin: 'npm install -g ts-node typescript @types/node',
            win32: 'npm install -g ts-node typescript @types/node'
        }
    },
    {
        id: 'gcc',
        name: 'GCC (C Compiler)',
        commands: ['gcc'],
        versionFlag: '--version',
        parseVersion: (output) => {
            const match = output.match(/(\d+\.\d+\.\d+)/);
            return match ? match[1] : null;
        },
        extensions: ['.c'],
        // Compile then run — binary goes to temp dir so source dir stays clean
        runTemplate: (cmd, filePath) => {
            const baseName = path.basename(filePath, path.extname(filePath));
            const outPath = path.join(os.tmpdir(), 'colon-runner', baseName);
            return `${cmd} "${filePath}" -o "${outPath}" -lm && "${outPath}"`;
        },
        installCmd: {
            linux: 'sudo apt-get install -y build-essential',
            darwin: 'xcode-select --install',
            win32: 'winget install GnuWin32.Make'
        }
    },
    {
        id: 'gpp',
        name: 'G++ (C++ Compiler)',
        commands: ['g++'],
        versionFlag: '--version',
        parseVersion: (output) => {
            const match = output.match(/(\d+\.\d+\.\d+)/);
            return match ? match[1] : null;
        },
        extensions: ['.cpp', '.cc', '.cxx'],
        runTemplate: (cmd, filePath) => {
            const baseName = path.basename(filePath, path.extname(filePath));
            const outPath = path.join(os.tmpdir(), 'colon-runner', baseName);
            return `${cmd} "${filePath}" -o "${outPath}" && "${outPath}"`;
        },
        installCmd: {
            linux: 'sudo apt-get install -y build-essential',
            darwin: 'xcode-select --install',
            win32: 'winget install GnuWin32.Make'
        }
    },
    {
        id: 'java',
        name: 'Java (JDK)',
        commands: ['java'],
        versionFlag: '-version',
        parseVersion: (output) => {
            const match = output.match(/version\s+"?([\d._]+)"?/i);
            return match ? match[1] : null;
        },
        extensions: ['.java'],
        runTemplate: (cmd, filePath) => {
            const baseName = path.basename(filePath, '.java');
            const dir = path.dirname(filePath);
            return `cd "${dir}" && javac "${path.basename(filePath)}" && java ${baseName}`;
        },
        installCmd: {
            linux: 'sudo apt-get install -y default-jdk',
            darwin: 'brew install openjdk',
            win32: 'winget install Microsoft.OpenJDK.21'
        }
    },
    {
        id: 'go',
        name: 'Go',
        commands: ['go'],
        versionFlag: 'version',
        parseVersion: (output) => {
            const match = output.match(/go([\d.]+)/);
            return match ? match[1] : null;
        },
        extensions: ['.go'],
        runTemplate: (cmd, filePath) => `${cmd} run "${filePath}"`,
        installCmd: {
            linux: 'sudo snap install go --classic',
            darwin: 'brew install go',
            win32: 'winget install GoLang.Go'
        }
    },
    {
        id: 'rust',
        name: 'Rust',
        commands: ['rustc'],
        versionFlag: '--version',
        parseVersion: (output) => {
            const match = output.match(/rustc\s+([\d.]+)/);
            return match ? match[1] : null;
        },
        extensions: ['.rs'],
        runTemplate: (cmd, filePath) => {
            const baseName = path.basename(filePath, '.rs');
            const outPath = path.join(os.tmpdir(), 'colon-runner', baseName);
            return `${cmd} "${filePath}" -o "${outPath}" && "${outPath}"`;
        },
        installCmd: {
            linux: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
            darwin: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
            win32: 'winget install Rustlang.Rust.MSVC'
        }
    },
    {
        id: 'ruby',
        name: 'Ruby',
        commands: ['ruby'],
        versionFlag: '--version',
        parseVersion: (output) => {
            const match = output.match(/ruby\s+([\d.]+)/);
            return match ? match[1] : null;
        },
        extensions: ['.rb'],
        runTemplate: (cmd, filePath) => `${cmd} "${filePath}"`,
        installCmd: {
            linux: 'sudo apt-get install -y ruby-full',
            darwin: 'brew install ruby',
            win32: 'winget install RubyInstallerTeam.Ruby'
        }
    },
    {
        id: 'php',
        name: 'PHP',
        commands: ['php'],
        versionFlag: '--version',
        parseVersion: (output) => {
            const match = output.match(/PHP\s+([\d.]+)/);
            return match ? match[1] : null;
        },
        extensions: ['.php'],
        runTemplate: (cmd, filePath) => `${cmd} "${filePath}"`,
        installCmd: {
            linux: 'sudo apt-get install -y php-cli',
            darwin: 'brew install php',
            win32: 'winget install PHP.PHP'
        }
    }
];

/** Try running a command */
function tryCommand(cmd, args) {
    return new Promise((resolve) => {
        try {
            execFile(cmd, args, { timeout: 5000 }, (error, stdout, stderr) => {
                if (error) resolve(null);
                else resolve((stdout || '') + (stderr || ''));
            });
        } catch {
            resolve(null);
        }
    });
}

/** Find absolute path of a command */
function findPath(cmd) {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    return new Promise((resolve) => {
        execFile(finder, [cmd], { timeout: 3000 }, (error, stdout) => {
            if (error || !stdout) resolve(null);
            else resolve(stdout.trim().split('\n')[0]);
        });
    });
}

/** Scan all runtimes */
async function scanEnvironments() {
    const results = {};

    for (const runtime of RUNTIMES) {
        let detected = false;

        for (const cmd of runtime.commands) {
            const output = await tryCommand(cmd, [runtime.versionFlag]);
            if (output) {
                const version = runtime.parseVersion(output);
                const binPath = await findPath(cmd);
                results[runtime.id] = {
                    id: runtime.id,
                    name: runtime.name,
                    installed: true,
                    version: version || 'unknown',
                    path: binPath || cmd,
                    command: cmd,
                    extensions: runtime.extensions,
                    installCmd: runtime.installCmd[process.platform] || null
                };
                detected = true;
                break;
            }
        }

        if (!detected) {
            results[runtime.id] = {
                id: runtime.id,
                name: runtime.name,
                installed: false,
                version: null,
                path: null,
                command: runtime.commands[0],
                extensions: runtime.extensions,
                installCmd: runtime.installCmd[process.platform] || null
            };
        }
    }

    return results;
}

/** Given a file extension, find the matching runtime */
function getRuntimeForExtension(ext) {
    for (const runtime of RUNTIMES) {
        if (runtime.extensions.includes(ext)) {
            return runtime;
        }
    }
    return null;
}

/** Build the shell command to run a file */
function buildRunCommand(runtimeId, runtimeCommand, filePath) {
    const runtime = RUNTIMES.find(r => r.id === runtimeId);
    if (!runtime) return null;
    // Ensure temp output dir exists for compiled languages
    const outDir = path.join(os.tmpdir(), 'colon-runner');
    const fs = require('fs');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    return runtime.runTemplate(runtimeCommand, filePath);
}

module.exports = { scanEnvironments, getRuntimeForExtension, buildRunCommand, RUNTIMES };
