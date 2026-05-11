# 📦 Phase 7 — Packaging & Distribution

> **Timeline**: Week 7–9
> **Team**: DevOps member
> **Goal**: Build installers for Windows, macOS, Linux + CI/CD pipeline

---

## 7.1 Objectives

- [x] Configure electron-builder for all platforms
- [x] Build .exe (Windows), .dmg (macOS), .AppImage/.deb (Linux) installers
- [x] Optimize app size (exclude unnecessary files, use asar)
- [x] Set up CI/CD with GitHub Actions for automated builds
- [x] Deploy Cloudflare Worker proxy for API key protection

---

## 7.2 Electron Builder Configuration

The build configuration lives in `backend/package.json` under the `"build"` key:

```json
{
  "build": {
    "appId": "com.colon.ide",
    "productName": "Colon IDE",
    "asar": true,
    "directories": {
      "output": "dist",
      "buildResources": "build"
    },
    "files": [
      "main.js",
      "preload.js",
      "services/**/*",
      "ipc/**/*",
      "package.json",
      "!npm_log.txt",
      "!**/*.map"
    ],
    "linux": {
      "target": ["AppImage", "deb"],
      "category": "Development",
      "artifactName": "Colon-IDE-${version}-${arch}.${ext}",
      "icon": "build/icon.png"
    },
    "mac": {
      "target": ["dmg"],
      "category": "public.app-category.developer-tools",
      "artifactName": "Colon-IDE-${version}-${arch}.${ext}"
    },
    "win": {
      "target": [{ "target": "nsis", "arch": ["x64"] }],
      "artifactName": "Colon-IDE-${version}-${arch}-Setup.${ext}"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

---

## 7.3 Build Commands

```bash
# Build frontend first, then package for current platform
cd backend
npm run package

# Build for specific platforms
npm run package:win     # Windows .exe
npm run package:mac     # macOS .dmg
npm run package:linux   # Linux .AppImage + .deb

# Quick test build (no installer, just unpacked directory)
npm run package:dir
```

**Output:**
```
backend/dist/
├── Colon-IDE-1.0.0-x64-Setup.exe     # Windows (~80MB)
├── Colon-IDE-1.0.0-arm64.dmg         # macOS (~85MB)
├── Colon-IDE-1.0.0-x86_64.AppImage   # Linux portable (~75MB)
└── Colon-IDE-1.0.0-amd64.deb         # Linux .deb (~70MB)
```

---

## 7.4 CI/CD Pipeline

### CI — Lint & Test (on every push to main)

```yaml
# .github/workflows/ci.yml
name: CI — Lint & Test
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm --prefix backend ci
      - run: npm --prefix backend test
      - run: node --check backend/main.js
      - run: npm --prefix frontend ci
      - run: npm --prefix frontend run build
```

### Release — Build Installers (on tag push)

```yaml
# .github/workflows/release.yml
name: Build Release Installers
on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  release:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            build_cmd: npm --prefix backend run package:linux
          - os: windows-latest
            build_cmd: npm --prefix backend run package:win
          - os: macos-latest
            build_cmd: npm --prefix backend run package:mac

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm --prefix frontend ci
      - run: npm --prefix backend ci
      - run: ${{ matrix.build_cmd }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: Colon-IDE-${{ matrix.os }}
          path: |
            backend/dist/*.AppImage
            backend/dist/*.deb
            backend/dist/*.dmg
            backend/dist/*Setup*.exe
```

### Release Workflow

```
1. Make changes and commit
2. Tag the release: git tag v1.2.0
3. Push with tags: git push origin main --tags
4. GitHub Actions builds all platform installers
5. Download installers from Actions artifacts
```

---

## 7.5 Cloudflare Worker Proxy Deployment

The Gemini API key is protected via a Cloudflare Worker proxy:

```bash
cd colon-proxy
npx wrangler secret put GEMINI_API_KEY    # Enter API key when prompted
npx wrangler deploy                        # Deploy the worker
```

The worker is deployed at: `https://colon-llm-proxy.oryx-org.workers.dev`

---

## 7.6 App Size Optimization

| Optimization | Impact |
|---|---|
| Exclude `node_modules` test files via `files` config | -10MB |
| Use `asar` archive (default in electron-builder) | Faster load time |
| Don't bundle runtimes — detect from PATH, install on demand | No binary bloat |
| `npmRebuild: false` (rebuild native modules manually if needed) | Faster build |

---

## 7.7 Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | electron-builder config for all 3 platforms | ✅ Done |
| 2 | Windows .exe installer working | ✅ Done |
| 3 | macOS .dmg installer working | ✅ Done |
| 4 | Linux .AppImage + .deb working | ✅ Done |
| 5 | GitHub Actions CI pipeline | ✅ Done |
| 6 | GitHub Actions release pipeline | ✅ Done |
| 7 | Cloudflare Worker proxy deployed | ✅ Done |
| 8 | App icon designed and set | ✅ Done |
