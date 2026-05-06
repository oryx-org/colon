/**
 * Code Runner — Executes code files using detected local runtimes.
 * Supports: Python, Node.js, C, C++, Java, Go, Rust, TypeScript
 */

const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Build the run command for a given language  
 * Returns { cmd, args, needsCompile, compileCmd, compileArgs, outputBinary }
 */
function getRunConfig(filePath, runtimeId, runtimeCommand) {
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const outDir = path.join(os.tmpdir(), 'colon-runner');

    // Ensure temp dir exists
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const configs = {
        python: {
            cmd: runtimeCommand || (process.platform === 'win32' ? 'python' : 'python3'),
            args: [filePath],
            needsCompile: false
        },
        node: {
            cmd: runtimeCommand || 'node',
            args: [filePath],
            needsCompile: false
        },
        typescript: {
            cmd: runtimeCommand || 'ts-node',
            args: [filePath],
            needsCompile: false
        },
        gcc: {
            needsCompile: true,
            compileCmd: runtimeCommand || 'gcc',
            compileArgs: [filePath, '-o', path.join(outDir, baseName + (process.platform === 'win32' ? '.exe' : '')), '-lm'],
            cmd: path.join(outDir, baseName + (process.platform === 'win32' ? '.exe' : '')),
            args: [],
            outputFile: path.join(outDir, baseName + (process.platform === 'win32' ? '.exe' : ''))
        },
        gpp: {
            needsCompile: true,
            compileCmd: runtimeCommand || 'g++',
            compileArgs: [filePath, '-o', path.join(outDir, baseName + (process.platform === 'win32' ? '.exe' : '')), '-lstdc++'],
            cmd: path.join(outDir, baseName + (process.platform === 'win32' ? '.exe' : '')),
            args: [],
            outputFile: path.join(outDir, baseName + (process.platform === 'win32' ? '.exe' : ''))
        },
        java: {
            needsCompile: true,
            compileCmd: 'javac',
            compileArgs: [filePath],
            cmd: 'java',
            args: ['-cp', dir, baseName],
            outputFile: path.join(dir, baseName + '.class')
        },
        go: {
            cmd: runtimeCommand || 'go',
            args: ['run', filePath],
            needsCompile: false
        },
        rust: {
            needsCompile: true,
            compileCmd: runtimeCommand || 'rustc',
            compileArgs: [filePath, '-o', path.join(outDir, baseName + (process.platform === 'win32' ? '.exe' : ''))],
            cmd: path.join(outDir, baseName + (process.platform === 'win32' ? '.exe' : '')),
            args: [],
            outputFile: path.join(outDir, baseName + (process.platform === 'win32' ? '.exe' : ''))
        }
    };

    return configs[runtimeId] || null;
}

/**
 * Compile code (for C, C++, Java, Rust)
 * Returns a promise that resolves with { success, error }
 */
function compileCode(compileCmd, compileArgs, cwd) {
    return new Promise((resolve) => {
        const proc = spawn(compileCmd, compileArgs, {
            cwd,
            env: process.env,
            timeout: 30000
        });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, error: null });
            } else {
                resolve({ success: false, error: stderr || `Compilation failed with exit code ${code}` });
            }
        });

        proc.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });
    });
}

/**
 * Run a code file.
 * Sends output via the callback: onOutput(type, data)
 *   type = 'stdout' | 'stderr' | 'exit' | 'error' | 'compile-error'
 * Returns a kill function to terminate the process.
 */
function runCode(filePath, runtimeId, runtimeCommand, onOutput) {
    const config = getRunConfig(filePath, runtimeId, runtimeCommand);

    if (!config) {
        onOutput('error', `No run configuration for runtime: ${runtimeId}`);
        return () => { };
    }

    const cwd = path.dirname(filePath);

    const execute = () => {
        const proc = spawn(config.cmd, config.args, {
            cwd,
            env: process.env,
            timeout: 30000 // 30 second timeout
        });

        proc.stdout.on('data', (data) => {
            onOutput('stdout', data.toString());
        });

        proc.stderr.on('data', (data) => {
            onOutput('stderr', data.toString());
        });

        proc.on('close', (code) => {
            onOutput('exit', `\n[Process exited with code ${code}]\n`);
            if (config.outputFile) {
                fs.unlink(config.outputFile, (err) => {
                    if (err && err.code !== 'ENOENT') {
                        console.warn('Failed to delete compiled artifact:', config.outputFile, err.message);
                    }
                });
            }
        });

        proc.on('error', (err) => {
            onOutput('error', `Failed to start process: ${err.message}`);
            if (config.outputFile) {
                fs.unlink(config.outputFile, () => {});
            }
        });

        return () => {
            try { process.platform === 'win32' ? proc.kill() : proc.kill('SIGTERM'); } catch { }
        };
    };

    // If compilation is needed, compile first
    if (config.needsCompile) {
        onOutput('stdout', `[Compiling ${path.basename(filePath)}...]\n`);

        // Track the active process so the kill function works during compilation (BUG-007)
        let activeKill = null;
        const compileProc = spawn(config.compileCmd, config.compileArgs, {
            cwd,
            env: process.env,
            timeout: 30000
        });
        activeKill = () => {
            try { process.platform === 'win32' ? compileProc.kill() : compileProc.kill('SIGTERM'); } catch { }
        };

        let stderr = '';
        compileProc.stderr.on('data', (d) => { stderr += d.toString(); });

        compileProc.on('close', (code) => {
            if (code !== 0) {
                onOutput('compile-error', stderr || `Compilation failed with exit code ${code}`);
                onOutput('exit', '\n[Compilation failed]\n');
                activeKill = null;
            } else {
                onOutput('stdout', '[Compilation successful. Running...]\n\n');
                activeKill = execute();
            }
        });

        compileProc.on('error', (err) => {
            onOutput('compile-error', err.message);
            onOutput('exit', '\n[Compilation failed]\n');
            activeKill = null;
        });

        // Return a kill function that kills whatever is currently active (compile or run)
        return () => { if (activeKill) activeKill(); };
    } else {
        return execute();
    }
}

module.exports = { runCode, getRunConfig };
