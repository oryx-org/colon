import { useState, useRef, useEffect } from 'react';
import Split from 'react-split';
import MenuBar from './components/MenuBar/MenuBar';
import Sidebar from './components/Sidebar/Sidebar';
import ExplorerPanel from './components/ExplorerPanel/ExplorerPanel';
import RightSidebar from './components/RightSidebar/RightSidebar';
import AnimationTab from './components/AnimationTab/AnimationTab';
import Workspace from './components/Workspace/Workspace';
import TerminalPanel, { TerminalPanelRef } from './components/TerminalPanel/TerminalPanel';
import StatusBar from './components/StatusBar/StatusBar';
import SearchPanel from './components/SearchPanel/SearchPanel';
import LanguageManagerPanel from './components/LanguageManagerPanel/LanguageManagerPanel';
import CommandPalette from './components/CommandPalette/CommandPalette';
import SettingsModal, { loadSettings } from './components/SettingsModal/SettingsModal';
import { useFileManagement } from './hooks/useFileManagement';
import { useAnimationState } from './hooks/useAnimationState';
import { useCodeRunner } from './hooks/useCodeRunner';
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
  const terminalRef = useRef<TerminalPanelRef>(null);

  // Split sizes - persist across tab changes for VSCode-like behavior
  const [leftPanelSize, setLeftPanelSize] = useState(20);
  const [terminalHeight, setTerminalHeight] = useState(38);

  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1 });
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [animWidth, setAnimWidth] = useState(500);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(() => loadSettings());

  useEffect(() => {
    const theme = settings?.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, [settings?.theme]);

  // ── Custom Hooks ──

  const {
    openFiles,
    setOpenFiles,
    activeFilePath,
    setActiveFilePath,
    activeFileRef,
    handleOpenFile: rawHandleOpenFile,
    handleFileChange,
    saveActiveFile,
    saveAllFiles,
    handleFileRenamed,
    handleCloseFile,
    handleCloseFileRef,
  } = useFileManagement(settings);

  const activeFileLineCount = activeFilePath ? (openFiles.find(f => f.path === activeFilePath)?.content?.split('\n').length || 0) : 0;

  const {
    isRunning,
    isRunningRef,
    runActiveFile,
    stopRunningCode,
  } = useCodeRunner(activeFileRef, terminalRef, saveActiveFile, setShowTerminal);

  const {
    animations,
    manimVideos,
    isGenerating,
    llmConfigured,
    animError,
    isManimRendering,
    manimError,
    animEngineInstalled,
    handleGenerateAnimation,
    handleCancelAnimation,
    handleDeleteAnimation,
    handleClearAnimations,
    handleGenerateManimVideo,
    handleCancelManimVideo,
    handleDeleteManimVideo,
  } = useAnimationState(activeFilePath, openFiles, activeFileRef, saveActiveFile, setRightTab, rightTab);

  // Wrap handleOpenFile to dismiss overlays
  const handleOpenFile = async (filePath: string, name: string) => {
    setShowCommandPalette(false);
    setShowSettings(false);
    await rawHandleOpenFile(filePath, name);
  };

  // ── Terminal Actions ──

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

  // ── Menu Actions ──

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
      case 'showAbout':
      case 'showWelcome':
      case 'showDocs':
        console.info('Colon IDE v1.0 — Built for the Web & Desktop.');
        break;
    }
  };

  // ── Keyboard Shortcuts ──

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

  // ── Layout Helpers ──

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

  // ── Render Sections ──

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
