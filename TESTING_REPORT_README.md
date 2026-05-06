# Testing Report

Date tested: 2026-05-06  
Project: Colon IDE / CodeMotion desktop IDE  
Tester: Codex

## Scope

This report covers repository inspection, frontend build/lint/type checks, backend JavaScript syntax checks, npm dependency audits, and a static security review of the Electron IPC, filesystem, terminal, Git, runtime-install, LSP, and animation-generation paths.

No application source code was changed during this test pass.

## Commands Run

| Area | Command | Result |
|---|---|---|
| Frontend lint | `npm.cmd run lint` in `frontend/` | Passed |
| Frontend production build | `npm.cmd run build` in `frontend/` | Passed outside sandbox |
| Frontend TypeScript | `npx.cmd tsc -b --pretty false` in `frontend/` | Failed |
| Frontend TS lint coverage probe | `npx.cmd eslint "src/**/*.{ts,tsx}"` in `frontend/` | Failed: TS/TSX files ignored |
| Backend test script | `npm.cmd test` in `backend/` | Failed: no tests configured |
| Backend JS syntax | `node --check` over backend project JS excluding `node_modules` | Passed |
| Root `test.js` syntax | `node --check test.js` | Passed |
| Frontend audit | `npm.cmd audit --audit-level=low` in `frontend/` | Failed: 50 vulnerabilities |
| Backend audit | `npm.cmd audit --audit-level=low` in `backend/` | Failed: 9 vulnerabilities |

Note: Running `npm` directly in PowerShell initially failed because scripts are disabled for `npm.ps1`. Re-running through `npm.cmd` worked. The frontend build also needed to run outside the sandbox because esbuild process spawning was blocked by sandbox permissions.

## Executive Summary

The frontend can lint and build, and backend project JavaScript parses successfully. However, the project is not test-ready yet: there are no backend tests, no frontend unit/e2e tests, and TypeScript compilation currently fails.

The biggest risks are security-related. The renderer is exposed to broad filesystem, terminal, Git, and runtime-install IPC methods, while the Electron window disables `webSecurity`. A renderer compromise could read, write, delete, rename, run shell commands, manipulate Git history, or install software. There is also a hardcoded Gemini API key in `backend/scratch/test_gemini.js`.

## Critical And High Findings

### 1. Hardcoded API Key In Repository

Severity: Critical  
File: `backend/scratch/test_gemini.js:5`

The file contains a literal Gemini API key:

```js
const apiKey = "AIzaSy..."
```

Impact: Anyone with repo access can use or leak the key. If this repo was pushed publicly, the key should be considered compromised.

Recommendation: Revoke the key immediately, remove it from git history if the repository has been shared, and use `LLM_API_KEY` from `.env` only.

### 2. Electron `webSecurity` Disabled

Severity: High  
File: `backend/main.js:663`

`BrowserWindow` is created with:

```js
webSecurity: false
```

Impact: This disables important Chromium protections. Combined with powerful IPC methods exposed through preload, an XSS or malicious loaded page becomes much more dangerous.

Recommendation: Set `webSecurity: true` or remove the override. Add a strict Content Security Policy and restrict navigation/window opening.

### 3. Broad Filesystem IPC Allows Arbitrary Local File Modification

Severity: High  
Files: `backend/main.js:46`, `backend/main.js:81`, `backend/main.js:91`, `backend/main.js:106`, `backend/main.js:116`, `backend/main.js:126`; exposed in `backend/preload.js:17-23`

The renderer can call filesystem APIs with arbitrary paths:

- `workspace:set`
- `fs:readFile`
- `fs:writeFile`
- `fs:delete`
- `fs:rename`
- `fs:createFile`
- `fs:createDirectory`

Impact: A compromised renderer can read or modify files outside the opened workspace. `fs:delete` supports recursive directory deletion.

Recommendation: Canonicalize paths with `path.resolve`, restrict all filesystem operations to the selected workspace root, reject paths outside that root, and consider moving deletes to the OS trash instead of permanent recursive removal.

### 4. Shell Command Injection Through Git IPC

Severity: High  
Files: `backend/services/gitService.js:5-7`, `backend/main.js:549`, `backend/preload.js:57`, `frontend/src/components/SourceControlPanel/SourceControlPanel.tsx:47`, `frontend/src/components/SourceControlPanel/SourceControlPanel.tsx:63`, `frontend/src/components/SourceControlPanel/SourceControlPanel.tsx:72`

`runGit(command, cwd)` executes:

```js
execPromise(`git ${command}`, { cwd })
```

The command string is passed from the renderer. Commit messages and filenames are interpolated into shell strings.

Impact: A malicious commit message, filename, or renderer call can execute shell commands.

Recommendation: Replace `exec` with `execFile('git', args, { cwd })`. Expose specific IPC methods such as `git:add`, `git:commit`, `git:checkoutFile`, and validate all arguments.

### 5. Unauthenticated LSP WebSocket Can Spawn Local Processes

Severity: High  
Files: `backend/services/lspServer.js:20`, `backend/services/lspServer.js:34-77`, `frontend/src/utils/lspClient.ts:11`

The backend starts a WebSocket server on `ws://localhost:3001` and spawns language servers based on the URL path.

Impact: Any local webpage or process can connect and cause this app to spawn `pyright`, `typescript-language-server`, `gopls`, or `rust-analyzer`. This can be abused for resource exhaustion or unintended interaction with language servers.

Recommendation: Bind explicitly to `127.0.0.1`, require an unguessable session token from preload, validate origin, and rate-limit connections.

### 6. AI-Generated Manim Code Is Executed Locally With Weak Sandboxing

Severity: High  
Files: `backend/services/manimService.js:166`, `backend/services/manimService.js:218`, `backend/services/manimService.js:223`, `backend/services/manimService.js:308`

The app asks an LLM to generate Python code, validates only Python syntax, writes it to disk, then executes it via Manim.

Impact: Syntax validation does not prevent malicious Python from reading files, writing files, making network calls, or spawning processes.

Recommendation: Validate generated Python with an AST allowlist, reject imports other than Manim-safe modules, run rendering in a sandboxed child process/container with restricted filesystem and network access, and set real process timeouts. The `spawn` `timeout` option at `manimService.js:310` does not reliably enforce a kill timer for this usage.

### 7. Dependency Vulnerabilities

Severity: High

Frontend audit found 50 vulnerabilities:

- 3 high
- 47 moderate
- Includes vulnerable `vite`, `dompurify`, `picomatch`, `flatted`, `postcss`, and Monaco-related transitive packages.

Backend audit found 9 vulnerabilities:

- 6 high
- 3 moderate
- Includes vulnerable `electron`, `axios`, `lodash`, `tar`, `picomatch`, `@xmldom/xmldom`, and `follow-redirects`.

Recommendation: Run `npm audit fix` where safe, then plan breaking upgrades separately, especially Electron and Monaco/LSP packages. Re-test build and runtime after upgrades.

## Bugs And Errors

### 1. TypeScript Build Fails

Severity: Medium  
Files: `frontend/src/components/SourceControlPanel/SourceControlPanel.tsx:1`, `frontend/src/components/Workspace/Workspace.tsx:63`

`npx.cmd tsc -b --pretty false` failed with:

```text
SourceControlPanel.tsx(1,23): 'LuBook' is declared but its value is never read.
SourceControlPanel.tsx(1,31): 'LuCheck' is declared but its value is never read.
Workspace.tsx(397,21): Type ... is not assignable to IStandaloneEditorConstructionOptions.
Types of property 'cursorBlinking' are incompatible.
```

Recommendation: Remove unused icon imports and narrow Monaco option string literals, for example by typing `editorOptions` as Monaco editor options or using literal assertions.

### 2. ESLint Does Not Check TS/TSX Files

Severity: Medium  
File: `frontend/eslint.config.js:10`

The lint config only targets:

```js
files: ['**/*.{js,jsx}']
```

Running ESLint directly against TS/TSX files reports that all TS/TSX files are ignored.

Impact: `npm run lint` passes even though TypeScript has errors.

Recommendation: Add TypeScript ESLint support and include `**/*.{ts,tsx}` in the lint configuration.

### 3. Backend Test Script Always Fails

Severity: Medium  
File: `backend/package.json`

`npm.cmd test` outputs:

```text
Error: no test specified
```

Recommendation: Add backend unit tests for `envScanner`, `gitService`, filesystem path guards, animation JSON parsing, Manim validation, and IPC handlers.

### 4. Runtime Scanner Feature Check Was Blocked By Inline Command Quoting

Severity: Low

An ad hoc `node -e` runtime scanner command failed because PowerShell interpreted template syntax before Node received it. This was a tester command issue, not a project syntax error. The module itself was syntax-checked successfully.

## Code Smells And Maintainability Issues

### 1. Oversized `backend/main.js`

Severity: Medium  
File: `backend/main.js`

`main.js` contains window creation, filesystem handlers, search/replace, environment install, code runner command generation, animation IPC, Manim IPC, Git IPC, debugger IPC, terminal PTY management, and window controls.

Impact: High coupling makes security review and testing harder.

Recommendation: Split IPC registration into service modules and keep `main.js` focused on lifecycle and wiring.

### 2. IPC API Exposes Powerful Capabilities Too Directly

Severity: Medium  
File: `backend/preload.js`

The preload exposes broad capabilities directly, including `delete`, `git.run`, terminal input, runtime install, and arbitrary file writing.

Recommendation: Expose narrow task-specific APIs and validate all input on the main-process side.

### 3. Search Regex Can Hang On Empty Regex Matches

Severity: Medium  
File: `backend/main.js:197`

`search:inFiles` loops with:

```js
while ((m = pattern.exec(line)) !== null) { ... }
```

If `useRegex` is enabled and the pattern can match an empty string, such as `.*?` or `^`, `pattern.exec` can repeatedly match without advancing, causing a tight loop.

Recommendation: Reject regexes that match an empty string or manually advance `pattern.lastIndex` when `m[0].length === 0`.

### 4. Logging May Leak Source Code And Sensitive Data

Severity: Medium  
Files: `backend/services/animationGenerator.js:196`, `backend/services/animationGenerator.js:270`, plus multiple debug logs in `backend/main.js` and `frontend/src/App.tsx`

The animation generator logs raw LLM responses and unparseable response bodies. Other logs include file paths and file read activity.

Impact: Logs may contain user source code, algorithm details, file paths, or generated content.

Recommendation: Remove or gate verbose logs behind a debug flag and avoid logging raw source or full LLM responses.

### 5. Runtime Install Commands Execute Shell Scripts And Package Managers

Severity: Medium  
Files: `backend/services/envScanner.js:40`, `backend/services/envScanner.js:166`, `backend/main.js:301`

Install commands include shell pipelines such as `curl | bash`, `sudo apt-get`, `npm install -g`, `brew`, and `winget`.

Impact: This is expected for a language manager, but it is high-risk and should have clear user consent, provenance, logging, cancellation, and no silent auto-answering.

Recommendation: Prefer official installers, checksums/signatures, and per-runtime explicit confirmations. Avoid writing `Y\n` automatically to installers.

### 6. `shell: true` Used For Pip Install

Severity: Medium  
File: `backend/services/animEngineService.js:260-263`

The animation engine installer spawns Python with `shell: true`.

Recommendation: Use `execFile` or `spawn(PYTHON_CMD, ['-m', 'pip', ...], { shell: false })` because no shell features are needed.

## Functional Observations

- Frontend production build succeeds.
- Frontend bundle has a large chunk warning. The largest generated chunk is about 11 MB before gzip, mostly expected from Monaco/editor assets but worth code-splitting.
- Backend project JavaScript syntax checks pass.
- Root `test.js` only reads `backend/main.js` and logs the data type; it is not a meaningful automated test.
- Browser-only frontend mode cannot test Electron-only features such as filesystem, terminal, Git, debug, runtime installation, and Manim rendering.

## Recommended Test Plan

1. Add backend unit tests for path restrictions, Git argument building, regex search edge cases, animation JSON parsing, Manim Python extraction, and runtime detection.
2. Add frontend component tests for file tabs, dirty-state save behavior, source control actions, terminal creation lifecycle, settings persistence, and animation UI states.
3. Add Playwright or Spectron-style Electron smoke tests for opening a workspace, reading/saving a file, running a simple script, search/replace, Git status, terminal input, and LSP connection.
4. Add CI checks for `npm run lint`, `npx tsc -b`, frontend build, backend syntax/unit tests, and `npm audit` thresholds.
5. Add security tests for renderer IPC misuse, path traversal, command injection payloads, regex DoS cases, and malicious LLM-generated Python.

## Priority Fix Order

1. Revoke and remove the hardcoded Gemini API key.
2. Re-enable Electron `webSecurity` and add navigation/CSP restrictions.
3. Restrict filesystem IPC to the selected workspace.
4. Replace shell-based Git execution with argument-based `execFile`.
5. Add authentication/origin protection to the local LSP WebSocket.
6. Sandbox and AST-validate AI-generated Manim code.
7. Fix TypeScript errors and configure ESLint for TS/TSX.
8. Address npm audit vulnerabilities.
9. Add automated backend/frontend/Electron tests.

