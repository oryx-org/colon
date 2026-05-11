# 🎨 Frontend (Renderer) README — React UI

---

## Overview

The frontend is a React + TypeScript application that runs inside Electron's renderer process. It provides the full IDE interface: file explorer, Monaco code editor, animation panel, integrated terminal, search, language manager, command palette, and settings.

---

## Quick Start

```bash
cd frontend
npm install
npm run dev       # Standalone dev server at http://localhost:5173
# OR: Start via Electron (from backend/ folder): npm run dev
```

---

## Folder Structure

```
frontend/src/
├── App.tsx                          # Root component — state management + layout
├── main.tsx                         # React entry point
├── vite-env.d.ts                    # Vite type declarations
│
├── components/
│   ├── AnimationTab/                # Video player + block animations panel
│   │   ├── AnimationTab.tsx
│   │   └── AnimationTab.css
│   ├── CommandPalette/              # Ctrl+Shift+P quick action launcher
│   │   ├── CommandPalette.tsx
│   │   └── CommandPalette.css
│   ├── ExplorerPanel/               # File tree with CRUD (create, rename, delete)
│   │   ├── ExplorerPanel.tsx
│   │   └── ExplorerPanel.css
│   ├── FileIcon/                    # Language-aware file icons
│   │   └── FileIcon.tsx
│   ├── LanguageManagerPanel/        # Runtime detection + one-click install UI
│   │   ├── LanguageManagerPanel.tsx
│   │   └── LanguageManagerPanel.css
│   ├── MenuBar/                     # Custom frameless title bar with menus
│   │   ├── MenuBar.tsx
│   │   └── MenuBar.css
│   ├── RightSidebar/                # Animation tab toggle rail
│   │   ├── RightSidebar.tsx
│   │   └── RightSidebar.css
│   ├── SearchPanel/                 # Full-text search + replace across workspace
│   │   ├── SearchPanel.tsx
│   │   └── SearchPanel.css
│   ├── SettingsModal/               # Editor preferences (font size, theme, format on save)
│   │   ├── SettingsModal.tsx
│   │   └── SettingsModal.css
│   ├── Sidebar/                     # Left icon rail (explorer, search, languages, terminal)
│   │   ├── Sidebar.tsx
│   │   └── Sidebar.css
│   ├── StatusBar/                   # Bottom bar (language, cursor line:column)
│   │   ├── StatusBar.tsx
│   │   └── StatusBar.css
│   ├── TerminalPanel/               # Multi-tab PTY terminal (xterm.js + WebGL)
│   │   ├── TerminalPanel.tsx
│   │   └── TerminalPanel.css
│   └── Workspace/                   # Monaco editor + tab bar + LSP integration
│       ├── Workspace.tsx
│       └── Workspace.css
│
├── styles/
│   └── global.css                   # Design system: CSS variables, colors, fonts, reset
│
└── utils/                           # Shared utility functions
```

---

## Accessing Electron API from React

The Electron API is exposed via `window.electronAPI` (set up in `preload.js`):

```tsx
// Usage in any component:
const api = (window as any).electronAPI;

// File system
const content = await api.readFile(filePath);
await api.writeFile(filePath, content);

// Terminal
api.terminal.create(id);
api.terminal.input(id, data);

// Animation
const result = await api.manim.generate(filePath, code, language);

// Environment
const envs = await api.scanEnvironments();
```

---

## Key Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save active file |
| `Ctrl+W` | Close active tab |
| `F5` | Run active file |
| `Ctrl+Shift+F5` | Stop running code |
| `Ctrl+Shift+P` | Open Command Palette |
| `Ctrl+Shift+F` | Open Search Panel |

---

## Design Guidelines

- **Dark theme** with CSS custom properties (see `global.css`)
- **Font**: System fonts for UI, monospace for code
- **Split panels**: `react-split` for resizable dividers (persisted sizes)
- **States**: Every async action shows loading/error/success
- **Icons**: `react-icons` library
- **Frameless window**: Custom title bar via `MenuBar` component
