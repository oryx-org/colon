import { useState, useRef, useEffect } from 'react';
import { VscChromeMinimize, VscChromeMaximize, VscChromeClose, VscTerminal } from 'react-icons/vsc';
import './MenuBar.css';

interface MenuBarProps {
    onTerminalAction?: (action: string) => void;
    activeFileName?: string;
}

const menus: Record<string, { label: string; shortcut?: string; action?: string; separator?: boolean }[]> = {
    File: [
        { label: 'New File', shortcut: 'Ctrl+N' },
        { label: 'New Window', shortcut: 'Ctrl+Shift+N' },
        { label: '', separator: true },
        { label: 'Open Folder…', shortcut: 'Ctrl+K Ctrl+O' },
        { label: '', separator: true },
        { label: 'Save', shortcut: 'Ctrl+S' },
        { label: 'Save All', shortcut: 'Ctrl+K S' },
        { label: '', separator: true },
        { label: 'Close Editor', shortcut: 'Ctrl+W' },
    ],
    Edit: [
        { label: 'Undo', shortcut: 'Ctrl+Z' },
        { label: 'Redo', shortcut: 'Ctrl+Y' },
        { label: '', separator: true },
        { label: 'Cut', shortcut: 'Ctrl+X' },
        { label: 'Copy', shortcut: 'Ctrl+C' },
        { label: 'Paste', shortcut: 'Ctrl+V' },
        { label: '', separator: true },
        { label: 'Find', shortcut: 'Ctrl+F' },
        { label: 'Replace', shortcut: 'Ctrl+H' },
    ],
    Selection: [
        { label: 'Select All', shortcut: 'Ctrl+A' },
        { label: 'Expand Selection', shortcut: 'Alt+Shift+→' },
        { label: '', separator: true },
        { label: 'Add Cursor Above', shortcut: 'Ctrl+Alt+↑' },
        { label: 'Add Cursor Below', shortcut: 'Ctrl+Alt+↓' },
    ],
    View: [
        { label: 'Explorer', shortcut: 'Ctrl+Shift+E' },
        { label: 'Search', shortcut: 'Ctrl+Shift+F' },
        { label: '', separator: true },
        { label: 'Toggle Sidebar', shortcut: 'Ctrl+B' },
        { label: '', separator: true },
        { label: 'Zoom In', shortcut: 'Ctrl+=' },
        { label: 'Zoom Out', shortcut: 'Ctrl+-' },
    ],
    Go: [
        { label: 'Go to File…', shortcut: 'Ctrl+P' },
        { label: 'Go to Line…', shortcut: 'Ctrl+G' },
        { label: '', separator: true },
        { label: 'Back', shortcut: 'Alt+←' },
        { label: 'Forward', shortcut: 'Alt+→' },
    ],
    Run: [
        { label: 'Start Debugging', shortcut: 'F5' },
        { label: 'Run Without Debugging', shortcut: 'Ctrl+F5' },
        { label: '', separator: true },
        { label: 'Add Breakpoint', shortcut: 'F9' },
    ],
    Terminal: [
        { label: 'New Terminal', shortcut: 'Ctrl+Shift+`', action: 'newTerminal' },
        { label: 'Split Terminal', shortcut: 'Ctrl+Shift+5', action: 'splitTerminal' },
        { label: '', separator: true },
        { label: 'Toggle Terminal', shortcut: 'Ctrl+`', action: 'toggleTerminal' },
        { label: 'Kill Terminal', shortcut: 'Ctrl+Shift+K', action: 'killTerminal' },
        { label: '', separator: true },
        { label: 'Clear Terminal', shortcut: '' },
    ],
    Help: [
        { label: 'Welcome' },
        { label: 'Documentation' },
        { label: '', separator: true },
        { label: 'About Colon' },
    ],
};

function MenuBar({ onTerminalAction, activeFileName }: MenuBarProps) {
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
        if (action) onTerminalAction?.(action);
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
                                        item.separator ? (
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
                                        )
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
                    <VscTerminal />
                </div>
                <div className="window-control-btn" onClick={() => (window as any).electronAPI?.windowControl('minimize')}>
                    <VscChromeMinimize />
                </div>
                <div className="window-control-btn" onClick={() => (window as any).electronAPI?.windowControl('maximize')}>
                    <VscChromeMaximize />
                </div>
                <div className="window-control-btn close" onClick={() => (window as any).electronAPI?.windowControl('close')}>
                    <VscChromeClose />
                </div>
            </div>
        </div>
    );
}

export default MenuBar;
