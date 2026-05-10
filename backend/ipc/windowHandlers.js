/**
 * Window Control IPC Handlers
 * Manages window minimize, maximize, close, and new window operations.
 */
const { ipcMain } = require('electron');

function registerWindowHandlers({ getMainWindow, createWindow }) {
    ipcMain.on('window-control', (event, action) => {
        const win = getMainWindow();
        if (!win) return;
        switch (action) {
            case 'minimize': win.minimize(); break;
            case 'maximize':
                if (win.isMaximized()) { win.unmaximize(); }
                else { win.maximize(); }
                break;
            case 'close': win.close(); break;
        }
    });

    ipcMain.on('window-new', () => { createWindow(); });
}

module.exports = { registerWindowHandlers };
