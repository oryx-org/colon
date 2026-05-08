import { useState, useRef, useEffect, useCallback } from 'react';
import Split from 'react-split';
import MenuBar from './components/MenuBar/MenuBar';
import Sidebar from './components/Sidebar/Sidebar';
import ExplorerPanel from './components/ExplorerPanel/ExplorerPanel';
import RightSidebar from './components/RightSidebar/RightSidebar';
import AnimationTab, { AnimationRecord } from './components/AnimationTab/AnimationTab';
import Workspace from './components/Workspace/Workspace';
import TerminalPanel, { TerminalPanelRef } from './components/TerminalPanel/TerminalPanel';
import StatusBar from './components/StatusBar/StatusBar';
import SearchPanel from './components/SearchPanel/SearchPanel';
import LanguageManagerPanel from './components/LanguageManagerPanel/LanguageManagerPanel';
import CommandPalette from './components/CommandPalette/CommandPalette';
import SettingsModal, { loadSettings } from './components/SettingsModal/SettingsModal';
import './styles/global.css';

export interface OpenFile {
  name: string;
  path: string;
  language: string;
  content: string;
  isDirty?: boolean;
}

export interface RuntimeInfo {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  command: string;
  extensions: string[];
  installCmd: string | null;
}




function App() {
  const [leftTab, setLeftTab] = useState('folder');
  const [rightTab, setRightTab] = useState('none');
  const [showTerminal, setShowTerminal] = useState(true);
  const [isTerminalMaximized, setIsTerminalMaximized] = useState(false);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const terminalRef = useRef<TerminalPanelRef>(null);
  const [_environments, setEnvironments] = useState<Record<string, RuntimeInfo>>({});
  const [isRunning, setIsRunning] = useState(false);

  // Split sizes - persist across tab changes for VSCode-like behavior
  const [leftPanelSize, setLeftPanelSize] = useState(20);
  const [terminalHeight, setTerminalHeight] = useState(38);
  // Mirror isRunning in a ref so keydown handler closure always reads fresh value
  const isRunningRef = useRef(false);
  const setIsRunningSync = (val: boolean) => {
    isRunningRef.current = val;
    setIsRunning(val);
  };

  const activeFileRef = useRef<OpenFile | null>(null);
  activeFileRef.current = openFiles.find(f => f.path === activeFilePath) || null;

  // LLM Animation system state — keyed by file path to prevent cross-file collision
  const [animsByFile, setAnimsByFile] = useState<Record<string, AnimationRecord[]>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [animError, setAnimError] = useState<string | null>(null);

  // Manim video state — keyed by file path
  const [manimVideosByFile, setManimVideosByFile] = useState<Record<string, any[]>>({});
  const [isManimRendering, setIsManimRendering] = useState(false);
  const [manimError, setManimError] = useState<string | null>(null);
  const [animEngineInstalled, setAnimEngineInstalled] = useState(false);

  // Derive current file's data
  const animations = activeFilePath ? (animsByFile[activeFilePath] || []) : [];
  const manimVideos = activeFilePath ? (manimVideosByFile[activeFilePath] || []) : [];
  const activeFileLineCount = activeFilePath ? (openFiles.find(f => f.path === activeFilePath)?.content?.split('\n').length || 0) : 0;
  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1 });
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [animWidth, setAnimWidth] = useState(500);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(() => loadSettings());

  useEffect(() => {
    const theme = settings?.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, [settings?.theme]);

  const refreshEnvironments = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.scanEnvironments) return null;
    const envs = await api.scanEnvironments();
    setEnvironments(envs);
    return envs;
  }, []);


  const installMissingRuntime = useCallback(async (runtime: RuntimeInfo | undefined, reason: string) => {
    const runtimeName = runtime?.name || 'Required runtime';

    setShowTerminal(true);

    if (!runtime?.id) {
      terminalRef.current?.sendCommandToTerminal(
        `echo "⚠️ ${reason}" && echo "No automatic install command is available for this OS/runtime."`
      );
      return;
    }

    const api = (window as any).electronAPI;
    if (!api?.getInstallCommand) {
      terminalRef.current?.sendCommandToTerminal(
        `echo "⚠️ Installer API not available."`
      );
      return;
    }

    const result = await api.getInstallCommand(runtime.id);
    if (!result?.success) {
      terminalRef.current?.sendCommandToTerminal(
        `echo "⚠️ ${result?.reason || `No install command available for ${runtimeName}`}"`
      );
      return;
    }

    const shouldInstall = window.confirm(
      `${reason}\n\nColon will run the install command in terminal:\n${result.command}\n\n` +
      'Continue? You can interact with the terminal during installation.'
    );

    if (!shouldInstall) {
      terminalRef.current?.sendCommandToTerminal(
        `echo "ℹ️ Installation cancelled. Run manually: ${result.command}"`
      );
      return;
    }

    // Send the command to the terminal
    terminalRef.current?.sendCommandToTerminal(result.command);
  }, []);

  // Scan environments on startup
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api) {
      refreshEnvironments().then((envs) => {
        if (envs) console.log('[App] Environments scanned:', envs);
        return undefined;
      }).catch((err: any) => console.error('[App] Failed to scan environments:', err));
      // Check LLM status
      if (api.animation?.getLlmStatus) {
        api.animation.getLlmStatus().then((status: any) => {
          setLlmConfigured(status?.configured || false);
          console.log('[App] LLM status:', status);
          return undefined;
        }).catch((err: any) => console.error('[App] Failed to get LLM status:', err));
      }
      // Check animation engine status
      if (api.animEngine?.check) {
          api.animEngine.check().then((status: any) => {
              setAnimEngineInstalled(status?.installed || false);
              return undefined;
          }).catch((err: any) => console.error('[App] Failed to check anim engine:', err));
      }
    }
  }, [refreshEnvironments]);

  // Refresh animation engine status when opening the animation tab
  useEffect(() => {
    if (rightTab === 'video') {
      const api = (window as any).electronAPI;
      if (api?.animEngine?.check) {
        api.animEngine.check().then((status: any) => {
            setAnimEngineInstalled(status?.installed || false);
            return undefined;
        }).catch((err: any) => console.error('[App] Failed to check anim engine:', err));
      }
    }
  }, [rightTab]);



  // Load saved animations when active file changes
  useEffect(() => {
    if (!activeFilePath) return;
    // If we already loaded animations for this file, skip the IPC call
    if (animsByFile[activeFilePath]) return;

    const api = (window as any).electronAPI;
    if (!api?.animation?.loadAnimations) return;

    api.animation.loadAnimations(activeFilePath).then((result: any) => {
      if (result.success) {
        setAnimsByFile(prev => ({ ...prev, [activeFilePath]: result.animations || [] }));
      } else {
        setAnimsByFile(prev => ({ ...prev, [activeFilePath]: [] }));
      }
      return undefined;
    }).catch(() => {
      setAnimsByFile(prev => ({ ...prev, [activeFilePath]: [] }));
    });
  }, [activeFilePath]);

  // Generate animation for a code block (called when user clicks gutter play icon)
  const handleGenerateAnimation = useCallback(async (filePath: string, code: string, language: string, blockInfo: any) => {
    const api = (window as any).electronAPI;
    if (!api?.animation?.generateAnimation || isGenerating) return;

    // Save file first if dirty
    const file = openFiles.find(f => f.path === filePath);
    if (file?.isDirty) await saveActiveFile();

    setIsGenerating(true);
    setAnimError(null);
    setRightTab('video'); // Show animation panel
    try {
      const result = await api.animation.generateAnimation(filePath, code, language, blockInfo);
      if (result.success && result.record) {
        setAnimsByFile(prev => ({
          ...prev,
          [filePath]: [...(prev[filePath] || []), result.record]
        }));
      } else {
        setAnimError(result.error || 'Animation generation failed');
        console.error('[App] Animation generation failed:', result.error);
      }
    } catch (err: any) {
      setAnimError(err.message || 'Unknown error');
      console.error('[App] Animation error:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, openFiles]);

  const handleCancelAnimation = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (api?.animation?.cancel) {
      await api.animation.cancel();
      setIsGenerating(false);
      setAnimError("Animation generation stopped by user.");
    }
  }, []);

  // Delete a single animation
  const handleDeleteAnimation = useCallback(async (animId: string) => {
    const api = (window as any).electronAPI;
    const file = activeFileRef.current;
    if (!api?.animation?.deleteAnimation || !file) return;

    await api.animation.deleteAnimation(file.path, animId);
    setAnimsByFile(prev => ({
      ...prev,
      [file.path]: (prev[file.path] || []).filter(a => a.id !== animId)
    }));
  }, []);

  // Clear all animations for the active file
  const handleClearAnimations = useCallback(async () => {
    const api = (window as any).electronAPI;
    const file = activeFileRef.current;
    if (!api?.animation?.clearAnimations || !file) return;

    await api.animation.clearAnimations(file.path);
    setAnimsByFile(prev => ({ ...prev, [file.path]: [] }));
  }, []);

  // Load Manim videos when active file changes
  useEffect(() => {
    if (!activeFilePath) return;
    if (manimVideosByFile[activeFilePath]) return;

    const api = (window as any).electronAPI;
    if (!api?.manim?.loadVideos) return;

    api.manim.loadVideos(activeFilePath).then((result: any) => {
      if (result.success) {
        setManimVideosByFile(prev => ({ ...prev, [activeFilePath]: result.videos || [] }));
      }
      return undefined;
    }).catch(() => {});
  }, [activeFilePath]);

  // Generate Manim video for the active file
  const handleGenerateManimVideo = useCallback(async () => {
    const api = (window as any).electronAPI;
    const file = activeFileRef.current;
    if (!api?.manim?.generate || !file || isManimRendering) return;

    if (file.isDirty) await saveActiveFile();

    setIsManimRendering(true);
    setManimError(null);
    setRightTab('video');
    try {
      const result = await api.manim.generate(file.path, file.content, file.language);
      if (result.success && result.record) {
        setManimVideosByFile(prev => ({
          ...prev,
          [file.path]: [...(prev[file.path] || []), result.record]
        }));
      } else {
        setManimError(result.error || 'Video generation failed');
      }
    } catch (err: any) {
      setManimError(err.message || 'Unknown error');
    } finally {
      setIsManimRendering(false);
    }
  }, [isManimRendering]);

  const handleCancelManimVideo = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (api?.manim?.cancel) {
      await api.manim.cancel();
      setIsManimRendering(false);
      setManimError("Video generation stopped by user.");
    }
  }, []);

  // Delete a Manim video
  const handleDeleteManimVideo = useCallback(async (videoId: string) => {
    const api = (window as any).electronAPI;
    const file = activeFileRef.current;
    if (!api?.manim?.deleteVideo || !file) return;

    await api.manim.deleteVideo(file.path, videoId);
    setManimVideosByFile(prev => ({
      ...prev,
      [file.path]: (prev[file.path] || []).filter((v: any) => v.id !== videoId)
    }));
  }, []);

  const handleTerminalAction = (action: string) => {
    switch (action) {
      case 'toggleTerminal':
        setShowTerminal(v => !v);
        break;
      case 'newTerminal':
        setShowTerminal(true);
        setTimeout(() => terminalRef.current?.createTerminal(), 0);
        break;
      case 'splitTerminal':
        setShowTerminal(true);
        setTimeout(() => terminalRef.current?.splitTerminal(), 0);
        break;
      case 'killTerminal':
        terminalRef.current?.killActiveTerminal();
        break;
      case 'clearTerminal':
        terminalRef.current?.clearTerminal();
        break;
      default:
        break;
    }
  };

  const handleMenuAction = (action: string) => {
    switch(action) {
      case 'newFile':
        setLeftTab('folder');
        window.dispatchEvent(new CustomEvent('explorer-action', { detail: 'newFile' }));
        break;
      case 'newWindow':
        if ((window as any).electronAPI?.newWindow) {
          (window as any).electronAPI.newWindow();
        }
        break;
      case 'openFolder':
        setLeftTab('folder');
        window.dispatchEvent(new CustomEvent('explorer-action', { detail: 'openFolder' }));
        break;
      case 'openFile':
        window.dispatchEvent(new CustomEvent('explorer-action', { detail: 'openFile' }));
        break;
      case 'saveFile':
        saveActiveFile();
        break;
      case 'saveAllFiles':
        saveAllFiles();
        break;
      case 'closeEditor':
        if (activeFileRef.current) handleCloseFileRef.current(activeFileRef.current.path);
        break;
      case 'undo':
      case 'redo':
      case 'cut':
      case 'copy':
      case 'paste':
      case 'selectAll':
      case 'expandSelection':
      case 'addCursorAbove':
      case 'addCursorBelow':
      case 'goToLine':
      case 'navigateBack':
      case 'navigateForward':
        window.dispatchEvent(new CustomEvent('editor-action', { detail: action }));
        break;
      case 'openCommandPalette':
        setShowCommandPalette(true);
        break;
      case 'openSettings':
        setShowSettings(true);
        break;
      case 'toggleExplorer':
        setLeftTab(prev => (prev === 'folder' ? 'none' : 'folder'));
        break;
      case 'toggleSearch':
        setLeftTab(prev => (prev === 'search' ? 'none' : 'search'));
        break;
      case 'runCode':
        runActiveFile();
        break;
      case 'stopCode':
        stopRunningCode();
        break;
      case 'zoomIn':
        setSettings(prev => {
          const newSet = { ...prev, fontSize: Math.min(prev.fontSize + 2, 32) };
          localStorage.setItem('colon_settings', JSON.stringify(newSet));
          return newSet;
        });
        break;
      case 'zoomOut':
        setSettings(prev => {
          const newSet = { ...prev, fontSize: Math.max(prev.fontSize - 2, 8) };
          localStorage.setItem('colon_settings', JSON.stringify(newSet));
          return newSet;
        });
        break;
      case 'toggleSidebar':
        setLeftTab(prev => (prev === 'none' ? 'folder' : 'none'));
        break;
      case 'startDebugging':
        setLeftTab('debug');
        break;
      case 'addBreakpoint':
        setLeftTab('debug');
        break;
      case 'showAbout':
      case 'showWelcome':
      case 'showDocs':
        console.info('Colon IDE v1.0 — Built for the Web & Desktop.');
        break;
    }
  };

  const handleOpenFile = async (filePath: string, name: string) => {
    // Ensure transient overlays never block editor interaction after selecting a file.
    setShowCommandPalette(false);
    setShowSettings(false);

    const existing = openFiles.find(f => f.path === filePath);
    if (existing) {
      setActiveFilePath(filePath);
      return;
    }

    // Block binary / non-text file types from being opened in Monaco
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const BINARY_EXTENSIONS = new Set([
      'png','jpg','jpeg','gif','webp','bmp','ico','tiff','svg',
      'pdf','doc','docx','xls','xlsx','ppt','pptx',
      'zip','tar','gz','7z','rar',
      'exe','dll','so','bin','dmg','app',
      'mp3','mp4','wav','avi','mov','mkv','webm',
      'ttf','woff','woff2','eot',
      'class','pyc','pyo',
    ]);
    if (BINARY_EXTENSIONS.has(ext)) {
      console.warn(`[App] Skipping binary file: ${name}`);
      // Still select it in the tree but don't open in Monaco
      return;
    }

    const electron = (window as any).electronAPI;
    if (electron) {
      try {
        const content = await electron.readFile(filePath);
        console.log(`[App] Read file ${filePath}, content length: ${content?.length}`);
        const languageMap: Record<string, string> = {
          'js': 'javascript', 'jsx': 'javascript', 'mjs': 'javascript',
          'ts': 'typescript', 'tsx': 'typescript',
          'py': 'python', 'pyw': 'python',
          'java': 'java',
          'c': 'c', 'h': 'c',
          'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'hpp': 'cpp',
          'cs': 'csharp',
          'go': 'go',
          'rs': 'rust',
          'rb': 'ruby',
          'php': 'php',
          'html': 'html', 'htm': 'html',
          'css': 'css', 'scss': 'scss', 'less': 'less',
          'json': 'json',
          'xml': 'xml',
          'md': 'markdown', 'mdx': 'markdown',
          'yaml': 'yaml', 'yml': 'yaml',
          'sql': 'sql',
          'sh': 'shell', 'bash': 'shell', 'zsh': 'shell',
          'ps1': 'powershell',
          'dockerfile': 'dockerfile',
          'r': 'r',
          'swift': 'swift',
          'kt': 'kotlin', 'kts': 'kotlin',
          'lua': 'lua',
          'pl': 'perl',
          'toml': 'ini',
          'ini': 'ini',
          'bat': 'bat', 'cmd': 'bat',
          'graphql': 'graphql', 'gql': 'graphql',
        };
        const language = languageMap[ext] || 'plaintext';

        const newFile: OpenFile = { name, path: filePath, language, content, isDirty: false };
        setOpenFiles(prev => [...prev, newFile]);
        setActiveFilePath(filePath);
      } catch (err) {
        console.error("Failed to read file", err);
      }
    } else {
      console.warn("electronAPI not available, using mock");
      setOpenFiles(prev => [...prev, { name, path: filePath, language: 'javascript', content: '// mock content', isDirty: false }]);
      setActiveFilePath(filePath);
    }
  };

  const handleFileChange = (filePath: string, newContent: string) => {
    setOpenFiles(prev => prev.map(f =>
      f.path === filePath ? { ...f, content: newContent, isDirty: true } : f
    ));
  };

  const openFilesRef = useRef(openFiles);
  openFilesRef.current = openFiles;

  const saveActiveFile = async () => {
    const fileToSave = activeFileRef.current;
    if (!fileToSave || !fileToSave.isDirty) return;

    if (settings?.formatOnSave) {
      window.dispatchEvent(new CustomEvent('editor-action', { detail: 'formatDocument' }));
      // Give the editor 50ms to apply formatting changes before dumping to disk
      await new Promise<void>(r => setTimeout(r, 50));
    }

    const electron = (window as any).electronAPI;
    if (electron) {
      // Use ref to get the latest content (avoids stale closure)
      const latestFile = openFilesRef.current.find(f => f.path === fileToSave.path);
      const contentToSave = latestFile?.content || fileToSave.content;
      const success = await electron.writeFile(fileToSave.path, contentToSave);
      if (success) {
        setOpenFiles(prev => prev.map(f =>
          f.path === fileToSave.path ? { ...f, isDirty: false } : f
        ));
      }
    }
  };

  const saveAllFiles = async () => {
    const electron = (window as any).electronAPI;
    if (!electron) return;

    const dirtyFiles = openFiles.filter(f => f.isDirty);
    for (const file of dirtyFiles) {
      const success = await electron.writeFile(file.path, file.content);
      if (success) {
        setOpenFiles(prev => prev.map(f =>
          (f.path === file.path ? { ...f, isDirty: false } : f)
        ));
      }
    }
  };

  /** When a file is renamed in the explorer, update open tabs to match */
  const handleFileRenamed = (oldPath: string, newPath: string) => {
    const sepIdx = Math.max(newPath.lastIndexOf('/'), newPath.lastIndexOf('\\'));
    const newName = newPath.substring(sepIdx + 1);
    const ext = newName.substring(newName.lastIndexOf('.') + 1).toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
      'py': 'python', 'java': 'java', 'c': 'c', 'cpp': 'cpp', 'h': 'c', 'hpp': 'cpp',
      'html': 'html', 'css': 'css', 'json': 'json', 'md': 'markdown',
      'go': 'go', 'rs': 'rust', 'rb': 'ruby', 'php': 'php',
      'sh': 'shell', 'bash': 'shell', 'yml': 'yaml', 'yaml': 'yaml',
      'xml': 'xml', 'sql': 'sql', 'kt': 'kotlin', 'swift': 'swift',
    };
    const newLang = languageMap[ext] || 'plaintext';

    setOpenFiles(prev => prev.map(f => {
      // Direct match
      if (f.path === oldPath) {
        return { ...f, path: newPath, name: newName, language: newLang };
      }
      // If a folder was renamed, update all children
      // Check both / and \ separators for cross-platform support
      if (f.path.startsWith(`${oldPath}/`) || f.path.startsWith(`${oldPath}\\`)) {
        const updatedPath = `${newPath}${f.path.substring(oldPath.length)}`;
        return { ...f, path: updatedPath };
      }
      return f;
    }));

    // Update active file path if needed
    if (activeFilePath === oldPath) {
      setActiveFilePath(newPath);
    } else if (activeFilePath?.startsWith(`${oldPath}/`) || activeFilePath?.startsWith(`${oldPath}\\`)) {
      setActiveFilePath(`${newPath}${activeFilePath.substring(oldPath.length)}`);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command Palette (Ctrl+Shift+P)
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'P') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      // Global Search (Ctrl+Shift+F)
      else if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'F') {
        e.preventDefault();
        setLeftTab('search');
      }
      // Ctrl+S / Cmd+S — save
      else if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        saveActiveFile();
      }
      // Ctrl+W — close active tab
      else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        const file = activeFileRef.current;
        if (file) handleCloseFileRef.current(file.path);
      }
      // Ctrl+Shift+F5 — stop (must check before F5-run to avoid shadowing)
      else if ((e.ctrlKey || e.metaKey) && e.key === 'F5' && e.shiftKey) {
        e.preventDefault();
        stopRunningCode();
      }
      // Ctrl+F5 or F5 — run active file
      else if (e.key === 'F5' && !e.shiftKey) {
        e.preventDefault();
        if (!isRunningRef.current) runActiveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /**
   * Run active file — the VS Code way:
   * 1. Save file if dirty
   * 2. Ask backend for the shell command (e.g., "python3 /path/to/file.py")
   * 3. Type that command into the active terminal PTY
   * This means stdin, stdout, colors, and user input all work natively!
   */
  const runActiveFile = async () => {
    const file = activeFileRef.current;
    if (!file || isRunningRef.current) return;

    try {
      // Save first
      if (file.isDirty) await saveActiveFile();

      const api = (window as any).electronAPI;
      if (!api) return;

      // Get the run command from backend
      const result = await api.getRunCommand(file.path);

      if (!result.success) {
        await installMissingRuntime(result.runtime, result.reason);
        return;
      }

      // Show terminal and reveal it
      setShowTerminal(true);
      setIsRunningSync(true);
      // Terminal is always mounted, so send the command immediately
      terminalRef.current?.sendCommandToTerminal(result.command);
      // Auto-reset the Run button after 1.5s — we can't reliably detect PTY process exit,
      // but this lets the user re-run quickly. Ctrl+C still stops long-running programs.
      setTimeout(() => setIsRunningSync(false), 1500);
    } catch (err) {
      console.error('[App] runActiveFile error:', err);
      setIsRunningSync(false);
    }
  };

  const stopRunningCode = () => {
    // Send raw Ctrl+C to the active terminal to interrupt the running process
    // Must NOT append '\n' — it's a control character, not a command
    terminalRef.current?.sendRawToTerminal('\x03');
    setIsRunningSync(false);
  };

  const handleCloseFile = (filePath: string) => {
    const file = openFiles.find(f => f.path === filePath);
    if (file?.isDirty) {
      const ok = window.confirm(`"${file.name}" has unsaved changes. Close anyway?`);
      if (!ok) return;
    }
    setOpenFiles(prev => {
      const next = prev.filter(f => f.path !== filePath);
      if (activeFilePath === filePath) {
        setActiveFilePath(next.length > 0 ? next[next.length - 1].path : null);
      }
      return next;
    });
  };

  // Stable ref so the keydown handler (empty-dep effect) can always call the latest version
  const handleCloseFileRef = useRef(handleCloseFile);
  handleCloseFileRef.current = handleCloseFile;

  const toggleTerminal = () => setShowTerminal(v => !v);
  const toggleMaximize = () => setIsTerminalMaximized(v => !v);

  const handleAnimResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = animWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX; // Leftward drag increases width
      const newWidth = Math.max(300, Math.min(800, startWidth + delta));
      setAnimWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const workspaceTopContent = (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
        <Workspace
          openFiles={openFiles}
          activeFilePath={activeFilePath}
          setActiveFilePath={setActiveFilePath}
          onCloseFile={handleCloseFile}
          onFileChange={handleFileChange}
          onRunFile={runActiveFile}
          onStopRun={stopRunningCode}
          isRunning={isRunning}
          onGenerateAnimation={handleGenerateAnimation}
          onCursorChange={(line, col) => setCursorPos({ line, column: col })}
          settings={settings}
        />
      </div>
      
      {rightTab === 'video' && (
        <div 
          onMouseDown={handleAnimResize}
          style={{
            width: '4px',
            backgroundColor: 'var(--bg-border)',
            cursor: 'col-resize',
            zIndex: 10,
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-blue)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-border)'}
        />
      )}

      <div 
        style={{ 
          display: rightTab === 'video' ? 'block' : 'none', 
          width: `${animWidth}px`,
          height: '100%', 
          backgroundColor: 'var(--bg-panel)',
          overflow: 'hidden'
        }}
      >
        <AnimationTab
          animations={animations}
          isGenerating={isGenerating}
          onDeleteAnimation={handleDeleteAnimation}
          onClearAll={handleClearAnimations}
          llmConfigured={llmConfigured}
          animError={animError}
          activeFileName={activeFileRef.current?.name || ''}
          manimVideos={manimVideos}
          isManimRendering={isManimRendering}
          manimError={manimError}
          onGenerateManimVideo={handleGenerateManimVideo}
          onDeleteManimVideo={handleDeleteManimVideo}
          onCancelAnimation={handleCancelAnimation}
          onCancelManimVideo={handleCancelManimVideo}
          activeFileLineCount={activeFileLineCount}
          animEngineInstalled={animEngineInstalled}
        />
      </div>
    </div>
  );

  /**
   * Layout strategy: TerminalPanel lives at a FIXED position in the React tree,
   * outside the leftTab conditional, so it's never unmounted by sidebar tab changes.
   * Visibility is controlled purely via CSS height/overflow so that:
   *   - PTY processes stay alive across hide/show and tab-switch cycles
   *   - activeTId is always valid when Run is clicked
   *   - sendCommandToTerminal works immediately without timing hacks
   */

  const leftArea = (
    <div className={leftTab === 'none' ? 'split-left-area-hidden' : 'split-left-area-visible'}>
      <div style={{ display: leftTab === 'folder' ? 'flex' : 'none', flex: 1, height: '100%', width: '100%' }}>
        <ExplorerPanel onFileClick={handleOpenFile} onFileRenamed={handleFileRenamed} />
      </div>
      <div style={{ display: leftTab === 'search' ? 'flex' : 'none', flex: 1, height: '100%', width: '100%' }}>
        <SearchPanel onFileClick={handleOpenFile} />
      </div>
      <div style={{ display: leftTab === 'category' ? 'flex' : 'none', flex: 1, height: '100%', width: '100%' }}>
        <LanguageManagerPanel 
                onRunInTerminal={(cmd: string) => {
                  setShowTerminal(true);
                  setTimeout(() => terminalRef.current?.sendCommandToTerminal(cmd), 100);
                }}
                onShowTerminal={() => setShowTerminal(true)}
              />
      </div>
    </div>
  );

  const centerEditorAndTerminal = (
    <div className="split-center-area">
      {isTerminalMaximized ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Hide the editor but keep it in the DOM so it doesn't unmount */}
          <div style={{ height: 0, overflow: 'hidden' }}>
            {workspaceTopContent}
          </div>
          <TerminalPanel
            ref={terminalRef}
            onClose={toggleTerminal}
            onMaximize={toggleMaximize}
            isMaximized={isTerminalMaximized}
          />
        </div>
      ) : showTerminal ? (
        <Split
          className="split split-vertical"
          sizes={[100 - terminalHeight, terminalHeight]}
          minSize={[100, 100]}
          gutterSize={2}
          snapOffset={20}
          direction="vertical"
          onDragEnd={(sizes: number[]) => {
            setTerminalHeight(sizes[1]);
          }}
        >
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            {workspaceTopContent}
          </div>
          <TerminalPanel
            ref={terminalRef}
            onClose={toggleTerminal}
            onMaximize={toggleMaximize}
            isMaximized={isTerminalMaximized}
          />
        </Split>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {workspaceTopContent}
        </div>
      )}
    </div>
  );

  const mainSplitArea = (
    <Split
      className="split split-horizontal"
      sizes={leftTab === 'none' ? [0, 100] : [leftPanelSize, 100 - leftPanelSize]}
      minSize={leftTab === 'none' ? [0, 300] : [180, 300]}
      gutterSize={2}
      snapOffset={10}
      onDragEnd={(sizes: number[]) => {
        if (leftTab !== 'none') {
          const clamped = Math.max(14, Math.min(36, sizes[0]));
          setLeftPanelSize(clamped);
        }
      }}
    >
      {leftArea}
      {centerEditorAndTerminal}
    </Split>
  );

  return (
    <div className="app-container">
      <MenuBar onTerminalAction={handleTerminalAction} onMenuAction={handleMenuAction} activeFileName={activeFileRef.current?.name} />
      <div className="main-content">
        <Sidebar activeTab={leftTab} setActiveTab={setLeftTab} showTerminal={showTerminal} setShowTerminal={setShowTerminal} onSettingsClick={() => setShowSettings(true)} />

        {/* Outer column: Flex container wrapper for the main split layout */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', height: '100%' }}>
          {mainSplitArea}
        </div>

        <RightSidebar activeTab={rightTab} setActiveTab={setRightTab} />
      </div>

      <StatusBar
        language={activeFileRef.current?.language || 'plaintext'}
        line={cursorPos.line}
        column={cursorPos.column}
      />

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={[
          { id: '1', category: 'File', label: 'Save', shortcut: 'Ctrl+S', action: saveActiveFile },
          { id: '2', category: 'File', label: 'Close Workspace', action: () => setOpenFiles([]) },
          { id: '3', category: 'View', label: 'Toggle Search', shortcut: 'Ctrl+Shift+F', action: () => setLeftTab(l => (l === 'search' ? 'folder' : 'search')) },
          { id: '4', category: 'View', label: 'Toggle Terminal', action: toggleTerminal },
          { id: '8', category: 'Preferences', label: 'Open Settings', shortcut: 'Ctrl+,', action: () => setShowSettings(true) },
          { id: '5', category: 'Run', label: 'Run Code', shortcut: 'F5', action: runActiveFile },
          { id: '6', category: 'Run', label: 'Stop Running Code', action: stopRunningCode },
          { id: '7', category: 'AI', label: 'Toggle Animation Tab', action: () => setRightTab(r => (r === 'video' ? 'none' : 'video')) }
        ]}
      />

    <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
        onSettingsChange={setSettings} 
      />
    </div>
  );
}

export default App;
