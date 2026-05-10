/**
 * Animation IPC Handlers
 * Handles block animations, Manim video generation, and the Animation Engine.
 */
const { ipcMain } = require('electron');
const { detectBlocks, extToLanguage } = require('../services/blockDetectorUniversal');
const { generateAnimation, loadAnimations, deleteAnimation: deleteAnim, clearAnimations } = require('../services/animationGenerator');
const { isConfigured: isLlmConfigured, getConfig: getLlmConfig } = require('../services/llmService');
const { generateManimVideo, loadManimVideos, deleteManimVideo, cancelManimVideo } = require('../services/manimService');
const { checkAnimEngine, installAnimEngine } = require('../services/animEngineService');

function registerAnimationHandlers() {
    // Block detection
    ipcMain.handle('animation:detectBlocksUniversal', async (event, { code, language }) => {
        try { return { success: true, blocks: detectBlocks(code, language) }; }
        catch (err) { return { success: false, error: err.message, blocks: [] }; }
    });

    // Block animation generation
    ipcMain.handle('animation:generateAnimation', async (event, { filePath, code, language, blockInfo }) => {
        try { return { success: true, record: await generateAnimation(filePath, code, language, blockInfo) }; }
        catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('animation:loadAnimations', async (event, filePath) => {
        try { return { success: true, animations: loadAnimations(filePath) }; }
        catch (err) { return { success: false, error: err.message, animations: [] }; }
    });

    ipcMain.handle('animation:deleteAnimation', async (event, { filePath, animId }) => {
        try { return { success: deleteAnim(filePath, animId) }; }
        catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('animation:clearAnimations', async (event, filePath) => {
        try { return { success: clearAnimations(filePath) }; }
        catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('animation:getLlmStatus', async () => {
        return { configured: isLlmConfigured(), config: getLlmConfig() };
    });

    ipcMain.handle('animation:cancel', async () => {
        return { success: true };
    });

    // Manim video generation
    ipcMain.handle('manim:generate', async (event, { filePath, code, language }) => {
        try { return { success: true, record: await generateManimVideo(filePath, code, language) }; }
        catch (err) { console.error('[animHandlers] Manim error:', err.message); return { success: false, error: err.message }; }
    });

    ipcMain.handle('manim:cancel', async () => {
        cancelManimVideo();
        return { success: true };
    });

    ipcMain.handle('manim:loadVideos', async (event, filePath) => {
        try { return { success: true, videos: loadManimVideos(filePath) }; }
        catch (err) { return { success: false, error: err.message, videos: [] }; }
    });

    ipcMain.handle('manim:delete', async (event, { filePath, videoId }) => {
        try { return { success: deleteManimVideo(filePath, videoId) }; }
        catch (err) { return { success: false, error: err.message }; }
    });

    // Animation Engine management
    ipcMain.handle('animEngine:check', async () => {
        try { return await checkAnimEngine(); }
        catch (err) { return { installed: false, error: err.message }; }
    });

    ipcMain.handle('animEngine:install', async (event) => {
        try {
            return await installAnimEngine((msg) => {
                event.sender.send('animEngine:install:progress', msg);
            });
        } catch (err) { return { success: false, error: err.message }; }
    });
}

module.exports = { registerAnimationHandlers };
