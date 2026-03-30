# 📘 CodeMotion — Project Documentation

> **AI-Powered Desktop IDE with Code Animation**
> A desktop application where users write code, run it locally, and instantly see AI-generated animated videos explaining how their code works — step by step.

---

## 🎯 Project Vision

Beginners often struggle to understand how code actually executes — variables changing, loops iterating, recursion unfolding — because static textbooks and text-heavy platforms fail to capture the dynamic nature of programming. **CodeMotion** solves this as an AI-powered desktop application where users write code (even partial snippets) in a full IDE and instantly receive AI-generated animated videos that visually explain each step of execution using color-coded elements, variable trackers, and on-screen explanations. Every time the user modifies their code and clicks "Analyze," a fresh animation is generated locally, allowing learners to see the impact of each change in real time.

### Key Differentiators

- **Desktop App** — Full IDE experience with file explorer, code editor, animation player, and integrated terminal
- **Local Execution** — Compilers run locally on the user's machine (no server needed)
- **Built-in Language Manager** — One-click download & install of supported languages (Python, C++, Java, Node.js)
- **Local Manim Rendering** — Animations are generated on the user's machine — fast and free
- **Code-to-Animation** — Write code, click Analyze, watch it come to life as an animated video

---

## 📂 Documentation Index

### Core Documentation

| Document | Description |
|---|---|
| [Architecture Overview](./ARCHITECTURE.md) | System design, Electron architecture, data flow |
| [Tech Stack & Tools](./TECH_STACK.md) | All technologies, packages, and tools used |
| [Optimization Guide](./OPTIMIZATION.md) | Reducing render time, app size, and performance tuning |

### Phase-wise Implementation Guide

| Phase | Document | Timeline | Focus |
|---|---|---|---|
| **Phase 1** | [Project Setup](./phase-1-project-setup.md) | Week 1–2 | Electron + React + Vite scaffolding |
| **Phase 2** | [UI Shell & Layout](./phase-2-ui-shell.md) | Week 2–4 | File explorer, editor, animation panel, terminal |
| **Phase 3** | [Language Manager](./phase-3-language-manager.md) | Week 3–5 | Download, install, manage compilers locally |
| **Phase 4** | [Code Execution Engine](./phase-4-code-execution.md) | Week 4–6 | Run user code with local compilers |
| **Phase 5** | [Manim Integration](./phase-5-manim-integration.md) | Week 5–7 | LLM + local Manim rendering pipeline |
| **Phase 6** | [LLM & AI Integration](./phase-6-llm-integration.md) | Week 6–8 | Prompt engineering, code analysis |
| **Phase 7** | [Packaging & Distribution](./phase-7-packaging.md) | Week 7–9 | Electron Builder, installers, auto-update |

### Module-Specific README Files

| Readme | Description |
|---|---|
| [Electron (Main Process) README](./ELECTRON_README.md) | IPC handlers, file system, process management |
| [Frontend (Renderer) README](./FRONTEND_README.md) | React UI components, layout, state |
| [ML/AI README](./ML_README.md) | LLM integration, prompt engineering, Manim script generation |

---

## 👥 Team of 6 — Role Assignments

| Role | Members | Responsibilities |
|---|---|---|
| **UI / Frontend** | 2 members | React components, layout, dark theme, animations |
| **Electron / System** | 2 members | Main process, file system, terminal, language manager, code runner |
| **ML / Manim** | 1 member | LLM prompts, Manim templates, script validation |
| **DevOps / Packaging** | 1 member | Electron builder, installers, CI/CD, testing |

---

## 🖥️ App Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  🎬 CodeMotion    File  Edit  View  Help               ─  □  ✕  │
├───────────┬───────────────────────────┬──────────────────────────┤
│           │                           │                          │
│  📁 FILES  │   📝 EDITOR (Monaco)      │   🎬 ANIMATION PLAYER    │
│           │                           │                          │
│  ▾ project│                           │   ┌──────────────────┐  │
│    ▸ src/ │  (User writes code here)  │   │   MP4 Video      │  │
│    main.py│                           │   │   Player         │  │
│    sort.js│                           │   └──────────────────┘  │
│           │                           │                          │
│           │        [▶ Run] [🔍 Analyze]│   📘 Explanation Panel   │
│           │                           │   🔍 Current Step Panel  │
├───────────┴───────────────────────────┴──────────────────────────┤
│  TERMINAL / OUTPUT CONSOLE                                      │
│  ~/project $ python3 main.py                                    │
│  Hello World!                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (Development)

```bash
git clone <repo-url>
cd codemotion

# Install frontend dependencies
cd frontend && npm install

# Start in development mode
cd ../desktop
npm install
npm run dev
# Electron window opens with React loaded from Vite dev server
```
