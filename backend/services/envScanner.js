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
const chocoInstall = (id) => `choco install ${id} -y --no-progress --force`;

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
    packageArgs: ['install', packageId, '-y', '--no-progress', '--force'],
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

        // WinGet Links first — winget symlinks installed binaries here
        addExistingDir(entries, path.join(localAppData, 'Microsoft', 'WinGet', 'Links'));
        // npm global bin
        addExistingDir(entries, path.join(appData, 'npm'));
        addExistingDir(entries, path.join(home, '.cargo', 'bin'));
        addExistingDir(entries, path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'));

        for (const pf of programFiles) {
            addExistingDir(entries, path.join(pf, 'nodejs'));
            addExistingDir(entries, path.join(pf, 'Go', 'bin'));
            addExistingDir(entries, path.join(pf, 'LLVM', 'bin'));
            addExistingDir(entries, path.join(pf, 'PHP'));

            // Python installed via winget/MSI to Program Files
            addMatchingChildDirs(entries, pf, name => /^Python/i.test(name), dir => [dir, path.join(dir, 'Scripts')]);
            // JDK installed via winget
            addMatchingChildDirs(entries, pf, name => /^(Microsoft|Eclipse|Adoptium|Java|OpenJDK)/i.test(name), dir => path.join(dir, 'bin'));
            addMatchingChildDirs(entries, path.join(pf, 'Microsoft'), name => /^jdk/i.test(name), dir => path.join(dir, 'bin'));
            addMatchingChildDirs(entries, path.join(pf, 'Java'), name => /^jdk/i.test(name), dir => path.join(dir, 'bin'));
            addMatchingChildDirs(entries, path.join(pf, 'Eclipse Adoptium'), name => /^jdk/i.test(name), dir => path.join(dir, 'bin'));
        }

        // Python installed to user-local Programs (common winget/MSI location)
        addMatchingChildDirs(entries, path.join(localAppData, 'Programs', 'Python'), name => /^Python/i.test(name), dir => [dir, path.join(dir, 'Scripts')]);
        // Python installed directly to C:\
        addMatchingChildDirs(entries, 'C:\\', name => /^Python/i.test(name), dir => {
            // Only include if it has a real python binary, not orphaned dirs
            const exePath = path.join(dir, 'python.exe');
            try { if (fs.existsSync(exePath)) return [dir, path.join(dir, 'Scripts')]; } catch { /* ignore */ }
            return [];
        });
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

        // WinGet packages installed to per-user Programs
        addExistingDir(entries, path.join(localAppData, 'Programs'));
        // Also search WinGet package install directories directly
        addMatchingChildDirs(entries, path.join(localAppData, 'Microsoft', 'WinGet', 'Packages'), () => true, dir => {
            // WinGet extracts some packages here; look for bin subdirectories
            addExistingDir(entries, dir);
            addExistingDir(entries, path.join(dir, 'bin'));
            return [];
        });
        addExistingDir(entries, path.join(home, 'go', 'bin'));
        addExistingDir(entries, path.join(home, '.rustup', 'toolchains'));
        // Rustup default toolchain bin
        addMatchingChildDirs(entries, path.join(home, '.rustup', 'toolchains'), () => true, dir => path.join(dir, 'bin'));

        // WindowsApps last — these often contain Store alias stubs, real entries above are preferred
        addExistingDir(entries, path.join(localAppData, 'Microsoft', 'WindowsApps'));
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

/**
 * Check if a file is a Windows Store "App Execution Alias" stub.
 * These are reparse-point files in the WindowsApps directory
 * that redirect to the Microsoft Store instead of running the program.
 * They look like real executables to fs.existsSync but fail at runtime.
 *
 * Detection strategies:
 *  1. Files in WindowsApps that are 0 bytes (classic stub)
 *  2. Files in WindowsApps that throw EACCES on stat (UWP app aliases)
 *  3. Files in WindowsApps with the reparse-point attribute
 */
function isWindowsStoreStub(filePath) {
    if (process.platform !== 'win32') return false;
    try {
        const normalized = filePath.toLowerCase();
        if (!normalized.includes('windowsapps')) return false;
        try {
            const stat = fs.statSync(filePath);
            // App Execution Aliases are 0-byte files
            // Very small files (<1KB) in WindowsApps that aren't .dll/.sys are also suspicious
            // Real executables are at minimum several KB
            return stat.size === 0 || (stat.size < 1024 && /\.(exe)$/i.test(filePath));
        } catch (statErr) {
            // EACCES / EPERM on stat in WindowsApps means it's a reparse-point stub
            return true; // Any stat error on a WindowsApps path — treat as unusable
        }
    } catch {
        return false;
    }
}

/**
 * Check if a candidate file is a valid, real executable.
 * Returns true if the file exists, is a regular file, and is not a store stub.
 */
function isValidExecutable(filePath) {
    try {
        // First check if it's in WindowsApps (fast path for known stubs)
        if (isWindowsStoreStub(filePath)) return false;
        const stat = fs.statSync(filePath);
        return stat.isFile();
    } catch (err) {
        // EACCES/EPERM — we can't verify, skip this candidate
        return false;
    }
}

/**
 * Fall back to the system's `where.exe` (Windows) or `which` (Unix) command
 * to find an executable. This catches cases where the filesystem scan fails
 * (e.g., due to EACCES on WindowsApps) but the shell can still resolve the
 * command via its own PATH handling.
 *
 * For WindowsApps candidates, we can't use stat (EACCES), so we actually
 * try to run the executable with a benign flag to verify it's real and not
 * a Microsoft Store redirect stub.
 */
function resolveExecutableViaShell(command) {
    try {
        const finder = process.platform === 'win32' ? 'where.exe' : 'which';
        const result = require('child_process').execFileSync(finder, [command], {
            timeout: 4000,
            windowsHide: true,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe']
        }).toString().trim();

        // `where.exe` can return multiple lines (one per match). Try each.
        const lines = result.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
            const candidate = line.trim();
            if (!candidate) continue;

            const isInWindowsApps = candidate.toLowerCase().includes('windowsapps');

            if (isInWindowsApps) {
                // Can't stat WindowsApps files (EACCES). Instead, try to
                // execute the candidate with --version or --help to verify
                // it's a real executable and not a Store redirect stub.
                try {
                    require('child_process').execFileSync(candidate, ['--version'], {
                        timeout: 4000,
                        windowsHide: true,
                        stdio: ['pipe', 'pipe', 'pipe']
                    });
                    // Ran successfully — it's a real executable
                    return candidate;
                } catch (runErr) {
                    // Check stderr/stdout for the "not found" Store redirect message
                    const errMsg = (runErr.stderr || '').toString() + (runErr.stdout || '').toString();
                    if (errMsg.includes('Microsoft Store') || errMsg.includes('not found')) {
                        // It's a Store alias stub — skip
                        continue;
                    }
                    // Some tools exit non-zero for --version but still work (e.g., some
                    // tools use --help instead). If we got ANY output, it's likely real.
                    if (errMsg.trim().length > 0) {
                        return candidate;
                    }
                    continue;
                }
            }

            // Non-WindowsApps candidate: verify it's a real file
            try {
                const stat = fs.statSync(candidate);
                if (stat.isFile() && stat.size > 0) {
                    return candidate;
                }
            } catch {
                continue;
            }
        }
    } catch {
        // `where`/`which` failed — command genuinely not found
    }
    return null;
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
            if (isValidExecutable(name)) {
                return name;
            }
        }
    }

    // Fallback: Ask the OS shell to find the command.
    // This catches executables that are accessible via the system PATH
    // but not via the PATH we constructed (e.g., freshly installed runtimes
    // whose PATH entries haven't propagated to Electron yet).
    if (!commandHasPath(command)) {
        const shellResolved = resolveExecutableViaShell(command);
        if (shellResolved) return shellResolved;
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
                    // Log for debugging, but distinguish "not found" from "found but crashed"
                    const combined = `${stdout || ''}${stderr || ''}`;
                    // Some tools (e.g. javac -version) print version to stderr and exit 0,
                    // but others print to stderr and exit non-zero. Check if we got version info.
                    if (combined.trim().length > 0) {
                        // Got output despite error code — likely just a non-zero exit for --version
                        resolve(combined);
                        return;
                    }
                    console.log(`[envScanner] runResolvedExecutable failed for ${executable}: ${error.message}`);
                    resolve(null);
                    return;
                }
                resolve(`${stdout || ''}${stderr || ''}`);
            });
        } catch (err) {
            console.log(`[envScanner] runResolvedExecutable threw for ${executable}: ${err.message}`);
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

function findBrokenPythonInstallReason(runtimeEnv) {
    if (process.platform !== 'win32') return null;

    const dirs = [];
    for (const entry of runtimeEnv.pathEntries || []) {
        if (/\\Python\d+\\?$/i.test(entry) || /\\Programs\\Python\\Python\d+\\?$/i.test(entry)) {
            dirs.push(entry);
        }
    }

    const localPythonRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Python');
    addMatchingChildDirs(dirs, localPythonRoot, name => /^Python/i.test(name));
    addMatchingChildDirs(dirs, 'C:\\', name => /^Python\d+/i.test(name));

    for (const dir of uniquePathEntries(dirs)) {
        try {
            if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
            const hasPythonExe = fs.existsSync(path.join(dir, 'python.exe'));
            const hasInstallShape = fs.existsSync(path.join(dir, 'Lib'))
                || fs.existsSync(path.join(dir, 'Scripts'))
                || fs.readdirSync(dir).some(name => /^python.*\.dll$/i.test(name));

            if (!hasPythonExe && hasInstallShape) {
                return `Python appears partially installed at ${dir}, but python.exe is missing. Run install again to repair the Chocolatey/Python install.`;
            }
        } catch {
            /* keep scanning */
        }
    }

    return null;
}

function findBrokenInstallReason(runtime, runtimeEnv) {
    if (runtime.id === 'python') {
        return findBrokenPythonInstallReason(runtimeEnv);
    }

    return null;
}

async function detectRuntime(runtime, runtimeEnv) {
    const missingTools = [];
    const probes = getRuntimeProbes(runtime);

    for (const probe of probes) {
        // Step 1: Resolve the executable via filesystem + shell fallback
        const executable = resolveExecutable(probe.command, runtimeEnv.env);
        if (!executable) {
            console.log(`[envScanner] ${runtime.id}: probe "${probe.command}" — not found`);
            continue;
        }

        // Step 2: Actually execute the probe to verify the binary is real and works
        const output = await runResolvedExecutable(executable, probe.versionArgs, runtimeEnv.env);
        if (!output) {
            console.log(`[envScanner] ${runtime.id}: probe "${probe.command}" at ${executable} — failed to execute (possibly a store stub or broken install)`);
            continue;
        }

        // Step 3: Verify version can be parsed (sanity check)
        const version = runtime.parseVersion(output);
        if (!version) {
            console.log(`[envScanner] ${runtime.id}: probe "${probe.command}" at ${executable} — got output but could not parse version from: ${output.slice(0, 100)}`);
            // Don't skip — still consider it installed with version 'unknown'
        }

        const tools = {
            [runtime.id]: {
                path: executable,
                command: buildShellCommand(executable, probe.shellArgs),
                executable
            }
        };

        // Step 4: Check required companion tools (e.g., Java needs both javac + java)
        let requiredOk = true;
        for (const tool of runtime.requiredTools || []) {
            const detectedTool = await detectTool(tool, runtimeEnv);
            if (!detectedTool) {
                requiredOk = false;
                missingTools.push(tool.name || tool.command);
                console.log(`[envScanner] ${runtime.id}: required tool "${tool.name || tool.command}" not found`);
                break;
            }
            tools[tool.name || tool.command] = detectedTool;
        }

        if (!requiredOk) continue;

        console.log(`[envScanner] ✓ ${runtime.id}: detected v${version || 'unknown'} at ${executable}`);
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

    const reason = missingTools.length
        ? `Missing required tool: ${missingTools.join(', ')}`
        : findBrokenInstallReason(runtime, runtimeEnv);
    console.log(`[envScanner] ✗ ${runtime.id}: not detected${reason ? ` (${reason})` : ''}`);

    return {
        id: runtime.id,
        name: runtime.name,
        installed: false,
        version: null,
        path: null,
        command: probes[0]?.command || '',
        executable: null,
        tools: {},
        extensions: runtime.extensions,
        installCmd: runtime.installCmd[process.platform] || null,
        pathEntries: runtimeEnv.pathEntries,
        reason
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
    runtimeEnv.isElevated = Boolean(output);
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

        const needsElevation = Boolean(installer.requiresElevation) && process.platform === 'win32' && !elevated;
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
    console.log('[envScanner] Starting full environment scan...');

    // Always rebuild the runtime env from scratch:
    // - Re-reads the Windows Registry PATH (catches freshly installed runtimes)
    // - Re-scans common install directories
    // - Merges with current process.env PATH
    const runtimeEnv = await createRuntimeEnv();
    applyRuntimePathToProcess(runtimeEnv.pathValue);

    console.log(`[envScanner] PATH has ${runtimeEnv.pathEntries.length} entries`);

    const results = {};
    for (const runtime of RUNTIMES) {
        try {
            results[runtime.id] = await detectRuntime(runtime, runtimeEnv);
        } catch (err) {
            console.error(`[envScanner] Error detecting ${runtime.id}:`, err.message);
            results[runtime.id] = {
                id: runtime.id,
                name: runtime.name,
                installed: false,
                version: null,
                path: null,
                command: '',
                executable: null,
                tools: {},
                extensions: runtime.extensions,
                installCmd: runtime.installCmd[process.platform] || null,
                pathEntries: runtimeEnv.pathEntries,
                reason: `Detection error: ${err.message}`
            };
        }
    }

    for (const runtime of RUNTIMES) {
        if (results[runtime.id]?.installed) continue;
        try {
            const installPlan = await getRuntimeInstallPlan(runtime, results, runtimeEnv);
            results[runtime.id].installCmd = installPlan.ok ? installPlan.displayCommand : null;
            results[runtime.id].installManager = installPlan.ok ? installPlan.manager : null;
            results[runtime.id].installError = installPlan.ok ? null : installPlan.reason;
            results[runtime.id].installRequiresElevation = Boolean(installPlan.requiresElevation);
        } catch (err) {
            console.error(`[envScanner] Error getting install plan for ${runtime.id}:`, err.message);
        }
    }

    const summary = Object.keys(results)
        .map(k => `${k}: ${results[k].installed ? '✓' : '✗'}`)
        .join(', ');
    console.log(`[envScanner] Scan complete: ${summary}`);

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
