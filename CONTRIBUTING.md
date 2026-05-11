# Contributing to Colon IDE

Thank you for your interest in contributing to Colon IDE! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- **Node.js** 22+ (LTS recommended)
- **npm** 10+
- **Python 3.8+** (for Manim animation testing)
- **Git**

### Getting Started

```bash
# Clone the repository
git clone https://github.com/oryx-org/colon.git
cd colon

# Install dependencies
npm --prefix frontend install
npm --prefix backend install

# Start in development mode
cd backend
npm run dev
```

This launches both the Vite dev server (React HMR) and the Electron window simultaneously.

### Running Tests

```bash
cd backend
npm test
```

All tests must pass before submitting a pull request.

---

## Project Structure

```
colon/
├── frontend/          # React + TypeScript renderer (Vite)
├── backend/           # Electron main process (Node.js)
│   ├── ipc/           # IPC handler modules
│   ├── services/      # Business logic services
│   └── tests/         # Test suite
├── colon-proxy/       # Cloudflare Worker (LLM proxy)
├── docs/              # Project documentation
└── .github/workflows/ # CI/CD pipelines
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

---

## Code Quality Standards

### Backend (Node.js)

- **No `eval()`, `exec()`, or `Function()` constructors** — these are security violations
- **No unused imports** — remove any `require()` calls for modules not used in the file
- **Always clean up resources** — close file handles, kill child processes, clear timeouts
- **Set timeouts on all child processes** — 30s for code execution, 120s for Manim
- **Validate all filesystem paths** via `isPathWithinWorkspace()` before any I/O
- **Use `ipcMain.handle()`** for request/response, `mainWindow.webContents.send()` for events
- **Return cleanup functions** from IPC event listeners in `preload.js`
- **JSDoc comments** on all exported functions

### Frontend (TypeScript/React)

- **Never access Node.js directly** — all system calls go through `window.electronAPI`
- **Check `if (!api) return`** before any Electron API call
- **Use CSS custom properties** from `global.css` — no hardcoded colors
- **Three states for async operations**: idle → loading → success/error
- **Extract hooks** for complex state logic — keep `App.tsx` as a layout shell

### Security

- All LLM-generated scripts must pass through `scriptValidator.js` before execution
- Import allowlist/blocklist must be maintained in both `manimService.js` and `scriptValidator.js`
- The Gemini API key must never be shipped in the Electron binary — use the Cloudflare Worker proxy
- The `.env` file must remain in `.gitignore`

---

## Commit Convention

Use conventional commits:

```
feat: add GIF export from animation videos
fix: resolve terminal crash on Windows with spaces in path
docs: update architecture diagram with LSP flow
test: add security tests for path traversal attacks
refactor: extract animation state to useAnimationState hook
```

---

## Pull Request Process

1. Fork the repository and create a feature branch from `main`
2. Make your changes following the code quality standards above
3. Run `npm test` in `backend/` and ensure all tests pass
4. Run `npm run build` in `frontend/` and ensure it compiles
5. Update documentation if your change affects the public API or architecture
6. Submit a pull request with a clear description of the change

---

## Testing

Tests use Node.js's built-in test runner (`node --test`). Test files live in `backend/tests/`:

| Test File | Coverage |
|-----------|----------|
| `security.test.js` | Filesystem path jail, import security |
| `scriptValidator.test.js` | AST validation, import allowlist/blocklist, dangerous patterns |
| `manimService.test.js` | Module loading, script validation, code runner integration |

When adding new features, add corresponding test coverage.
