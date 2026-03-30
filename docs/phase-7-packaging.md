# 📦 Phase 7 — Packaging & Distribution

> **Timeline**: Week 7–9  
> **Team**: DevOps member  
> **Goal**: Build installers for Windows, macOS, Linux + auto-update system

---

## 8.1 Objectives

- [ ] Configure electron-builder for all platforms
- [ ] Build .exe (Windows), .dmg (macOS), .AppImage/.deb (Linux) installers
- [ ] Set up auto-update via GitHub Releases
- [ ] Optimize app size (tree-shake, exclude unnecessary files)
- [ ] Set up CI/CD with GitHub Actions for automated builds

---

## 8.2 Electron Builder Configuration

```yaml
# desktop/electron-builder.yml
appId: com.codemotion.app
productName: CodeMotion
copyright: Copyright © 2026 CodeMotion Team

directories:
  output: dist
  buildResources: assets

files:
  - main.js
  - preload.js
  - services/**/*
  - config/**/*
  - "!node_modules/**/{test,tests,__tests__}/**"


win:
  target:
    - nsis
  icon: assets/icon.ico
  artifactName: CodeMotion-Setup-${version}.${ext}

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerIcon: assets/icon.ico
  uninstallerIcon: assets/icon.ico

mac:
  target:
    - dmg
  icon: assets/icon.icns
  category: public.app-category.developer-tools

linux:
  target:
    - AppImage
    - deb
  icon: assets/icon.png
  category: Development
  maintainer: codemotion@example.com

publish:
  provider: github
  owner: your-github-username
  repo: codemotion
```

---

## 8.3 Build Commands

```bash
# Build for current platform
cd desktop
npx electron-builder --dir        # Quick test (no installer)
npx electron-builder              # Full installer

# Build for specific platforms
npx electron-builder --win        # Windows .exe
npx electron-builder --mac        # macOS .dmg
npx electron-builder --linux      # Linux .AppImage + .deb
```

**Output:**
```
desktop/dist/
├── CodeMotion-Setup-1.0.0.exe       # Windows (~80MB)
├── CodeMotion-1.0.0.dmg             # macOS (~85MB)
├── CodeMotion-1.0.0.AppImage        # Linux portable (~75MB)
└── codemotion_1.0.0_amd64.deb       # Linux .deb (~70MB)
```

---

## 8.4 Auto-Update System

```javascript
// desktop/main.js — add auto-updater
const { autoUpdater } = require('electron-updater');

app.whenReady().then(() => {
  createWindow();

  // Check for updates (from GitHub Releases)
  if (process.env.NODE_ENV === 'production') {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

autoUpdater.on('update-available', (info) => {
  mainWindow.webContents.send('update:available', info.version);
});

autoUpdater.on('update-downloaded', () => {
  mainWindow.webContents.send('update:ready');
  // User clicks "Restart" → install update
});
```

Release workflow:
```
1. Bump version in package.json
2. Push tag: git tag v1.1.0 && git push --tags
3. GitHub Actions builds all platform installers
4. Uploads to GitHub Releases
5. Users' apps auto-detect update → download → restart
```

---

## 8.5 CI/CD Pipeline

```yaml
# .github/workflows/build.yml
name: Build & Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install frontend deps
        run: cd frontend && npm ci

      - name: Build frontend
        run: cd frontend && npm run build

      - name: Install desktop deps
        run: cd desktop && npm ci

      - name: Build Electron app
        run: cd desktop && npx electron-builder
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: release-${{ matrix.os }}
          path: desktop/dist/CodeMotion*
```

---

## 8.6 App Size Optimization

| Optimization | Impact |
|---|---|
| Exclude `node_modules` test files | -10MB |
| Tree-shake unused dependencies | -5MB |
| Compress assets (icons) | -5MB |
| Use `asar` archive (default in electron-builder) | Faster load time |
| Don't bundle compilers — download via Language Manager | -400MB saved! |

**Target app download: ~70-80MB** (without compilers)

---

## 8.7 Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | electron-builder config for all 3 platforms | ⬜ |
| 2 | Windows .exe installer working | ⬜ |
| 3 | macOS .dmg installer working | ⬜ |
| 4 | Linux .AppImage + .deb working | ⬜ |
| 5 | Auto-updater via GitHub Releases | ⬜ |
| 6 | GitHub Actions CI/CD pipeline | ⬜ |
| 7 | App size under 80MB | ⬜ |
| 8 | App icon designed and set | ⬜ |
