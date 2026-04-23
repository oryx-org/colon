const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isDesktop: true,
    platform: process.platform,

    // Window controls
    windowControl: (action) => ipcRenderer.send('window-control', action),
    newWindow: () => ipcRenderer.send('window-new'),

    // File system — dialogs
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

    // File system — CRUD
    readDirectory: (dirPath) => ipcRenderer.invoke('fs:readDirectory', dirPath),
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', { filePath, content }),
    delete: (targetPath) => ipcRenderer.invoke('fs:delete', targetPath),
    rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', { oldPath, newPath }),
    createFile: (filePath) => ipcRenderer.invoke('fs:createFile', filePath),
    createDirectory: (dirPath) => ipcRenderer.invoke('fs:createDirectory', dirPath),
    setWorkspace: (dirPath) => ipcRenderer.invoke('workspace:set', dirPath),

    // Terminal (PTY)
    terminal: {
        create: (id) => ipcRenderer.send('terminal-create', id),
        input: (id, data) => ipcRenderer.send('terminal-input', { terminalId: id, data }),
        resize: (id, cols, rows) => ipcRenderer.send('terminal-resize', { terminalId: id, cols, rows }),
        kill: (id) => ipcRenderer.send('terminal-kill', id),
        onData: (id, callback) => ipcRenderer.on(`terminal-incoming-data-${id}`, (event, data) => callback(data)),
        removeDataListener: (id) => ipcRenderer.removeAllListeners(`terminal-incoming-data-${id}`)
    },

    // Environment Scanner
    scanEnvironments: () => ipcRenderer.invoke('env:scan'),
    getEnvironments: () => ipcRenderer.invoke('env:get'),
    installRuntime: (runtimeId) => ipcRenderer.invoke('env:installRuntime', runtimeId),
    cancelRuntimeInstall: (installId) => ipcRenderer.invoke('env:cancelRuntimeInstall', installId),
    onRuntimeInstallEvent: (callback) => {
        ipcRenderer.on('env:install:event', (event, payload) => callback(payload));
    },
    removeRuntimeInstallListeners: () => ipcRenderer.removeAllListeners('env:install:event'),

    // Code Engine
    getRunCommand: (filePath) => ipcRenderer.invoke('code:getRunCommand', filePath),
    lintCode: (filePath, content) => ipcRenderer.invoke('code:lint', { filePath, content }),

    // Search
    searchInFiles: (query, options) => ipcRenderer.invoke('search:inFiles', query, options),
    replaceInFiles: (query, replacement, options) => ipcRenderer.invoke('search:replaceInFiles', query, replacement, options),

    // Git
    git: {
        status: (cwd) => ipcRenderer.invoke('git:status', cwd),
        branch: (cwd) => ipcRenderer.invoke('git:branch', cwd),
        run: (cwd, command) => ipcRenderer.invoke('git:run', cwd, command)
    },

    // Debugger
    debug: {
        start: (filePath, language, options) => ipcRenderer.invoke('debug:start', { filePath, language, options }),
        stop: (sessionId) => ipcRenderer.invoke('debug:stop', sessionId),
        step: (sessionId, action) => ipcRenderer.invoke('debug:step', { sessionId, action }),
        status: (sessionId) => ipcRenderer.invoke('debug:status', sessionId)
    },

    // Animation System (LLM Engine)
    animation: {
        detectBlocksUniversal: (code, language) =>
            ipcRenderer.invoke('animation:detectBlocksUniversal', { code, language }),
        generateAnimation: (filePath, code, language, blockInfo) =>
            ipcRenderer.invoke('animation:generateAnimation', { filePath, code, language, blockInfo }),
        loadAnimations: (filePath) => ipcRenderer.invoke('animation:loadAnimations', filePath),
        deleteAnimation: (filePath, animId) =>
            ipcRenderer.invoke('animation:deleteAnimation', { filePath, animId }),
        clearAnimations: (filePath) => ipcRenderer.invoke('animation:clearAnimations', filePath),
        getLlmStatus: () => ipcRenderer.invoke('animation:getLlmStatus'),
    },

    // Manim Video System
    manim: {
        generate: (filePath, code, language) =>
            ipcRenderer.invoke('manim:generate', { filePath, code, language }),
        loadVideos: (filePath) => ipcRenderer.invoke('manim:loadVideos', filePath),
        deleteVideo: (filePath, videoId) =>
            ipcRenderer.invoke('manim:delete', { filePath, videoId }),
    },
});
