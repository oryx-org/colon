import { LuMinus, LuMaximize, LuX, LuTerminal } from 'react-icons/lu';
import { useState, useRef, useEffect } from 'react';

import './MenuBar.css';

interface MenuBarProps {
    onTerminalAction?: (action: string) => void;
    onMenuAction?: (action: string) => void;
    activeFileName?: string;
}

const menus: Record<string, { label: string; shortcut?: string; action?: string; separator?: boolean }[]> = {
    File: [
        { label: 'New File', shortcut: 'Ctrl+N', action: 'newFile' },
        { label: 'New Window', shortcut: 'Ctrl+Shift+N', action: 'newWindow' },
        { label: '', separator: true },
        { label: 'Open Folder…', shortcut: 'Ctrl+K Ctrl+O', action: 'openFolder' },
        { label: 'Open File…', shortcut: 'Ctrl+O', action: 'openFile' },
        { label: '', separator: true },
        { label: 'Save', shortcut: 'Ctrl+S', action: 'saveFile' },
        { label: 'Save All', shortcut: 'Ctrl+K S', action: 'saveAllFiles' },
        { label: '', separator: true },
        { label: 'Close Editor', shortcut: 'Ctrl+W', action: 'closeEditor' },
    ],
    Edit: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: 'undo' },
        { label: 'Redo', shortcut: 'Ctrl+Y', action: 'redo' },
        { label: '', separator: true },
        { label: 'Cut', shortcut: 'Ctrl+X', action: 'cut' },
        { label: 'Copy', shortcut: 'Ctrl+C', action: 'copy' },
        { label: 'Paste', shortcut: 'Ctrl+V', action: 'paste' },
        { label: '', separator: true },
        { label: 'Find', shortcut: 'Ctrl+F', action: 'toggleSearch' },
        { label: 'Replace', shortcut: 'Ctrl+H', action: 'toggleSearch' },
    ],
    Selection: [
        { label: 'Select All', shortcut: 'Ctrl+A', action: 'selectAll' },
        { label: 'Expand Selection', shortcut: 'Alt+Shift+→', action: 'expandSelection' },
        { label: '', separator: true },
        { label: 'Add Cursor Above', shortcut: 'Ctrl+Alt+↑', action: 'addCursorAbove' },
        { label: 'Add Cursor Below', shortcut: 'Ctrl+Alt+↓', action: 'addCursorBelow' },
    ],
    View: [
        { label: 'Command Palette', shortcut: 'Ctrl+Shift+P', action: 'openCommandPalette' },
        { label: 'Settings', shortcut: 'Ctrl+,', action: 'openSettings' },
        { label: '', separator: true },
        { label: 'Explorer', shortcut: 'Ctrl+Shift+E', action: 'toggleExplorer' },
        { label: 'Search', shortcut: 'Ctrl+Shift+F', action: 'toggleSearch' },
        { label: '', separator: true },
        { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: 'toggleSidebar' },
        { label: '', separator: true },
        { label: 'Zoom In', shortcut: 'Ctrl+=', action: 'zoomIn' },
        { label: 'Zoom Out', shortcut: 'Ctrl+-', action: 'zoomOut' },
    ],
    Go: [
        { label: 'Go to File…', shortcut: 'Ctrl+P', action: 'openCommandPalette' },
        { label: 'Go to Line…', shortcut: 'Ctrl+G', action: 'goToLine' },
        { label: '', separator: true },
        { label: 'Back', shortcut: 'Alt+←', action: 'navigateBack' },
        { label: 'Forward', shortcut: 'Alt+→', action: 'navigateForward' },
    ],
    Run: [
        { label: 'Run Code (No Debugging)', shortcut: 'F5', action: 'runCode' },
        { label: 'Stop Code', shortcut: 'Shift+F5', action: 'stopCode' },
        
    ],
    Terminal: [
        { label: 'New Terminal', shortcut: 'Ctrl+Shift+`', action: 'newTerminal' },
        { label: 'Split Terminal', shortcut: 'Ctrl+Shift+5', action: 'splitTerminal' },
        { label: '', separator: true },
        { label: 'Toggle Terminal', shortcut: 'Ctrl+`', action: 'toggleTerminal' },
        { label: 'Kill Terminal', shortcut: 'Ctrl+Shift+K', action: 'killTerminal' },
        { label: '', separator: true },
        { label: 'Clear Terminal', shortcut: '', action: 'clearTerminal' },
    ],
    Help: [
        { label: 'Welcome', action: 'showWelcome' },
        { label: 'Documentation', action: 'showDocs' },
        { label: '', separator: true },
        { label: 'About Colon', action: 'showAbout' },
    ],
};

function MenuBar({ onTerminalAction, onMenuAction, activeFileName }: MenuBarProps) {
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const menuBarRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleMenuAction = (action?: string) => {
        setOpenMenu(null);
        if (!action) return;
        
        // Some actions are terminal specific
        if (action.includes('Terminal')) {
            onTerminalAction?.(action);
        } else {
            onMenuAction?.(action);
        }
    };

    return (
        <div className="menu-bar drag-region" ref={menuBarRef}>
            {/* Left: Logo + Menus */}
            <div className="menu-left">
                <div className="menu-logo no-drag">
                    <span className="colon-logo">&lt;:&gt;</span>
                </div>
                <div className="menu-items no-drag">
                    {Object.keys(menus).map(name => (
                        <div
                            key={name}
                            className={`menu-item ${openMenu === name ? 'open' : ''}`}
                            onClick={() => setOpenMenu(openMenu === name ? null : name)}
                            onMouseEnter={() => openMenu !== null && setOpenMenu(name)}
                        >
                            {name}
                            {openMenu === name && (
                                <div className="menu-dropdown">
                                    {menus[name].map((item, i) =>
                                        (item.separator ? (
                                            <div key={i} className="menu-separator" />
                                        ) : (
                                            <div
                                                key={i}
                                                className="menu-dropdown-item"
                                                onClick={(e) => { e.stopPropagation(); handleMenuAction(item.action); }}
                                            >
                                                <span>{item.label}</span>
                                                {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Center: Title */}
            <div className="menu-center">
                <div className="window-title">{activeFileName ? `${activeFileName} — Colon` : 'Colon'}</div>
            </div>

            {/* Right: Window Controls */}
            <div className="menu-right no-drag">
                <div className="window-control-btn" title="Toggle Terminal" onClick={() => onTerminalAction?.('toggleTerminal')}>
                    <LuTerminal />
                </div>
                <div className="window-control-btn" onClick={() => (window as any).electronAPI?.windowControl('minimize')}>
                    <LuMinus />
                </div>
                <div className="window-control-btn" onClick={() => (window as any).electronAPI?.windowControl('maximize')}>
                    <LuMaximize />
                </div>
                <div className="window-control-btn close" onClick={() => (window as any).electronAPI?.windowControl('close')}>
                    <LuX />
                </div>
            </div>
        </div>
    );
}

export default MenuBar;
