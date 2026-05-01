import { LuX, LuChevronDown, LuTrash2, LuPlus, LuTerminal, LuChevronUp, LuColumns2 } from 'react-icons/lu';
import { useState, useCallback, useImperativeHandle, forwardRef, useEffect, useRef } from 'react';
import Split from 'react-split';
import XTermView from './XTermView';
import './TerminalPanel.css';

interface TerminalEntry {
    id: string;
    name: string;
}

interface SplitGroup {
    id: string;          // group id
    terminals: string[]; // terminal IDs side-by-side
}

export interface TerminalPanelRef {
    createTerminal: () => void;
    splitTerminal: () => void;
    killActiveTerminal: () => void;
    sendCommandToTerminal: (command: string) => void;
    /** Send raw bytes without appending '\n' — use for control chars like Ctrl+C (\x03) */
    sendRawToTerminal: (data: string) => void;
}

// Shared xterm instance registry so we can write to terminals from outside
export const xtermRegistry = new Map<string, any>();

interface TerminalPanelProps {
    onClose?: () => void;
    onMaximize?: () => void;
    isMaximized?: boolean;
}

let termCounter = 0;
const uid = () => `t${++termCounter}`;
const gid = () => `g${Math.random().toString(36).substring(2, 7)}`;

const TerminalPanel = forwardRef<TerminalPanelRef, TerminalPanelProps>(({ onClose, onMaximize, isMaximized }, ref) => {
    const [activeTab, setActiveTab] = useState<string>('terminal');
    const [entries, setEntries] = useState<TerminalEntry[]>([]);   // all terminals
    const [groups, setGroups] = useState<SplitGroup[]>([]);      // layout groups
    const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
    const [activeTId, setActiveTId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    // Keep a ref in sync with activeTId so imperative handle closures always read the latest value
    const activeTIdRef = useRef<string | null>(null);
    activeTIdRef.current = activeTId;

    /* ── helpers ─────────────────────────────────────── */

    /** Add a brand-new terminal in its own group */
    const createTerminal = useCallback(() => {
        const id = uid();
        const shellName = (window as any).electronAPI?.platform === 'win32' ? 'cmd' : 'bash';
        const name = `${shellName} ${termCounter}`;
        const groupId = gid();

        setEntries(prev => [...prev, { id, name }]);
        setGroups(prev => [...prev, { id: groupId, terminals: [id] }]);
        setActiveGroupId(groupId);
        setActiveTId(id);
    }, []);

    /** Split the current active terminal side-by-side */
    const splitTerminal = useCallback(() => {
        const agid = activeGroupId;
        if (!agid) return createTerminal();
        const id = uid();
        const shellName = (window as any).electronAPI?.platform === 'win32' ? 'cmd' : 'bash';
        const name = `${shellName} ${termCounter}`;

        setEntries(prev => [...prev, { id, name }]);
        setGroups(prev => prev.map(g =>
            g.id === agid ? { ...g, terminals: [...g.terminals, id] } : g
        ));
        setActiveTId(id);
    }, [activeGroupId, createTerminal]);

    /** Kill a single terminal (and clean up its group if empty) */
    const killTerminal = useCallback((termId: string, ev?: React.MouseEvent) => {
        ev?.stopPropagation();

        const electron = (window as any).electronAPI;
        electron?.terminal?.kill(termId);

        setEntries(prev => prev.filter(e => e.id !== termId));

        setGroups(prev => {
            const updated = prev
                .map(g => ({ ...g, terminals: g.terminals.filter(t => t !== termId) }))
                .filter(g => g.terminals.length > 0);

            // Fix active pointers
            setActiveGroupId(ag => {
                const stillExists = updated.find(g => g.id === ag);
                if (stillExists) {
                    setActiveTId(at => stillExists.terminals.includes(at ?? '') ? at : stillExists.terminals[stillExists.terminals.length - 1]);
                    return ag;
                }
                const fallback = updated[updated.length - 1] ?? null;
                setActiveTId(fallback?.terminals[fallback.terminals.length - 1] ?? null);
                return fallback?.id ?? null;
            });

            return updated;
        });
    }, []);

    /** Kill entire active terminal session */
    const killActiveTerminal = useCallback(() => {
        if (activeTId) killTerminal(activeTId);
    }, [activeTId, killTerminal]);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        createTerminal,
        splitTerminal,
        killActiveTerminal,
        /**
         * Send a command string to the active terminal's PTY.
         * Uses activeTIdRef (not activeTId) so the closure is never stale.
         */
        sendCommandToTerminal: (command: string) => {
            const id = activeTIdRef.current;
            if (id) {
                const electron = (window as any).electronAPI;
                if (electron?.terminal) {
                    // Use CR (Enter key semantics) instead of LF to avoid prompt/output misalignment.
                    electron.terminal.input(id, command + '\r');
                }
            }
        },
        sendRawToTerminal: (data: string) => {
            const id = activeTIdRef.current;
            if (id) {
                const electron = (window as any).electronAPI;
                if (electron?.terminal) {
                    electron.terminal.input(id, data);
                }
            }
        }
    }), [createTerminal, splitTerminal, killActiveTerminal]);

    const commitRename = (id: string) => {
        setEntries(prev => prev.map(e => e.id === id ? { ...e, name: editingName } : e));
        setEditingId(null);
    };

    const selectGroup = (groupId: string, termId: string) => {
        setActiveGroupId(groupId);
        setActiveTId(termId);
    };

    /* ── auto-create first terminal (via effect, not in render body) ─────────────────── */
    useEffect(() => {
        if (entries.length === 0 && activeTab === 'terminal') {
            createTerminal();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const rendersidebar = () => (
        <div className="terminal-sidebar">
            <div className="terminal-sidebar-header">
                <span>TERMINALS</span>
                <button className="sidebar-add-btn" title="New Terminal" onClick={createTerminal}>
                    <LuPlus />
                </button>
            </div>

            <div className="terminal-list">
                {groups.map(group => (
                    group.terminals.map((tid, idx) => {
                        const entry = entries.find(e => e.id === tid);
                        if (!entry) return null;
                        const isActive = activeTId === tid;
                        return (
                            <div
                                key={tid}
                                className={`terminal-list-item ${isActive ? 'active' : ''}`}
                                onClick={() => selectGroup(group.id, tid)}
                                onDoubleClick={() => { setEditingId(tid); setEditingName(entry.name); }}
                            >
                                <LuTerminal className="term-item-icon" />
                                {editingId === tid ? (
                                    <input
                                        autoFocus
                                        className="term-item-input"
                                        value={editingName}
                                        onChange={e => setEditingName(e.target.value)}
                                        onBlur={() => commitRename(tid)}
                                        onKeyDown={e => { if (e.key === 'Enter') commitRename(tid); if (e.key === 'Escape') setEditingId(null); }}
                                        onClick={e => e.stopPropagation()}
                                    />
                                ) : (
                                    <span className="term-item-name">
                                        {idx > 0 && <span className="split-badge">split</span>}
                                        {entry.name}
                                    </span>
                                )}
                                <button
                                    className="term-item-kill"
                                    onClick={e => killTerminal(tid, e)}
                                    title="Kill terminal"
                                >
                                    <LuTrash2 />
                                </button>
                            </div>
                        );
                    })
                ))}
            </div>
        </div>
    );

    /* ── JSX ─────────────────────────────────────────── */
    return (
        <div className="terminal-panel">
            {/* ── Header ── */}
            <div className="terminal-header">
                <div className="terminal-tabs">
                    {['problems', 'output', 'debug', 'terminal', 'ports'].map(tab => (
                        <button
                            key={tab}
                            className={`terminal-tab ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab === 'debug' ? 'DEBUG CONSOLE' : tab.toUpperCase()}
                        </button>
                    ))}
                </div>

                <div className="terminal-actions">
                    <button className="terminal-action-btn" title="New Terminal (Ctrl+`)" onClick={createTerminal}>
                        <LuPlus />
                    </button>
                    <button className="terminal-action-btn" title="Split Terminal" onClick={splitTerminal}>
                        <LuColumns2 />
                    </button>
                    <button className="terminal-action-btn" title="Kill Terminal" onClick={killActiveTerminal}>
                        <LuTrash2 />
                    </button>
                    <div className="action-divider" />
                    <button
                        className="terminal-action-btn"
                        title={isMaximized ? 'Restore Panel' : 'Maximize Panel'}
                        onClick={onMaximize}
                    >
                        {isMaximized ? <LuChevronDown /> : <LuChevronUp />}
                    </button>
                    <button className="terminal-action-btn" title="Close Panel" onClick={onClose}>
                        <LuX />
                    </button>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="terminal-main-content">
                {activeTab === 'terminal' && entries.length > 0 ? (
                    <Split
                        className="split split-horizontal"
                        sizes={[82, 18]}
                        minSize={[300, 150]}
                        gutterSize={3}
                        style={{ flex: 1, display: 'flex', overflow: 'hidden' }}
                    >
                        <div className="terminal-body">
                            <div className="terminals-canvas">
                                {groups.map(group => {
                                    const visible = group.id === activeGroupId;
                                    return (
                                        <div
                                            key={group.id}
                                            className="terminal-group"
                                            style={{ display: visible ? 'flex' : 'none' }}
                                        >
                                            {group.terminals.length > 1 ? (
                                                <Split
                                                    className="split split-horizontal"
                                                    sizes={group.terminals.map(() => 100 / group.terminals.length)}
                                                    minSize={150}
                                                    gutterSize={3}
                                                    style={{ flex: 1, display: 'flex', overflow: 'hidden' }}
                                                >
                                                    {group.terminals.map(tid => (
                                                        <XTermView
                                                            key={tid}
                                                            terminalId={tid}
                                                            isVisible={visible}
                                                            onFocus={() => setActiveTId(tid)}
                                                        />
                                                    ))}
                                                </Split>
                                            ) : (
                                                <XTermView
                                                    key={group.terminals[0]}
                                                    terminalId={group.terminals[0]}
                                                    isVisible={visible}
                                                    onFocus={() => setActiveTId(group.terminals[0])}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {rendersidebar()}
                    </Split>
                ) : (
                    <div className="terminal-body">
                        {activeTab === 'terminal' && entries.length === 0 ? (
                            <div className="terminal-empty-state">
                                <LuTerminal size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                                <p>No active terminals — click <strong>+</strong> to create one</p>
                            </div>
                        ) : (
                            <div className="terminal-content panel-tab-content">
                                {activeTab === 'problems' && <p>No problems detected in the workspace.</p>}
                                {activeTab === 'output' && <p>Run a task or command to see output logs here.</p>}
                                {activeTab === 'debug' && <p>Start a debug session to stream debug console logs here.</p>}
                                {activeTab === 'ports' && (
                                    <div className="ports-view">
                                        <p className="ports-hint">Ports exposed by running services are listed here.</p>
                                        <div className="ports-row">
                                            <span className="port-num">5173</span>
                                            <span className="port-label">Vite Dev Server</span>
                                            <span className="port-status running">Running</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

export default TerminalPanel;
