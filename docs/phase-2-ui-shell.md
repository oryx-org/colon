# 🎨 Phase 2 — UI Shell & Layout

> **Timeline**: Week 2–4  
> **Team**: 2 UI / Frontend Developers  
> **Goal**: Complete IDE-like layout with resizable panels, dark theme, and all UI containers ready

---

## 2.1 Objectives

- [ ] Build the 4-panel IDE layout (file explorer, editor, animation, terminal)
- [ ] Implement resizable split panels
- [ ] Integrate Monaco Editor with multi-language support
- [ ] Integrate xterm.js terminal component
- [ ] Build video player component with controls
- [ ] Build explanation panels (Algorithm + Current Step)
- [ ] Implement dark theme with premium aesthetics
- [ ] Add header with menu bar, Run button, Analyze button

---

## 2.2 Layout Architecture

```
┌──────────────────────────────── HEADER ─────────────────────────────────┐
│  🎬 Colon   [▶ Run] [🔍 Analyze] [⚙ Settings]      Language: C++ │
├───────────┬───────────────────────────┬─────────────────────────────────┤
│           │                           │                                 │
│  FILE     │       EDITOR              │     ANIMATION PANEL             │
│ EXPLORER  │      (Monaco)             │                                 │
│           │                           │  ┌───────────────────────────┐  │
│  (15%)    │      (45%)                │  │   Video Player            │  │
│           │                           │  │                           │  │
│  ◄──────► │ ◄────────────────────────►│  └───────────────────────────┘  │
│  resize   │        resize             │  ┌───────────────────────────┐  │
│           │                           │  │ 📘 Algorithm Explanation  │  │
│           │                           │  ├───────────────────────────┤  │
│           │                           │  │ 🔍 Current Step Details   │  │
│           │                           │  └───────────────────────────┘  │
│           │                           │         (40%)                   │
├───────────┴───────────────────────────┴─────────────────────────────────┤
│  TERMINAL / OUTPUT (20% height)                                    ▲▼  │
│  ~/project $                                              resize       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2.3 Component Tree

```
App.jsx
├── Layout.jsx
│   ├── Header.jsx
│   │   ├── Logo
│   │   ├── RunButton
│   │   ├── AnalyzeButton
│   │   ├── LanguageSelector
│   │   └── SettingsButton
│   │
│   ├── MainArea (horizontal split: left | middle | right)
│   │   ├── FileExplorer.jsx          ← LEFT (resizable)
│   │   │   ├── FolderTree.jsx
│   │   │   └── FileNode.jsx
│   │   │
│   │   ├── EditorPanel.jsx           ← MIDDLE (resizable)
│   │   │   ├── EditorTabs.jsx        (open file tabs)
│   │   │   └── MonacoEditor
│   │   │
│   │   └── AnimationPanel.jsx        ← RIGHT (resizable)
│   │       ├── VideoPlayer.jsx
│   │       ├── AlgorithmExplanation.jsx
│   │       └── CurrentStepDetail.jsx
│   │
│   └── BottomPanel (vertical split below main)
│       └── TerminalPanel.jsx
│           └── xterm.js instance
│
├── SettingsPage.jsx
```

---

## 2.4 Key Component Code

### 2.4.1 Resizable Split Layout

```jsx
// components/Layout/Layout.jsx
import Split from 'react-split';

function Layout() {
  return (
    <div className="app-layout">
      <Header />

      {/* Vertical split: main area (top) + terminal (bottom) */}
      <Split
        direction="vertical"
        sizes={[80, 20]}
        minSize={[300, 100]}
        gutterSize={4}
        className="split-vertical"
      >
        {/* Horizontal split: explorer | editor | animation */}
        <Split
          sizes={[15, 45, 40]}
          minSize={[150, 300, 250]}
          gutterSize={4}
          className="split-horizontal"
        >
          <FileExplorer />
          <EditorPanel />
          <AnimationPanel />
        </Split>

        <TerminalPanel />
      </Split>
    </div>
  );
}
```

### 2.4.2 Editor with Tabs

```jsx
// components/Editor/EditorPanel.jsx
import Editor from '@monaco-editor/react';
import { useState } from 'react';

function EditorPanel() {
  const [openFiles, setOpenFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [code, setCode] = useState('');

  const languageMap = {
    '.py': 'python',
    '.cpp': 'cpp', '.c': 'c', '.h': 'cpp',
    '.java': 'java',
    '.js': 'javascript',
  };

  const getLanguage = (filename) => {
    const ext = '.' + filename.split('.').pop();
    return languageMap[ext] || 'plaintext';
  };

  return (
    <div className="editor-panel">
      <div className="editor-tabs">
        {openFiles.map(file => (
          <div
            key={file.path}
            className={`tab ${file.path === activeFile?.path ? 'active' : ''}`}
            onClick={() => setActiveFile(file)}
          >
            {file.name}
            <span className="tab-close" onClick={() => closeFile(file)}>×</span>
          </div>
        ))}
      </div>

      <Editor
        height="100%"
        language={activeFile ? getLanguage(activeFile.name) : 'plaintext'}
        value={code}
        onChange={setCode}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          cursorBlinking: 'smooth',
          smoothScrolling: true,
          renderWhitespace: 'selection',
        }}
      />
    </div>
  );
}
```

### 2.4.3 Animation Panel

```jsx
// components/AnimationPanel/AnimationPanel.jsx
import ReactPlayer from 'react-player';

function AnimationPanel({ videoPath, status, progress, explanation, currentStep }) {
  return (
    <div className="animation-panel">
      {/* Video Player */}
      <div className="video-container">
        {status === 'idle' && (
          <div className="video-placeholder">
            <span className="icon">🎬</span>
            <p>Click <strong>Analyze</strong> to generate animation</p>
          </div>
        )}
        {status === 'rendering' && (
          <div className="video-loading">
            <div className="spinner" />
            <p>Generating animation... {progress}%</p>
            <div className="progress-bar">
              <div className="fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {status === 'ready' && videoPath && (
          <ReactPlayer
            url={`file://${videoPath}`}
            controls
            width="100%"
            height="100%"
            playing
          />
        )}
      </div>

      {/* Explanation Panels */}
      <div className="explanation-section">
        <div className="explanation-box algorithm">
          <h4>📘 Algorithm</h4>
          <p>{explanation || 'Algorithm explanation will appear here...'}</p>
        </div>
        <div className="explanation-box current-step">
          <h4>🔍 Current Step</h4>
          <p>{currentStep || 'Step-by-step details will appear here...'}</p>
        </div>
      </div>
    </div>
  );
}
```

### 2.4.4 Terminal Panel

```jsx
// components/Terminal/TerminalPanel.jsx
import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

function TerminalPanel() {
  const termRef = useRef(null);

  useEffect(() => {
    const term = new Terminal({
      theme: {
        background: '#0a0e17',
        foreground: '#e2e8f0',
        cursor: '#6366f1',
        selectionBackground: '#6366f140',
      },
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current);
    fitAddon.fit();

    // Connect to Electron's real terminal
    window.electronAPI.createTerminal();
    window.electronAPI.onTerminalData((data) => term.write(data));
    term.onData((data) => window.electronAPI.sendTerminalInput(data));

    // Handle resize
    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(termRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
    };
  }, []);

  return <div ref={termRef} className="terminal-container" />;
}
```

---

## 2.5 Dark Theme Design System

```css
/* styles/global.css */
:root {
  /* Background */
  --bg-primary:     #0a0e17;
  --bg-secondary:   #111827;
  --bg-panel:       #1a1f2e;
  --bg-hover:       #1e2538;

  /* Accent */
  --accent:         #6366f1;
  --accent-glow:    rgba(99, 102, 241, 0.3);
  --accent-2:       #22d3ee;
  --success:        #10b981;
  --error:          #ef4444;
  --warning:        #f59e0b;

  /* Text */
  --text-primary:   #f1f5f9;
  --text-secondary: #94a3b8;
  --text-dim:       #64748b;

  /* Borders */
  --border:         #1e293b;
  --border-active:  #6366f1;

  /* Gutter (split panel divider) */
  --gutter:         #1e293b;
  --gutter-hover:   #6366f1;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Inter', -apple-system, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}
```

---

## 2.6 Task Division

### Developer 1: Layout + Editor

| Week | Tasks |
|---|---|
| Week 2 | Resizable split panels, Header component |
| Week 3 | Monaco Editor integration, file tabs |
| Week 4 | Dark theme, keyboard shortcuts, polish |

### Developer 2: Animation Panel + Terminal

| Week | Tasks |
|---|---|
| Week 2 | Video player component, explanation panels |
| Week 3 | xterm.js terminal integration |
| Week 4 | File explorer component, responsive panels |

---

## 2.7 Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | Resizable 4-panel layout working | ⬜ |
| 2 | Monaco Editor with tabs and 4 languages | ⬜ |
| 3 | Video player with idle/loading/ready states | ⬜ |
| 4 | xterm.js terminal connected to real shell | ⬜ |
| 5 | File explorer showing directory tree | ⬜ |
| 6 | Explanation panels (Algorithm + Current Step) | ⬜ |
| 7 | Dark theme with premium aesthetics | ⬜ |
| 8 | Header with Run, Analyze, Settings buttons | ⬜ |
