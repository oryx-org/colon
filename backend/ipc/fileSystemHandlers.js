/**
 * File System IPC Handlers
 * 
 * Handles all filesystem operations: read, write, delete, rename, create files/dirs.
 * All operations are sandboxed to the current workspace via isPathWithinWorkspace().
 */

const path = require('path');
const fs = require('fs');
const { ipcMain, dialog } = require('electron');

/**
 * Register all file system IPC handlers.
 * @param {Function} getMainWindow - Returns the current BrowserWindow
 * @param {Function} isPathWithinWorkspace - Path validation function
 * @param {Function} getLastOpenedDir - Returns last opened directory
 * @param {Function} setLastOpenedDir - Sets last opened directory
 * @param {Set} explicitlyAllowedFiles - Set of explicitly allowed file paths
 */
function registerFileSystemHandlers({ getMainWindow, isPathWithinWorkspace, getLastOpenedDir, setLastOpenedDir, explicitlyAllowedFiles }) {

    ipcMain.handle('dialog:openDirectory', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
            properties: ['openDirectory']
        });
        if (canceled) return null;
        const resolved = path.resolve(filePaths[0]);
        setLastOpenedDir(resolved);
        return resolved;
    });

    ipcMain.handle('dialog:openFile', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'All Files', extensions: ['*'] },
                { name: 'Source Code', extensions: ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'md', 'txt', 'sh', 'bat'] },
            ]
        });
        if (canceled) return null;
        for (const filePath of filePaths) {
            explicitlyAllowedFiles.add(path.resolve(filePath));
        }
        return filePaths;
    });

    ipcMain.handle('fs:readDirectory', async (event, dirPath) => {
        if (!isPathWithinWorkspace(dirPath)) {
            console.warn('[fileSystemHandlers] readDirectory blocked — path outside workspace:', dirPath);
            return [];
        }
        try {
            const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
            const files = items.map(item => ({
                name: item.name,
                isDirectory: item.isDirectory(),
                path: path.join(dirPath, item.name)
            }));
            return files.sort((a, b) => {
                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                return a.isDirectory ? -1 : 1;
            });
        } catch (error) {
            console.error('[fileSystemHandlers] Error reading directory:', error);
            return [];
        }
    });

    ipcMain.handle('fs:readFile', async (event, filePath) => {
        if (!isPathWithinWorkspace(filePath)) {
            console.warn('[fileSystemHandlers] readFile blocked — path outside workspace:', filePath);
            throw new Error('Access denied: path outside workspace');
        }
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return content;
        } catch (error) {
            console.error('[fileSystemHandlers] Error reading file:', error);
            throw error;
        }
    });

    ipcMain.handle('fs:writeFile', async (event, { filePath, content }) => {
        if (!isPathWithinWorkspace(filePath)) {
            console.warn('[fileSystemHandlers] writeFile blocked — path outside workspace:', filePath);
            return false;
        }
        try {
            await fs.promises.writeFile(filePath, content, 'utf-8');
            return true;
        } catch (error) {
            console.error('[fileSystemHandlers] Error writing file:', error);
            return false;
        }
    });

    ipcMain.handle('fs:delete', async (event, targetPath) => {
        if (!isPathWithinWorkspace(targetPath)) {
            console.warn('[fileSystemHandlers] delete blocked — path outside workspace:', targetPath);
            return false;
        }
        try {
            const stats = await fs.promises.stat(targetPath);
            if (stats.isDirectory()) {
                await fs.promises.rm(targetPath, { recursive: true, force: true });
            } else {
                await fs.promises.unlink(targetPath);
            }
            return true;
        } catch (error) {
            console.error('[fileSystemHandlers] Error deleting:', error);
            return false;
        }
    });

    ipcMain.handle('fs:rename', async (event, { oldPath, newPath }) => {
        if (!isPathWithinWorkspace(oldPath) || !isPathWithinWorkspace(newPath)) {
            console.warn('[fileSystemHandlers] rename blocked — path outside workspace');
            return false;
        }
        try {
            await fs.promises.rename(oldPath, newPath);
            return true;
        } catch (error) {
            console.error('[fileSystemHandlers] Error renaming:', error);
            return false;
        }
    });

    ipcMain.handle('fs:createFile', async (event, filePath) => {
        if (!isPathWithinWorkspace(filePath)) {
            console.warn('[fileSystemHandlers] createFile blocked — path outside workspace:', filePath);
            return false;
        }
        try {
            await fs.promises.writeFile(filePath, '', 'utf-8');
            return true;
        } catch (error) {
            console.error('[fileSystemHandlers] Error creating file:', error);
            return false;
        }
    });

    ipcMain.handle('fs:createDirectory', async (event, dirPath) => {
        if (!isPathWithinWorkspace(dirPath)) {
            console.warn('[fileSystemHandlers] createDirectory blocked — path outside workspace:', dirPath);
            return false;
        }
        try {
            await fs.promises.mkdir(dirPath, { recursive: true });
            return true;
        } catch (error) {
            console.error('[fileSystemHandlers] Error creating directory:', error);
            return false;
        }
    });
}

module.exports = { registerFileSystemHandlers };
