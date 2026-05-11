# 📘 Colon — Project Documentation

> **AI-Powered Desktop IDE with Code Animation**
> A desktop application where users write code, run it locally, and generate AI-powered animated video explanations of how their code works — step by step — using Manim Community Edition.

---

## 🎯 Project Vision

Beginners often struggle to understand how code actually executes — variables changing, loops iterating, recursion unfolding — because static textbooks and text-heavy platforms fail to capture the dynamic nature of programming. **Colon** solves this as an AI-powered desktop IDE where users write code in a full-featured editor (Monaco), run it locally via an integrated terminal, and generate animated video explanations powered by LLM-generated Manim scripts. The animations visually trace each step of execution using color-coded elements, variable trackers, and on-screen explanations.

### Key Differentiators

- **Desktop IDE** — Full IDE experience with file explorer, Monaco code editor, animation panel, integrated terminal, command palette, and settings
- **Local Execution** — Runtimes detected from system PATH and executed locally (Python, Node.js, C/C++, Java, Go, Rust, TypeScript)
- **One-Click Runtime Install** — Detect missing runtimes and install them directly from the IDE via the Language Manager panel
- **AI Animation Pipeline** — Write code → LLM generates Manim script → validated for security → rendered locally as MP4
- **Secure by Design** — Context isolation, filesystem jail, AST-level script validation, API key protection via Cloudflare Worker proxy
- **LSP Integration** — Language Server Protocol for intelligent code assistance (Python via Pyright, JS/TS via typescript-language-server)

---

## 📂 Documentation Index

### Core Documentation

| Document | Description |
|----------|-------------|
| [Architecture Overview](./ARCHITECTURE.md) | System design, IPC map, data flow, security model |
| [Tech Stack & Tools](./TECH_STACK.md) | All technologies, packages, and tools used |
| [Optimization Guide](./OPTIMIZATION.md) | Reducing render time, caching, performance tuning |

### Module-Specific Documentation

| Document | Description |
|----------|-------------|
| [Electron (Main Process)](./ELECTRON_README.md) | IPC handlers, service layer, process management |
| [Frontend (Renderer)](./FRONTEND_README.md) | React+TypeScript UI components, layout, state |
| [ML/AI Pipeline](./ML_README.md) | LLM integration, prompt engineering, Manim script generation, security validation |

---

## 🖥️ App Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  🎬 Colon IDE    File  Edit  View  Run  Terminal  Help  ─ □ ✕  │
├──┬────────────┬───────────────────────────┬───────────────────┬──┤
│  │            │                           │                   │  │
│  │  📁 FILES   │   📝 EDITOR (Monaco)      │ 🎬 ANIMATION TAB  │  │
│S │            │                           │                   │R │
│I │  ▾ project │                           │ ┌───────────────┐ │I │
│D │    ▸ src/  │  (Code editor with LSP)   │ │  MP4 Video    │ │G │
│E │    main.py │                           │ │  Player       │ │H │
│B │    sort.js │                           │ └───────────────┘ │T │
│A │            │                           │                   │  │
│R │            │      [▶ Run] [F5]         │  Block Animations │B │
│  │            │                           │  LLM Status       │A │
│  ├────────────┴───────────────────────────┴───────────────────┤R │
│  │  TERMINAL (xterm.js — multi-tab PTY)                       │  │
│  │  ~/project $ python3 main.py                               │  │
│  │  Hello World!                                              │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  STATUS BAR: Python │ Ln 42, Col 15                        │  │
└──┴────────────────────────────────────────────────────────────┴──┘
```

---

## 🚀 Quick Start (Development)

```bash
git clone https://github.com/oryx-org/colon.git
cd colon

# Install dependencies
npm --prefix frontend install
npm --prefix backend install

# Start in development mode
cd backend
npm run dev
# Electron window opens with React loaded from Vite dev server
```

### Testing

```bash
cd backend
npm test
# Runs 36 tests: security, script validation, manim pipeline
```

### Building Installers

```bash
cd backend
npm run package:win    # Windows .exe
npm run package:linux  # Linux .AppImage + .deb
npm run package:mac    # macOS .dmg
```
