# 🎨 Frontend (Renderer) README — React UI

---

## Overview

The frontend is a React application that runs inside Electron's renderer process. It provides the IDE-like interface: file explorer, code editor, animation player, and terminal.

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
├── components/
│   ├── Layout/
│   │   ├── Layout.jsx              # Main shell with split panels
│   │   ├── Header.jsx              # Top bar: logo, buttons, language selector
│   │   └── Header.css
│   ├── FileExplorer/
│   │   ├── FileExplorer.jsx        # Directory tree panel
│   │   ├── FileNode.jsx            # Single file/folder item
│   │   └── FileExplorer.css
│   ├── Editor/
│   │   ├── EditorPanel.jsx         # Monaco editor + tab bar
│   │   ├── EditorTabs.jsx          # Open file tabs
│   │   └── Editor.css
│   ├── AnimationPanel/
│   │   ├── AnimationPanel.jsx      # Video + explanations container
│   │   ├── VideoPlayer.jsx         # ReactPlayer wrapper
│   │   ├── ExplanationPanel.jsx    # Algorithm + Current Step
│   │   └── AnimationPanel.css
│   ├── Terminal/
│   │   ├── TerminalPanel.jsx       # xterm.js wrapper
│   │   └── Terminal.css
│   └── LanguageManager/
│       ├── LanguageManager.jsx     # Install/uninstall compilers
│       └── LanguageManager.css
│
├── pages/
│   ├── IDEPage.jsx                 # Main IDE view (default)
│   └── SettingsPage.jsx            # Settings + Language Manager
│
├── hooks/
│   ├── useElectron.js              # Access window.electronAPI safely
│   ├── useFileTree.js              # File explorer state
│   └── useCodeRunner.js            # Run code + capture output
│
├── styles/
│   └── global.css                  # Design system: colors, fonts, reset
│
├── App.jsx                         # Router + page selection
└── main.jsx                        # React entry point
```

---

## Accessing Electron API from React

```jsx
// hooks/useElectron.js
export function useElectron() {
  const api = window.electronAPI;

  if (!api) {
    // Running in browser (not Electron)
    console.warn('electronAPI not available — running in browser mode');
    return null;
  }

  return api;
}

// Usage in any component:
function MyComponent() {
  const electron = useElectron();

  const openFolder = async () => {
    if (!electron) return;
    const path = await electron.openFolder();
    // ...
  };
}
```

---

## Design Guidelines

- **Dark theme only** (see `global.css` for color variables)
- **Font**: JetBrains Mono for code, Inter for UI text
- **Split panels**: Use `react-split` for resizable dividers
- **States**: Every async action must show loading/error/success
- **Icons**: Use `react-icons` (Feather icons preferred)
