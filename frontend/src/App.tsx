import { useState, useRef, useEffect, useCallback } from 'react';
import Split from 'react-split';
import MenuBar from './components/MenuBar/MenuBar';
import Sidebar from './components/Sidebar/Sidebar';
import ExplorerPanel from './components/ExplorerPanel/ExplorerPanel';
import RightSidebar from './components/RightSidebar/RightSidebar';
import AnimationTab from './components/AnimationTab/AnimationTab';
import { AnimationRecord } from './components/AnimationTab/AnimationTab';
import Workspace from './components/Workspace/Workspace';
import TerminalPanel, { TerminalPanelRef } from './components/TerminalPanel/TerminalPanel';
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

interface RuntimeInstallEvent {
  installId: string;
  runtimeId: string;
  runtimeName: string;
  type: 'start' | 'command' | 'stdout' | 'stderr' | 'error' | 'exit';
  message: string;
  timestamp: number;
  code?: number;
  signal?: string;
  success?: boolean;
}

interface RuntimeInstallState {
  installId: string | null;
  runtimeId: string | null;
  runtimeName: string | null;
  inProgress: boolean;
  succeeded: boolean | null;
  logs: string[];
}

const INITIAL_INSTALL_STATE: RuntimeInstallState = {
  installId: null,
  runtimeId: null,
  runtimeName: null,
  inProgress: false,
  succeeded: null,
  logs: [],
};

function App() {
  const [leftTab, setLeftTab] = useState('folder');
  const [rightTab, setRightTab] = useState('video');
  const [showTerminal, setShowTerminal] = useState(true);
  const [isTerminalMaximized, setIsTerminalMaximized] = useState(false);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const terminalRef = useRef<TerminalPanelRef>(null);
  const [_environments, setEnvironments] = useState<Record<string, RuntimeInfo>>({});
  const [isRunning, setIsRunning] = useState(false);
  // Mirror isRunning in a ref so keydown handler closure always reads fresh value
  const isRunningRef = useRef(false);
  const setIsRunningSync = (val: boolean) => {
    isRunningRef.current = val;
    setIsRunning(val);
  };

  const activeFileRef = useRef<OpenFile | null>(null);
  activeFileRef.current = openFiles.find(f => f.path === activeFilePath) || null;

  // LLM Animation system state
  const [animations, setAnimations] = useState<AnimationRecord[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [runtimeInstall, setRuntimeInstall] = useState<RuntimeInstallState>(INITIAL_INSTALL_STATE);

  const refreshEnvironments = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.scanEnvironments) return null;
    const envs = await api.scanEnvironments();
    setEnvironments(envs);
    return envs;
  }, []);

  const appendInstallLog = useCallback((line: string) => {
    setRuntimeInstall(prev => {
      const normalized = line.endsWith('\n') ? line : `${line}\n`;
      const nextLogs = [...prev.logs, normalized].slice(-500);
      return { ...prev, logs: nextLogs };
    });
  }, []);

  const installMissingRuntime = useCallback(async (runtime: RuntimeInfo | undefined, reason: string) => {
    const installCmd = runtime?.installCmd || '';
    const runtimeName = runtime?.name || 'Required runtime';

    setShowTerminal(true);

    if (!installCmd) {
      terminalRef.current?.sendCommandToTerminal(
        `echo "⚠️ ${reason}" && echo "No automatic install command is available for this OS/runtime."`
      );
      return;
    }

    const shouldInstall = window.confirm(
      `${reason}\n\nColon can run the recommended install command now:\n${installCmd}\n\n` +
      'Continue? You may be asked for sudo/admin password in terminal.'
    );

    if (!shouldInstall) {
      terminalRef.current?.sendCommandToTerminal(
        `echo "ℹ️ Installation cancelled. Run manually: ${installCmd}"`
      );
      return;
    }

    const api = (window as any).electronAPI;
    if (!api?.installRuntime) {
      terminalRef.current?.sendCommandToTerminal(
        `echo "⚠️ Installer API not available. Run manually: ${installCmd}"`
      );
      return;
    }

    setRuntimeInstall({
      installId: null,
      runtimeId: runtime?.id || null,
      runtimeName,
      inProgress: true,
      succeeded: null,
      logs: [
        `Starting installation for ${runtimeName}`,
        `Command: ${installCmd}`,
        'Waiting for installer output...'
      ]
    });

    const start = await api.installRuntime(runtime?.id);
    if (!start?.success) {
      setRuntimeInstall(prev => ({
        ...prev,
        inProgress: false,
        succeeded: false,
        logs: [...prev.logs, `Failed to start installer: ${start?.reason || 'Unknown error'}`]
      }));
      terminalRef.current?.sendCommandToTerminal(
        `echo "⚠️ Failed to start installer. Run manually: ${installCmd}"`
      );
      return;
    }

    setRuntimeInstall(prev => ({ ...prev, installId: start.installId }));
  }, []);

  // Scan environments on startup
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api) {
      refreshEnvironments().then((envs) => {
        if (envs) console.log('[App] Environments scanned:', envs);
      });
      // Check LLM status
      if (api.animation?.getLlmStatus) {
        api.animation.getLlmStatus().then((status: any) => {
          setLlmConfigured(status?.configured || false);
          console.log('[App] LLM status:', status);
        });
      }
    }
  }, [refreshEnvironments]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onRuntimeInstallEvent) return;

    const onEvent = async (evt: RuntimeInstallEvent) => {
      if (evt.type === 'start') {
        setRuntimeInstall(prev => ({
          ...prev,
          installId: evt.installId,
          runtimeId: evt.runtimeId,
          runtimeName: evt.runtimeName,
          inProgress: true,
          succeeded: null,
        }));
      }

      if (evt.type === 'command') appendInstallLog(`$ ${evt.message}`);
      if (evt.type === 'stdout') appendInstallLog(evt.message);
      if (evt.type === 'stderr') appendInstallLog(evt.message);
      if (evt.type === 'error') appendInstallLog(`ERROR: ${evt.message}`);

      if (evt.type === 'exit') {
        appendInstallLog(evt.message);
        const success = !!evt.success;
        setRuntimeInstall(prev => ({ ...prev, inProgress: false, succeeded: success }));
        await refreshEnvironments();
        terminalRef.current?.sendCommandToTerminal(
          `echo "${success ? '✅' : '⚠️'} ${evt.runtimeName} install ${success ? 'completed' : 'failed'}"`
        );
      }
    };

    api.onRuntimeInstallEvent(onEvent);
    return () => {
      api.removeRuntimeInstallListeners?.();
    };
  }, [appendInstallLog, refreshEnvironments]);

  const cancelRuntimeInstall = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!runtimeInstall.installId || !api?.cancelRuntimeInstall) return;
    const res = await api.cancelRuntimeInstall(runtimeInstall.installId);
    if (!res?.success) {
      appendInstallLog(`Cancel failed: ${res?.reason || 'Unknown error'}`);
      return;
    }
    appendInstallLog('Cancellation requested. Waiting for process exit...');
  }, [runtimeInstall.installId, appendInstallLog]);

  // Load saved animations when active file changes
  useEffect(() => {
    if (!activeFilePath) { setAnimations([]); return; }
    const api = (window as any).electronAPI;
    if (!api?.animation?.loadAnimations) return;

    api.animation.loadAnimations(activeFilePath).then((result: any) => {
      if (result.success) setAnimations(result.animations || []);
      else setAnimations([]);
    }).catch(() => setAnimations([]));
  }, [activeFilePath]);

  // Generate animation for a code block (called when user clicks gutter play icon)
  const handleGenerateAnimation = useCallback(async (filePath: string, code: string, language: string, blockInfo: any) => {
    const api = (window as any).electronAPI;
    if (!api?.animation?.generateAnimation || isGenerating) return;

    // Save file first if dirty
    const file = openFiles.find(f => f.path === filePath);
    if (file?.isDirty) await saveActiveFile();

    setIsGenerating(true);
    setRightTab('video'); // Show animation panel
    try {
      const result = await api.animation.generateAnimation(filePath, code, language, blockInfo);
      if (result.success && result.record) {
        setAnimations(prev => [...prev, result.record]);
      } else {
        console.error('[App] Animation generation failed:', result.error);
      }
    } catch (err) {
      console.error('[App] Animation error:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, openFiles]);

  // Delete a single animation
  const handleDeleteAnimation = useCallback(async (animId: string) => {
    const api = (window as any).electronAPI;
    const file = activeFileRef.current;
    if (!api?.animation?.deleteAnimation || !file) return;

    await api.animation.deleteAnimation(file.path, animId);
    setAnimations(prev => prev.filter(a => a.id !== animId));
  }, []);

  // Clear all animations for the active file
  const handleClearAnimations = useCallback(async () => {
    const api = (window as any).electronAPI;
    const file = activeFileRef.current;
    if (!api?.animation?.clearAnimations || !file) return;

    await api.animation.clearAnimations(file.path);
    setAnimations([]);
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
      default:
        break;
    }
  };

  const handleOpenFile = async (filePath: string, name: string) => {
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

  const saveActiveFile = async () => {
    const fileToSave = activeFileRef.current;
    if (!fileToSave || !fileToSave.isDirty) return;

    const electron = (window as any).electronAPI;
    if (electron) {
      const success = await electron.writeFile(fileToSave.path, fileToSave.content);
      if (success) {
        setOpenFiles(prev => prev.map(f =>
          f.path === fileToSave.path ? { ...f, isDirty: false } : f
        ));
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S — save
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        saveActiveFile();
      }
      // Ctrl+W — close active tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        const file = activeFileRef.current;
        if (file) handleCloseFileRef.current(file.path);
      }
      // Ctrl+F5 — run active file (read isRunning from ref to avoid stale closure)
      if ((e.ctrlKey || e.metaKey) && e.key === 'F5' && !e.shiftKey) {
        e.preventDefault();
        if (!isRunningRef.current) runActiveFile();
      }
      // Ctrl+Shift+F5 — stop
      if ((e.ctrlKey || e.metaKey) && e.key === 'F5' && e.shiftKey) {
        e.preventDefault();
        stopRunningCode();
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

  const workspaceTopContent = (
    rightTab === 'video' ? (
      <Split className="split split-horizontal" sizes={[70, 30]} minSize={[280, 220]} gutterSize={2} snapOffset={20}>
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
        />
        <AnimationTab
          animations={animations}
          isGenerating={isGenerating}
          onDeleteAnimation={handleDeleteAnimation}
          onClearAll={handleClearAnimations}
          llmConfigured={llmConfigured}
        />
      </Split>
    ) : (
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
      />
    )
  );

  /**
   * Layout strategy: TerminalPanel lives at a FIXED position in the React tree,
   * outside the leftTab conditional, so it's never unmounted by sidebar tab changes.
   * Visibility is controlled purely via CSS height/overflow so that:
   *   - PTY processes stay alive across hide/show and tab-switch cycles
   *   - activeTId is always valid when Run is clicked
   *   - sendCommandToTerminal works immediately without timing hacks
   */

  /* Editor area content — the leftTab conditional only controls this part */
  const editorArea = leftTab === 'folder' ? (
    <Split
      className="split split-horizontal"
      sizes={[18, 82]}
      minSize={[140, 300]}
      gutterSize={2}
      snapOffset={10}
    >
      <ExplorerPanel onFileClick={handleOpenFile} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
        {workspaceTopContent}
      </div>
    </Split>
  ) : (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
      {workspaceTopContent}
    </div>
  );

  return (
    <div className="app-container">
      <MenuBar onTerminalAction={handleTerminalAction} activeFileName={activeFileRef.current?.name} />
      <div className="main-content">
        <Sidebar activeTab={leftTab} setActiveTab={setLeftTab} showTerminal={showTerminal} setShowTerminal={setShowTerminal} />

        {/* Outer column: editor on top, terminal on bottom — FIXED tree position */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', height: '100%' }}>
          {/* Editor area — hidden (not unmounted) when terminal is maximised */}
          <div style={{
            flex: 1,
            overflow: 'hidden',
            minHeight: 0,
            display: isTerminalMaximized ? 'none' : 'flex',
            flexDirection: 'column',
          }}>
            {editorArea}
          </div>

          {/* Terminal area — ALWAYS in the DOM, height controlled by CSS only */}
          <div style={
            isTerminalMaximized
              ? { flex: 1, overflow: 'hidden', minHeight: 0 }
              : showTerminal
                ? { height: '38%', overflow: 'hidden', flexShrink: 0 }
                : { height: 0, overflow: 'hidden', flexShrink: 0 }
          }>
            <TerminalPanel
              ref={terminalRef}
              onClose={toggleTerminal}
              onMaximize={toggleMaximize}
              isMaximized={isTerminalMaximized}
            />
          </div>
        </div>

        <RightSidebar activeTab={rightTab} setActiveTab={setRightTab} />
      </div>

      {runtimeInstall.runtimeName && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            width: 'min(520px, calc(100vw - 32px))',
            maxHeight: 300,
            background: '#0f1726',
            border: '1px solid #2a3a5f',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            background: '#101c33',
            borderBottom: '1px solid #233251'
          }}>
            <strong style={{ fontSize: 13 }}>
              Runtime Install: {runtimeInstall.runtimeName}
              {runtimeInstall.inProgress ? ' (in progress)' : runtimeInstall.succeeded === true ? ' (done)' : runtimeInstall.succeeded === false ? ' (failed)' : ''}
            </strong>
            <div style={{ display: 'flex', gap: 8 }}>
              {runtimeInstall.inProgress && (
                <button className="run-btn stop" onClick={cancelRuntimeInstall} title="Cancel installation">
                  Cancel
                </button>
              )}
              {!runtimeInstall.inProgress && (
                <button
                  className="run-btn"
                  onClick={() => setRuntimeInstall(INITIAL_INSTALL_STATE)}
                  title="Dismiss install panel"
                >
                  Close
                </button>
              )}
            </div>
          </div>
          <pre
            style={{
              margin: 0,
              padding: 10,
              overflow: 'auto',
              color: '#dbe7ff',
              fontSize: 12,
              lineHeight: 1.35,
              background: '#0b1424',
              whiteSpace: 'pre-wrap'
            }}
          >
            {runtimeInstall.logs.join('') || 'Waiting for logs...'}
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;
