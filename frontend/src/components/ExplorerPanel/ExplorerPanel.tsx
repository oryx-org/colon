import { useState, useCallback, useRef, useEffect } from 'react';
import {
    VscChevronRight, VscChevronDown, VscFolder,
    VscNewFile, VscNewFolder, VscRefresh, VscCollapseAll,
    VscEdit, VscTrash
} from 'react-icons/vsc';
import FileIcon from '../FileIcon/FileIcon';
import './ExplorerPanel.css';

/* ── Types ── */
interface FileNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children?: FileNode[];
    isOpen?: boolean;
}

interface InlineInput {
    parentPath: string;          // folder where the new item goes
    isDirectory: boolean;
    type: 'create' | 'rename';
    renamePath?: string;         // original path if renaming
    renameOldName?: string;
}

interface ExplorerPanelProps {
    onFileClick: (path: string, name: string) => void;
}

/* ── Helpers ── */
const electron = () => (window as any).electronAPI;

/** Recursively update a tree node matched by path */
function updateTree(nodes: FileNode[], targetPath: string, updater: (n: FileNode) => FileNode): FileNode[] {
    return nodes.map(n => {
        if (n.path === targetPath) return updater(n);
        if (n.children) return { ...n, children: updateTree(n.children, targetPath, updater) };
        return n;
    });
}

/** Recursively find a node by path */
function findNode(nodes: FileNode[], targetPath: string): FileNode | null {
    for (const n of nodes) {
        if (n.path === targetPath) return n;
        if (n.children) {
            const found = findNode(n.children, targetPath);
            if (found) return found;
        }
    }
    return null;
}

/** Sort: directories first, then alphabetical */

/* ── Component ── */
function ExplorerPanel({ onFileClick }: ExplorerPanelProps) {
    const [rootPath, setRootPath] = useState<string | null>(null);
    const [tree, setTree] = useState<FileNode[]>([]);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [inlineInput, setInlineInput] = useState<InlineInput | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // ── Focus the inline input whenever it appears
    useEffect(() => {
        if (inlineInput && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [inlineInput]);

    // ── Close context menu on outside click
    useEffect(() => {
        const handler = () => {
            if (contextMenu) setContextMenu(null);
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [contextMenu]);

    // ── Listen for global explorer actions
    useEffect(() => {
        const handleExplorerAction = (e: any) => {
            if (e.detail === 'openFolder') {
                handleOpenFolder();
            } else if (e.detail === 'newFile') {
                startCreate(false);
            }
        };
        window.addEventListener('explorer-action', handleExplorerAction);
        return () => window.removeEventListener('explorer-action', handleExplorerAction);
    }, [rootPath, selectedPath, tree]);

    /* ─────────────────────────────────────────────
       CORE: Load / Refresh
    ───────────────────────────────────────────── */

    const loadDirectory = useCallback(async (dirPath: string): Promise<FileNode[]> => {
        if (!electron()) return [];
        const items = await electron().readDirectory(dirPath);
        return items || [];
    }, []);

    const handleOpenFolder = async () => {
        if (!electron()) return;
        const path = await electron().openDirectory();
        if (path) {
            setRootPath(path);
            const contents = await loadDirectory(path);
            setTree(contents);
            setSelectedPath(null);
        }
    };

    /** Refresh entire tree while preserving open folder states */
    const refreshTree = useCallback(async () => {
        if (!rootPath || !electron()) return;

        const collectOpenPaths = (nodes: FileNode[]): Set<string> => {
            const s = new Set<string>();
            for (const n of nodes) {
                if (n.isDirectory && n.isOpen) {
                    s.add(n.path);
                    if (n.children) collectOpenPaths(n.children).forEach(p => s.add(p));
                }
            }
            return s;
        };
        const openPaths = collectOpenPaths(tree);

        const rebuildTree = async (dirPath: string): Promise<FileNode[]> => {
            const items = await loadDirectory(dirPath);
            const result: FileNode[] = [];
            for (const item of items) {
                if (item.isDirectory && openPaths.has(item.path)) {
                    const children = await rebuildTree(item.path);
                    result.push({ ...item, isOpen: true, children });
                } else {
                    result.push(item);
                }
            }
            return result;
        };

        const newTree = await rebuildTree(rootPath);
        setTree(newTree);
    }, [rootPath, tree, loadDirectory]);

    const collapseAll = () => {
        const collapse = (nodes: FileNode[]): FileNode[] =>
            nodes.map(n => n.isDirectory ? { ...n, isOpen: false, children: n.children ? collapse(n.children) : undefined } : n);
        setTree(prev => collapse(prev));
    };

    /* ─────────────────────────────────────────────
       CORE: Toggle folder open/close
    ───────────────────────────────────────────── */

    const toggleFolder = async (node: FileNode) => {
        setSelectedPath(node.path);

        if (!node.isDirectory) {
            onFileClick(node.path, node.name);
            return;
        }

        if (node.isOpen) {
            // Close it
            setTree(prev => updateTree(prev, node.path, n => ({ ...n, isOpen: false })));
        } else {
            // Open it — load children if not loaded
            if (!node.children) {
                const children = await loadDirectory(node.path);
                setTree(prev => updateTree(prev, node.path, n => ({ ...n, isOpen: true, children })));
            } else {
                setTree(prev => updateTree(prev, node.path, n => ({ ...n, isOpen: true })));
            }
        }
    };

    /* ─────────────────────────────────────────────
       CRUD: Create File / Folder
    ───────────────────────────────────────────── */

    /** Start inline creation. If a folder is selected, create inside it. Otherwise create at root. */
    const startCreate = async (isDirectory: boolean) => {
        if (!rootPath) return;

        let parentPath = rootPath;

        if (selectedPath) {
            const node = findNode(tree, selectedPath);
            if (node) {
                if (node.isDirectory) {
                    parentPath = node.path;
                    // Ensure the folder is open
                    if (!node.isOpen) {
                        const children = node.children || await loadDirectory(node.path);
                        setTree(prev => updateTree(prev, node.path, n => ({ ...n, isOpen: true, children })));
                    }
                } else {
                    // Selected a file → create in its parent folder
                    parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
                }
            }
        }

        setInlineInput({ parentPath, isDirectory, type: 'create' });
        setInputValue('');
    };

    /** Start inline rename */
    const startRename = (node: FileNode) => {
        const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
        setInlineInput({
            parentPath,
            isDirectory: node.isDirectory,
            type: 'rename',
            renamePath: node.path,
            renameOldName: node.name
        });
        setInputValue(node.name);
        setContextMenu(null);
    };

    /** Commit the inline input (create or rename) */
    const commitInlineInput = async () => {
        if (!inlineInput || !inputValue.trim()) {
            setInlineInput(null);
            return;
        }

        const api = electron();
        if (!api) { setInlineInput(null); return; }

        const newPath = `${inlineInput.parentPath}/${inputValue.trim()}`;
        let success = false;

        if (inlineInput.type === 'create') {
            if (inlineInput.isDirectory) {
                success = await api.createDirectory(newPath);
            } else {
                success = await api.createFile(newPath);
            }
            if (success && !inlineInput.isDirectory) {
                // Auto-open the newly created file
                onFileClick(newPath, inputValue.trim());
            }
        } else if (inlineInput.type === 'rename' && inlineInput.renamePath) {
            success = await api.rename(inlineInput.renamePath, newPath);
        }

        if (success) await refreshTree();
        setInlineInput(null);
    };

    const cancelInlineInput = () => setInlineInput(null);

    /* ─────────────────────────────────────────────
       CRUD: Delete
    ───────────────────────────────────────────── */

    const handleDelete = async (node: FileNode) => {
        setContextMenu(null);
        const confirmMsg = node.isDirectory
            ? `Delete folder "${node.name}" and all its contents?`
            : `Delete file "${node.name}"?`;
        if (!confirm(confirmMsg)) return;

        const api = electron();
        if (!api) return;
        const success = await api.delete(node.path);
        if (success) await refreshTree();
    };

    /* ─────────────────────────────────────────────
       Context Menu (Right-click)
    ───────────────────────────────────────────── */

    const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedPath(node.path);
        setContextMenu({ x: e.clientX, y: e.clientY, node });
    };

    const handleBgContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (!rootPath) return;
        setContextMenu({ x: e.clientX, y: e.clientY, node: null });
    };

    /* ─────────────────────────────────────────────
       Render: Inline input row
    ───────────────────────────────────────────── */

    const renderInlineInput = (paddingLeft: number) => (
        <div className="file-tree-item inline-input-row" style={{ paddingLeft: `${paddingLeft}px` }}>
            <div className="file-icon-container">
                <span style={{ width: 16 }} />
                {inlineInput?.isDirectory
                    ? <VscFolder className="item-icon folder" />
                    : <FileIcon fileName={inputValue || 'untitled'} size={15} />
                }
            </div>
            <input
                ref={inputRef}
                className="tree-edit-input"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onBlur={commitInlineInput}
                onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitInlineInput(); }
                    if (e.key === 'Escape') cancelInlineInput();
                }}
            />
        </div>
    );

    /* ─────────────────────────────────────────────
       Render: Tree recursion
    ───────────────────────────────────────────── */

    const renderTree = (nodes: FileNode[], depth = 0): React.ReactNode[] => {
        const paddingLeft = 12 + depth * 16;
        const result: React.ReactNode[] = [];

        for (const node of nodes) {
            const isSelected = selectedPath === node.path;
            const isRenaming = inlineInput?.type === 'rename' && inlineInput.renamePath === node.path;

            result.push(
                <div key={node.path}>
                    <div
                        className={`file-tree-item ${isSelected ? 'selected' : ''}`}
                        style={{ paddingLeft: `${paddingLeft}px` }}
                        onClick={() => toggleFolder(node)}
                        onContextMenu={(e) => handleContextMenu(e, node)}
                    >
                        <div className="file-icon-container">
                            {node.isDirectory ? (
                                node.isOpen
                                    ? <VscChevronDown className="collapse-icon" />
                                    : <VscChevronRight className="collapse-icon" />
                            ) : (
                                <span style={{ width: 16, display: 'inline-block' }} />
                            )}
                            {node.isDirectory
                                ? <VscFolder className="item-icon folder" />
                                : <FileIcon fileName={node.name} size={15} />
                            }
                        </div>

                        {isRenaming ? (
                            <input
                                ref={inputRef}
                                className="tree-edit-input"
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onBlur={commitInlineInput}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); commitInlineInput(); }
                                    if (e.key === 'Escape') cancelInlineInput();
                                }}
                                onClick={e => e.stopPropagation()}
                            />
                        ) : (
                            <span className="file-name">{node.name}</span>
                        )}

                        {/* Hover action icons */}
                        {!isRenaming && (
                            <div className="item-actions">
                                {node.isDirectory && (
                                    <>
                                        <VscNewFile
                                            className="action-icon"
                                            title="New File"
                                            onClick={(e) => { e.stopPropagation(); setSelectedPath(node.path); startCreate(false); }}
                                        />
                                        <VscNewFolder
                                            className="action-icon"
                                            title="New Folder"
                                            onClick={(e) => { e.stopPropagation(); setSelectedPath(node.path); startCreate(true); }}
                                        />
                                    </>
                                )}
                                <VscEdit
                                    className="action-icon"
                                    title="Rename"
                                    onClick={(e) => { e.stopPropagation(); startRename(node); }}
                                />
                                <VscTrash
                                    className="action-icon delete"
                                    title="Delete"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(node); }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Children of open directories */}
                    {node.isDirectory && node.isOpen && (
                        <div className="file-children">
                            {/* Inline input for creating inside THIS folder */}
                            {inlineInput?.type === 'create' && inlineInput.parentPath === node.path &&
                                renderInlineInput(paddingLeft + 16)
                            }
                            {node.children && renderTree(node.children, depth + 1)}
                        </div>
                    )}
                </div>
            );
        }

        return result;
    };

    /* ─────────────────────────────────────────────
       Render: Main
    ───────────────────────────────────────────── */

    return (
        <div className="explorer-panel" ref={panelRef} onContextMenu={handleBgContextMenu}>
            {/* Header */}
            <div className="explorer-header">
                <span className="explorer-title">EXPLORER</span>
                <div className="explorer-actions">
                    <button className="explorer-btn" title="New File" onClick={() => startCreate(false)}><VscNewFile /></button>
                    <button className="explorer-btn" title="New Folder" onClick={() => startCreate(true)}><VscNewFolder /></button>
                    <button className="explorer-btn" title="Refresh Explorer" onClick={refreshTree}><VscRefresh /></button>
                    <button className="explorer-btn" title="Collapse All" onClick={collapseAll}><VscCollapseAll /></button>
                </div>
            </div>

            {/* Content */}
            <div className="explorer-content">
                {!rootPath ? (
                    <div className="empty-state">
                        <p>You have not yet opened a folder.</p>
                        <button className="primary-btn" onClick={handleOpenFolder}>Open Folder</button>
                    </div>
                ) : (
                    <div className="file-tree">
                        <div className="tree-header" onClick={handleOpenFolder}>
                            <span className="tree-root-name">
                                {rootPath.split('/').pop() || rootPath.split('\\').pop() || 'PROJECT'}
                            </span>
                        </div>

                        {/* Inline input for creating at root level */}
                        {inlineInput?.type === 'create' && inlineInput.parentPath === rootPath &&
                            renderInlineInput(12)
                        }

                        {renderTree(tree)}
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={() => setContextMenu(null)}
                >
                    <div className="context-item" onClick={() => {
                        if (contextMenu.node?.isDirectory) setSelectedPath(contextMenu.node.path);
                        startCreate(false);
                    }}>
                        <VscNewFile /> New File
                    </div>
                    <div className="context-item" onClick={() => {
                        if (contextMenu.node?.isDirectory) setSelectedPath(contextMenu.node.path);
                        startCreate(true);
                    }}>
                        <VscNewFolder /> New Folder
                    </div>
                    <div className="context-separator" />
                    {contextMenu.node && (
                        <>
                            <div className="context-item" onClick={() => startRename(contextMenu.node!)}>
                                <VscEdit /> Rename
                            </div>
                            <div className="context-item danger" onClick={() => handleDelete(contextMenu.node!)}>
                                <VscTrash /> Delete
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default ExplorerPanel;
