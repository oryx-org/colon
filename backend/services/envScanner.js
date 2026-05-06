/**
 * Environment Scanner - detects installed programming runtimes on the user's PC.
 *
 * The scanner intentionally does more than `where`/`which`: many installers update
 * the registry/profile PATH after Electron has already started, so this module
 * refreshes PATH and searches common install folders before reporting a runtime
 * as missing.
 */

const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const WINGET_FLAGS = '--exact --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity';

const wingetInstall = (id) => `winget install --id ${id} ${WINGET_FLAGS}`;
const chocoInstall = (id) => `choco install ${id} -y --no-progress`;

const winGetCandidate = (packageId) => ({
    id: `winget:${packageId}`,
    manager: 'WinGet',
    command: wingetInstall(packageId),
    requirements: [{ command: 'winget', args: ['--version'], name: 'WinGet' }],
    validExitCodes: [0, -1978335189, -1978335212]
});

const chocoCandidate = (packageId) => ({
    id: `choco:${packageId}`,
    manager: 'Chocolatey',
    command: chocoInstall(packageId),
    packageManagerCommand: 'choco',
    packageArgs: ['install', packageId, '-y', '--no-progress'],
    requirements: [{ command: 'choco', args: ['--version'], name: 'Chocolatey' }],
    requiresElevation: true,
    validExitCodes: [0, 1641, 3010]
});

const npmCandidate = (args, command) => ({
    id: `npm:${args.join(' ')}`,
    manager: 'npm',
    command,
    requirements: [{ command: 'npm', args: ['--version'], name: 'npm' }],
    validExitCodes: [0]
});

const WINDOWS_RUNTIME_INSTALLERS = {
    python: [
        winGetCandidate('Python.Python.3.13'),
        chocoCandidate('python')
    ],
    node: [
        winGetCandidate('OpenJS.NodeJS.LTS'),
        chocoCandidate('nodejs-lts')
    ],
    typescript: [
        npmCandidate(['install', '-g', 'ts-node', 'typescript', '@types/node'], 'npm install -g ts-node typescript @types/node')
    ],
    gcc: [
        winGetCandidate('BrechtSanders.WinLibs.POSIX.UCRT'),
        chocoCandidate('mingw')
    ],
    gpp: [
        winGetCandidate('BrechtSanders.WinLibs.POSIX.UCRT'),
        chocoCandidate('mingw')
    ],
    java: [
        winGetCandidate('Microsoft.OpenJDK.21'),
        chocoCandidate('openjdk')
    ],
    go: [
        winGetCandidate('GoLang.Go'),
        chocoCandidate('golang')
    ],
    rust: [
        winGetCandidate('Rustlang.Rustup'),
        chocoCandidate('rust')
    ],
    ruby: [
        winGetCandidate('RubyInstallerTeam.RubyWithDevKit.3.4'),
        chocoCandidate('ruby')
    ],
    php: [
        winGetCandidate('PHP.PHP.8.4'),
        chocoCandidate('php')
    ]
};

/** All supported runtimes */
const RUNTIMES = [
    {
        id: 'python',
        name: 'Python 3',
        probes: [
            { command: 'python3', versionArgs: ['--version'] },
            { command: 'python', versionArgs: ['--version'] },
            { command: 'py', versionArgs: ['-3', '--version'], shellArgs: ['-3'] }
        ],
        versionFlag: '--version',
        parseVersion: (output) => output.match(/Python\s+([\d.]+)/i)?.[1] || null,
        extensions: ['.py'],
        runTemplate: (env, filePath) => `${env.command} ${quoteShellArg(filePath)}`,
        installCmd: {
            linux: 'sudo apt-get update && sudo apt-get install -y python3 python3-pip',
            darwin: 'brew install python',
            win32: wingetInstall('Python.Python.3.13')
        },
        installPrerequisites: {
            linux: [{ command: 'sudo' }, { command: 'apt-get' }],
            darwin: [{ command: 'brew' }],
            win32: [{ command: 'winget' }]
        }
    },
    {
        id: 'node',
        name: 'Node.js',
        probes: [{ command: 'node', versionArgs: ['--version'] }],
        versionFlag: '--version',
        parseVersion: (output) => output.match(/v?([\d.]+)/)?.[1] || null,
        extensions: ['.js', '.mjs', '.cjs'],
        runTemplate: (env, filePath) => `${env.command} ${quoteShellArg(filePath)}`,
        installCmd: {
            linux: 'sudo apt-get update && sudo apt-get install -y nodejs npm',
            darwin: 'brew install node',
            win32: wingetInstall('OpenJS.NodeJS.LTS')
        },
        installPrerequisites: {
            linux: [{ command: 'sudo' }, { command: 'apt-get' }],
            darwin: [{ command: 'brew' }],
            win32: [{ command: 'winget' }]
        }
    },
    {
        id: 'typescript',
        name: 'TypeScript (ts-node)',
        probes: [
            { command: 'ts-node', versionArgs: ['--version'] },
            { command: 'ts-node.cmd', versionArgs: ['--version'] }
        ],
        requiredTools: [{ name: 'node', command: 'node', versionArgs: ['--version'] }],
        versionFlag: '--version',
        parseVersion: (output) => output.match(/v?([\d.]+)/)?.[1] || null,
        extensions: ['.ts'],
        runTemplate: (env, filePath) => `${env.command} ${quoteShellArg(filePath)}`,
        installCmd: {
            linux: 'npm install -g ts-node typescript @types/node',
            darwin: 'npm install -g ts-node typescript @types/node',
            win32: 'npm install -g ts-node typescript @types/node'
        },
        installPrerequisites: {
            linux: [{ runtimeId: 'node', name: 'Node.js' }, { command: 'npm' }],
            darwin: [{ runtimeId: 'node', name: 'Node.js' }, { command: 'npm' }],
            win32: [{ runtimeId: 'node', name: 'Node.js' }, { command: 'npm' }]
        }
    },
    {
        id: 'gcc',
        name: 'C Compiler (GCC/Clang)',
        probes: [
            { command: 'gcc', versionArgs: ['--version'] },
            { command: 'clang', versionArgs: ['--version'] }
        ],
        versionFlag: '--version',
        parseVersion: (output) => output.match(/(?:gcc|clang|LLVM)\D+(\d+\.\d+(?:\.\d+)?)/i)?.[1]
            || output.match(/(\d+\.\d+\.\d+)/)?.[1]
            || null,
        extensions: ['.c'],
        runTemplate: (env, filePath) => {
            const outPath = getCompiledOutputPath(filePath);
            return `${env.command} ${quoteShellArg(filePath)} -o ${quoteShellArg(outPath)} -lm && ${quoteShellArg(outPath)}`;
        },
        installCmd: {
            linux: 'sudo apt-get update && sudo apt-get install -y build-essential',
            darwin: 'xcode-select --install',
            win32: wingetInstall('BrechtSanders.WinLibs.POSIX.UCRT')
        },
        installPrerequisites: {
            linux: [{ command: 'sudo' }, { command: 'apt-get' }],
            darwin: [{ command: 'xcode-select' }],
            win32: [{ command: 'winget' }]
        }
    },
    {
        id: 'gpp',
        name: 'C++ Compiler (G++/Clang++)',
        probes: [
            { command: 'g++', versionArgs: ['--version'] },
            { command: 'clang++', versionArgs: ['--version'] }
        ],
        versionFlag: '--version',
        parseVersion: (output) => output.match(/(?:g\+\+|clang|LLVM)\D+(\d+\.\d+(?:\.\d+)?)/i)?.[1]
            || output.match(/(\d+\.\d+\.\d+)/)?.[1]
            || null,
        extensions: ['.cpp', '.cc', '.cxx', '.hpp'],
        runTemplate: (env, filePath) => {
            const outPath = getCompiledOutputPath(filePath);
            return `${env.command} ${quoteShellArg(filePath)} -o ${quoteShellArg(outPath)} && ${quoteShellArg(outPath)}`;
        },
        installCmd: {
            linux: 'sudo apt-get update && sudo apt-get install -y build-essential',
            darwin: 'xcode-select --install',
            win32: wingetInstall('BrechtSanders.WinLibs.POSIX.UCRT')
        },
        installPrerequisites: {
            linux: [{ command: 'sudo' }, { command: 'apt-get' }],
            darwin: [{ command: 'xcode-select' }],
            win32: [{ command: 'winget' }]
        }
    },
    {
        id: 'java',
        name: 'Java (JDK)',
        probes: [{ command: 'javac', versionArgs: ['-version'] }],
        requiredTools: [{ name: 'java', command: 'java', versionArgs: ['-version'] }],
        versionFlag: '-version',
        parseVersion: (output) => output.match(/(?:javac|version)\s+"?([\d._]+)"?/i)?.[1] || null,
        extensions: ['.java'],
        runTemplate: (env, filePath) => {
            const baseName = path.basename(filePath, '.java');
            const dir = path.dirname(filePath);
            const cd = process.platform === 'win32' ? `cd /d ${quoteShellArg(dir)}` : `cd ${quoteShellArg(dir)}`;
            const javac = env.tools?.javac?.command || env.command;
            const java = env.tools?.java?.command || 'java';
            return `${cd} && ${javac} ${quoteShellArg(path.basename(filePath))} && ${java} ${shellToken(baseName)}`;
        },
        installCmd: {
            linux: 'sudo apt-get update && sudo apt-get install -y default-jdk',
            darwin: 'brew install openjdk',
            win32: wingetInstall('Microsoft.OpenJDK.21')
        },
        installPrerequisites: {
            linux: [{ command: 'sudo' }, { command: 'apt-get' }],
            darwin: [{ command: 'brew' }],
            win32: [{ command: 'winget' }]
        }
    },
    {
        id: 'go',
        name: 'Go',
        probes: [{ command: 'go', versionArgs: ['version'] }],
        versionFlag: 'version',
        parseVersion: (output) => output.match(/go([\d.]+)/)?.[1] || null,
        extensions: ['.go'],
        runTemplate: (env, filePath) => `${env.command} run ${quoteShellArg(filePath)}`,
        installCmd: {
            linux: 'sudo apt-get update && sudo apt-get install -y golang-go',
            darwin: 'brew install go',
            win32: wingetInstall('GoLang.Go')
        },
        installPrerequisites: {
            linux: [{ command: 'sudo' }, { command: 'apt-get' }],
            darwin: [{ command: 'brew' }],
            win32: [{ command: 'winget' }]
        }
    },
    {
        id: 'rust',
        name: 'Rust',
        probes: [{ command: 'rustc', versionArgs: ['--version'] }],
        versionFlag: '--version',
        parseVersion: (output) => output.match(/rustc\s+([\d.]+)/)?.[1] || null,
        extensions: ['.rs'],
        runTemplate: (env, filePath) => {
            const outPath = getCompiledOutputPath(filePath);
            return `${env.command} ${quoteShellArg(filePath)} -o ${quoteShellArg(outPath)} && ${quoteShellArg(outPath)}`;
        },
        installCmd: {
            linux: 'sudo apt-get update && sudo apt-get install -y rustc cargo',
            darwin: 'brew install rust',
            win32: wingetInstall('Rustlang.Rustup')
        },
        installPrerequisites: {
            linux: [{ command: 'sudo' }, { command: 'apt-get' }],
            darwin: [{ command: 'brew' }],
            win32: [{ command: 'winget' }]
        }
    },
    {
        id: 'ruby',
        name: 'Ruby',
        probes: [{ command: 'ruby', versionArgs: ['--version'] }],
        versionFlag: '--version',
        parseVersion: (output) => output.match(/ruby\s+([\d.]+)/)?.[1] || null,
        extensions: ['.rb'],
        runTemplate: (env, filePath) => `${env.command} ${quoteShellArg(filePath)}`,
        installCmd: {
            linux: 'sudo apt-get update && sudo apt-get install -y ruby-full',
            darwin: 'brew install ruby',
            win32: wingetInstall('RubyInstallerTeam.RubyWithDevKit.3.4')
        },
        installPrerequisites: {
            linux: [{ command: 'sudo' }, { command: 'apt-get' }],
            darwin: [{ command: 'brew' }],
            win32: [{ command: 'winget' }]
        }
    },
    {
        id: 'php',
        name: 'PHP',
        probes: [{ command: 'php', versionArgs: ['--version'] }],
        versionFlag: '--version',
        parseVersion: (output) => output.match(/PHP\s+([\d.]+)/)?.[1] || null,
        extensions: ['.php'],
        runTemplate: (env, filePath) => `${env.command} ${quoteShellArg(filePath)}`,
        installCmd: {
            linux: 'sudo apt-get update && sudo apt-get install -y php-cli',
            darwin: 'brew install php',
            win32: wingetInstall('PHP.PHP.8.4')
        },
        installPrerequisites: {
            linux: [{ command: 'sudo' }, { command: 'apt-get' }],
            darwin: [{ command: 'brew' }],
            win32: [{ command: 'winget' }]
        }
    }
];

function getCompiledOutputPath(filePath) {
    const baseName = path.basename(filePath, path.extname(filePath));
    const ext = process.platform === 'win32' ? '.exe' : '';
    return path.join(os.tmpdir(), 'colon-runner', `${baseName}${ext}`);
}

function getPathKey(env = process.env) {
    return Object.keys(env).find(key => key.toLowerCase() === 'path') || (process.platform === 'win32' ? 'Path' : 'PATH');
}

function splitPathValue(value) {
    return String(value || '')
        .split(path.delimiter)
        .map(entry => entry.trim())
        .filter(Boolean);
}

function uniquePathEntries(entries) {
    const seen = new Set();
    const out = [];

    for (const entry of entries) {
        if (!entry) continue;
        const normalized = process.platform === 'win32' ? entry.toLowerCase() : entry;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(entry);
    }

    return out;
}

function addExistingDir(entries, dirPath) {
    if (!dirPath) return;
    try {
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
            entries.push(dirPath);
        }
    } catch {
        /* ignore inaccessible folders */
    }
}

function addDirAndScripts(entries, dirPath) {
    addExistingDir(entries, dirPath);
    addExistingDir(entries, path.join(dirPath, 'Scripts'));
    addExistingDir(entries, path.join(dirPath, 'bin'));
}

function addMatchingChildDirs(entries, parent, predicate, mapper = child => child) {
    if (!parent) return;
    try {
        if (!fs.existsSync(parent)) return;
        for (const item of fs.readdirSync(parent, { withFileTypes: true })) {
            if (item.isDirectory() && predicate(item.name)) {
                const mapped = mapper(path.join(parent, item.name), item.name);
                if (Array.isArray(mapped)) {
                    mapped.forEach(dir => addExistingDir(entries, dir));
                } else {
                    addExistingDir(entries, mapped);
                }
            }
        }
    } catch {
        /* ignore inaccessible folders */
    }
}

function getCommonRuntimeDirs() {
    const entries = [];
    const home = os.homedir();

    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        const programFiles = [
            process.env.ProgramFiles,
            process.env['ProgramFiles(x86)'],
            process.env.ProgramW6432
        ].filter(Boolean);

        addExistingDir(entries, path.join(localAppData, 'Microsoft', 'WindowsApps'));
        addExistingDir(entries, path.join(localAppData, 'Microsoft', 'WinGet', 'Links'));
        addExistingDir(entries, path.join(appData, 'npm'));
        addExistingDir(entries, path.join(home, '.cargo', 'bin'));
        addExistingDir(entries, path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'));

        for (const pf of programFiles) {
            addExistingDir(entries, path.join(pf, 'nodejs'));
            addExistingDir(entries, path.join(pf, 'Go', 'bin'));
            addExistingDir(entries, path.join(pf, 'LLVM', 'bin'));
            addExistingDir(entries, path.join(pf, 'PHP'));

            addMatchingChildDirs(entries, pf, name => /^Python\d+/i.test(name), dir => [dir, path.join(dir, 'Scripts')]);
            addMatchingChildDirs(entries, pf, name => /^(Microsoft|Eclipse|Adoptium|Java|OpenJDK)/i.test(name), dir => path.join(dir, 'bin'));
            addMatchingChildDirs(entries, path.join(pf, 'Microsoft'), name => /^jdk/i.test(name), dir => path.join(dir, 'bin'));
            addMatchingChildDirs(entries, path.join(pf, 'Java'), name => /^jdk/i.test(name), dir => path.join(dir, 'bin'));
            addMatchingChildDirs(entries, path.join(pf, 'Eclipse Adoptium'), name => /^jdk/i.test(name), dir => path.join(dir, 'bin'));
        }

        addMatchingChildDirs(entries, path.join(localAppData, 'Programs', 'Python'), name => /^Python\d+/i.test(name), dir => [dir, path.join(dir, 'Scripts')]);
        addMatchingChildDirs(entries, 'C:\\', name => /^Python\d+/i.test(name), dir => [dir, path.join(dir, 'Scripts')]);
        addMatchingChildDirs(entries, 'C:\\', name => /^Ruby\d+/i.test(name), dir => path.join(dir, 'bin'));
        addMatchingChildDirs(entries, 'C:\\', name => /^Go$/i.test(name), dir => path.join(dir, 'bin'));
        addMatchingChildDirs(entries, 'C:\\', name => /^PHP/i.test(name), dir => dir);

        // WinLibs GCC installed by winget or manually
        addExistingDir(entries, 'C:\\msys64\\ucrt64\\bin');
        addExistingDir(entries, 'C:\\msys64\\mingw64\\bin');
        addExistingDir(entries, 'C:\\msys64\\usr\\bin');
        addMatchingChildDirs(entries, localAppData, name => /^(WinLibs|mingw|winlibs)/i.test(name), dir => {
            const ucrt64 = path.join(dir, 'ucrt64', 'bin');
            const mingw64 = path.join(dir, 'mingw64', 'bin');
            const bin = path.join(dir, 'bin');
            return [ucrt64, mingw64, bin];
        });
        addMatchingChildDirs(entries, 'C:\\', name => /^(mingw|winlibs)/i.test(name), dir => {
            const ucrt64 = path.join(dir, 'ucrt64', 'bin');
            const mingw64 = path.join(dir, 'mingw64', 'bin');
            const bin = path.join(dir, 'bin');
            return [ucrt64, mingw64, bin];
        });

        // Per-user programs installed by winget
        addExistingDir(entries, path.join(localAppData, 'Programs'));
        addExistingDir(entries, path.join(home, 'go', 'bin'));
        addExistingDir(entries, path.join(home, '.rustup', 'toolchains'));
    } else {
        addExistingDir(entries, '/usr/local/bin');
        addExistingDir(entries, '/usr/bin');
        addExistingDir(entries, '/bin');
        addExistingDir(entries, '/snap/bin');
        addExistingDir(entries, '/usr/local/go/bin');
        addExistingDir(entries, '/opt/homebrew/bin');
        addExistingDir(entries, '/opt/homebrew/opt/openjdk/bin');
        addExistingDir(entries, '/Library/Java/JavaVirtualMachines/openjdk.jdk/Contents/Home/bin');
        addExistingDir(entries, path.join(home, '.cargo', 'bin'));
        addExistingDir(entries, path.join(home, '.local', 'bin'));
        addExistingDir(entries, path.join(home, 'go', 'bin'));
    }

    return entries;
}

function getWindowsRegistryPath() {
    if (process.platform !== 'win32') return Promise.resolve('');

    const script = [
        "$machine=[Environment]::GetEnvironmentVariable('Path','Machine')",
        "$user=[Environment]::GetEnvironmentVariable('Path','User')",
        "[Console]::Out.Write(($machine + ';' + $user))"
    ].join(';');

    return new Promise((resolve) => {
        try {
            execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
                timeout: 4000,
                windowsHide: true
            }, (error, stdout) => {
                resolve(error ? '' : stdout);
            });
        } catch {
            resolve('');
        }
    });
}

async function createRuntimeEnv() {
    const env = { ...process.env };
    const pathKey = getPathKey(env);
    const registryPath = await getWindowsRegistryPath();
    const pathEntries = uniquePathEntries([
        ...splitPathValue(env[pathKey]),
        ...splitPathValue(registryPath),
        ...getCommonRuntimeDirs()
    ]);
    const pathValue = pathEntries.join(path.delimiter);

    env[pathKey] = pathValue;
    env.PATH = pathValue;
    if (process.platform === 'win32') env.Path = pathValue;

    return { env, pathEntries, pathValue };
}

function applyRuntimePathToProcess(pathValue) {
    if (!pathValue) return;
    const pathKey = getPathKey(process.env);
    process.env[pathKey] = pathValue;
    process.env.PATH = pathValue;
    if (process.platform === 'win32') process.env.Path = pathValue;
}

function getPathExtensions() {
    if (process.platform !== 'win32') return [''];
    const pathext = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
        .split(';')
        .map(ext => ext.toLowerCase())
        .filter(Boolean);
    // Prefer Windows executable wrappers before extensionless npm shims.
    // Global npm packages create both `tool` and `tool.cmd`; the extensionless
    // file is a POSIX shell script and cannot be execFile'd directly on Windows.
    return [...pathext, ''];
}

function commandHasPath(command) {
    return command.includes('/') || command.includes('\\') || path.isAbsolute(command);
}

function resolveExecutable(command, env = process.env) {
    const pathKey = getPathKey(env);
    const pathEntries = splitPathValue(env[pathKey] || env.PATH || env.Path);
    const extensions = getPathExtensions();
    const candidates = [];

    if (commandHasPath(command)) {
        candidates.push(command);
    } else {
        for (const entry of pathEntries) {
            candidates.push(path.join(entry, command));
        }
    }

    for (const candidate of candidates) {
        const ext = path.extname(candidate).toLowerCase();
        const names = process.platform === 'win32' && !ext
            ? extensions.map(suffix => `${candidate}${suffix}`)
            : [candidate];

        for (const name of names) {
            try {
                if (fs.existsSync(name) && fs.statSync(name).isFile()) {
                    return name;
                }
            } catch {
                /* continue */
            }
        }
    }

    return null;
}

function quoteCmdArg(value) {
    const text = String(value);
    return `"${text.replace(/"/g, '\\"')}"`;
}

function quotePosixArg(value) {
    const text = String(value);
    return `'${text.replace(/'/g, `'\\''`)}'`;
}

function quotePowerShellString(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteShellArg(value) {
    return process.platform === 'win32' ? quoteCmdArg(value) : quotePosixArg(value);
}

function shellToken(value) {
    const text = String(value);
    return /^[A-Za-z0-9_.$-]+$/.test(text) ? text : quoteShellArg(text);
}

function buildShellCommand(executable, args = []) {
    return [quoteShellArg(executable), ...args.map(arg => shellToken(arg))].join(' ');
}

function buildCmdLine(executable, args = []) {
    return [quoteCmdArg(executable), ...args.map(quoteCmdArg)].join(' ');
}

function buildElevatedWindowsCommand(candidate, runtimeEnv) {
    const executable = resolveExecutable(candidate.packageManagerCommand, runtimeEnv.env) || candidate.packageManagerCommand;
    const argumentList = (candidate.packageArgs || [])
        .map(arg => quotePowerShellString(arg))
        .join(', ');
    // Return raw PowerShell script — getInstallShellConfig already wraps in powershell.exe -Command
    return [
        `$p = Start-Process -FilePath ${quotePowerShellString(executable)} -ArgumentList @(${argumentList}) -Verb RunAs -Wait -PassThru`,
        'if ($null -ne $p.ExitCode) { exit $p.ExitCode }'
    ].join('; ');
}

function execFileCompat(executable, args, options, callback) {
    const ext = path.extname(executable).toLowerCase();
    if (process.platform === 'win32' && (ext === '.cmd' || ext === '.bat')) {
        return exec(`call ${buildCmdLine(executable, args)}`, options, callback);
    }
    return execFile(executable, args, options, callback);
}

function runResolvedExecutable(executable, args, env, timeout = 5000) {
    return new Promise((resolve) => {
        try {
            execFileCompat(executable, args, {
                env,
                timeout,
                windowsHide: true
            }, (error, stdout, stderr) => {
                if (error) {
                    resolve(null);
                    return;
                }
                resolve(`${stdout || ''}${stderr || ''}`);
            });
        } catch {
            resolve(null);
        }
    });
}

function normalizeProbe(runtime, probe) {
    if (typeof probe === 'string') {
        return {
            command: probe,
            versionArgs: runtime.versionFlag ? [runtime.versionFlag] : ['--version'],
            shellArgs: []
        };
    }

    return {
        command: probe.command,
        versionArgs: probe.versionArgs || (runtime.versionFlag ? [runtime.versionFlag] : ['--version']),
        shellArgs: probe.shellArgs || []
    };
}

function getRuntimeProbes(runtime) {
    return (runtime.probes || runtime.commands || []).map(probe => normalizeProbe(runtime, probe));
}

async function detectTool(tool, runtimeEnv) {
    const executable = resolveExecutable(tool.command, runtimeEnv.env);
    if (!executable) return null;

    if (tool.versionArgs) {
        const output = await runResolvedExecutable(executable, tool.versionArgs, runtimeEnv.env);
        if (!output) return null;
    }

    return {
        path: executable,
        command: buildShellCommand(executable, tool.shellArgs || []),
        executable
    };
}

function getRunPathEntries(executable, tools = {}) {
    const entries = [];
    addExistingDir(entries, path.dirname(executable));

    for (const tool of Object.values(tools)) {
        if (tool?.path) addExistingDir(entries, path.dirname(tool.path));
    }

    return uniquePathEntries([...entries, ...getCommonRuntimeDirs()]);
}

async function detectRuntime(runtime, runtimeEnv) {
    const missingTools = [];

    for (const probe of getRuntimeProbes(runtime)) {
        const executable = resolveExecutable(probe.command, runtimeEnv.env);
        if (!executable) continue;

        const output = await runResolvedExecutable(executable, probe.versionArgs, runtimeEnv.env);
        if (!output) continue;

        const tools = {
            [runtime.id]: {
                path: executable,
                command: buildShellCommand(executable, probe.shellArgs),
                executable
            }
        };

        let requiredOk = true;
        for (const tool of runtime.requiredTools || []) {
            const detectedTool = await detectTool(tool, runtimeEnv);
            if (!detectedTool) {
                requiredOk = false;
                missingTools.push(tool.name || tool.command);
                break;
            }
            tools[tool.name || tool.command] = detectedTool;
        }

        if (!requiredOk) continue;

        const version = runtime.parseVersion(output);
        return {
            id: runtime.id,
            name: runtime.name,
            installed: true,
            version: version || 'unknown',
            path: executable,
            command: buildShellCommand(executable, probe.shellArgs),
            executable,
            tools,
            extensions: runtime.extensions,
            installCmd: runtime.installCmd[process.platform] || null,
            pathEntries: getRunPathEntries(executable, tools)
        };
    }

    return {
        id: runtime.id,
        name: runtime.name,
        installed: false,
        version: null,
        path: null,
        command: getRuntimeProbes(runtime)[0]?.command || '',
        executable: null,
        tools: {},
        extensions: runtime.extensions,
        installCmd: runtime.installCmd[process.platform] || null,
        pathEntries: runtimeEnv.pathEntries,
        reason: missingTools.length ? `Missing required tool: ${missingTools.join(', ')}` : null
    };
}

function getRuntimeInstallers(runtime) {
    if (process.platform === 'win32' && WINDOWS_RUNTIME_INSTALLERS[runtime.id]) {
        return WINDOWS_RUNTIME_INSTALLERS[runtime.id];
    }

    const command = runtime.installCmd?.[process.platform] || null;
    if (!command) return [];

    return [{
        id: `${process.platform}:default`,
        manager: process.platform === 'darwin' ? 'Homebrew' : 'System package manager',
        command,
        requirements: runtime.installPrerequisites?.[process.platform] || [],
        validExitCodes: [0]
    }];
}

async function isWindowsElevated(runtimeEnv) {
    if (process.platform !== 'win32') return false;
    if (typeof runtimeEnv.isElevated === 'boolean') return runtimeEnv.isElevated;
    const net = resolveExecutable('net.exe', runtimeEnv.env) || resolveExecutable('net', runtimeEnv.env);
    if (!net) {
        runtimeEnv.isElevated = false;
        return false;
    }
    const output = await runResolvedExecutable(net, ['session'], runtimeEnv.env, 4000);
    runtimeEnv.isElevated = !!output;
    return runtimeEnv.isElevated;
}

async function checkInstallerRequirements(requirements = [], environments = {}, runtimeEnv) {
    const missing = [];
    const details = [];

    for (const requirement of requirements) {
        if (requirement.runtimeId) {
            if (!environments[requirement.runtimeId]?.installed) {
                missing.push(requirement.name || requirement.runtimeId);
                details.push(`${requirement.name || requirement.runtimeId} is not installed`);
            }
            continue;
        }

        if (!requirement.command) continue;

        const cacheKey = `${requirement.command} ${(requirement.args || []).join(' ')}`.trim();
        runtimeEnv.installerCheckCache = runtimeEnv.installerCheckCache || {};
        if (runtimeEnv.installerCheckCache[cacheKey]) {
            const cached = runtimeEnv.installerCheckCache[cacheKey];
            if (!cached.ok) {
                missing.push(cached.name);
                details.push(cached.detail);
            }
            continue;
        }

        const executable = resolveExecutable(requirement.command, runtimeEnv.env);
        if (!executable) {
            missing.push(requirement.name || requirement.command);
            details.push(`${requirement.name || requirement.command} was not found`);
            runtimeEnv.installerCheckCache[cacheKey] = {
                ok: false,
                name: requirement.name || requirement.command,
                detail: `${requirement.name || requirement.command} was not found`
            };
            continue;
        }

        if (requirement.args?.length) {
            const output = await runResolvedExecutable(executable, requirement.args, runtimeEnv.env, 6000);
            if (!output) {
                missing.push(requirement.name || requirement.command);
                details.push(`${requirement.name || requirement.command} was found but could not be run`);
                runtimeEnv.installerCheckCache[cacheKey] = {
                    ok: false,
                    name: requirement.name || requirement.command,
                    detail: `${requirement.name || requirement.command} was found but could not be run`
                };
                continue;
            }
        }

        runtimeEnv.installerCheckCache[cacheKey] = { ok: true };
    }

    return {
        ok: missing.length === 0,
        missing,
        details,
        reason: missing.length
            ? `Missing or broken prerequisite${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`
            : null
    };
}

async function getRuntimeInstallPlan(runtime, environments = {}, runtimeEnvArg = null) {
    const runtimeEnv = runtimeEnvArg || await createRuntimeEnv();
    const installers = getRuntimeInstallers(runtime);
    const rejected = [];
    const elevated = process.platform === 'win32' ? await isWindowsElevated(runtimeEnv) : false;

    for (const installer of installers) {
        const prereq = await checkInstallerRequirements(installer.requirements, environments, runtimeEnv);
        if (!prereq.ok) {
            rejected.push(`${installer.manager}: ${prereq.details.join('; ') || prereq.reason}`);
            continue;
        }

        const needsElevation = !!installer.requiresElevation && process.platform === 'win32' && !elevated;
        const command = needsElevation
            ? buildElevatedWindowsCommand(installer, runtimeEnv)
            : installer.command;

        return {
            ok: true,
            runtimeId: runtime.id,
            manager: needsElevation ? `${installer.manager} (UAC)` : installer.manager,
            command,
            displayCommand: installer.command,
            requiresElevation: needsElevation,
            validExitCodes: installer.validExitCodes || [0],
            rejected
        };
    }

    const reason = installers.length
        ? `No supported installer is available. ${rejected.join(' | ')}`
        : `No install command is configured for ${runtime.name} on ${process.platform}.`;

    return {
        ok: false,
        runtimeId: runtime.id,
        reason,
        rejected
    };
}

/** Scan all runtimes */
async function scanEnvironments() {
    const runtimeEnv = await createRuntimeEnv();
    applyRuntimePathToProcess(runtimeEnv.pathValue);

    const results = {};
    for (const runtime of RUNTIMES) {
        results[runtime.id] = await detectRuntime(runtime, runtimeEnv);
    }

    for (const runtime of RUNTIMES) {
        if (results[runtime.id]?.installed) continue;
        const installPlan = await getRuntimeInstallPlan(runtime, results, runtimeEnv);
        results[runtime.id].installCmd = installPlan.ok ? installPlan.displayCommand : null;
        results[runtime.id].installManager = installPlan.ok ? installPlan.manager : null;
        results[runtime.id].installError = installPlan.ok ? null : installPlan.reason;
        results[runtime.id].installRequiresElevation = !!installPlan.requiresElevation;
    }

    return results;
}

async function checkRuntimeInstallerPrerequisites(runtime, environments = {}) {
    const runtimeEnv = await createRuntimeEnv();
    const installPlan = await getRuntimeInstallPlan(runtime, environments, runtimeEnv);
    return installPlan.ok
        ? { ok: true, missing: [], installPlan }
        : { ok: false, missing: [], reason: installPlan.reason, installPlan };
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

function getPathPrefix(pathEntries = []) {
    const entries = uniquePathEntries(pathEntries).filter(Boolean);
    if (!entries.length) return '';

    if (process.platform === 'win32') {
        return `set "PATH=${entries.join(';')};%PATH%" && `;
    }

    return `export PATH=${quotePosixArg(entries.join(':'))}:$PATH; `;
}

/** Build the shell command to run a file */
function buildRunCommand(runtimeId, envInfoOrCommand, filePath) {
    const runtime = RUNTIMES.find(r => r.id === runtimeId);
    if (!runtime) return null;

    const outDir = path.join(os.tmpdir(), 'colon-runner');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const envInfo = typeof envInfoOrCommand === 'string'
        ? { command: envInfoOrCommand, tools: {}, pathEntries: [] }
        : envInfoOrCommand;

    const command = runtime.runTemplate(envInfo, filePath);
    return `${getPathPrefix(envInfo.pathEntries)}${command}`;
}

module.exports = {
    scanEnvironments,
    getRuntimeForExtension,
    buildRunCommand,
    RUNTIMES,
    createRuntimeEnv,
    resolveExecutable,
    checkRuntimeInstallerPrerequisites,
    getRuntimeInstallPlan
};
