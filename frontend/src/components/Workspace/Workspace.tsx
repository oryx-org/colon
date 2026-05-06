import { LuX, LuPlay, LuSquare } from 'react-icons/lu';
import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';

import { OpenFile } from '../../App';
import FileIcon from '../FileIcon/FileIcon';
import { registerPythonCompletions } from '../../utils/pythonCompletions';
import { registerAllCompletions } from '../../utils/languageCompletions';
import { connectLsp } from '../../utils/lspClient';
import { setupHtmlAutoClose } from '../../utils/htmlAutoClose';
import './Workspace.css';

// Monaco is a singleton — these setup calls must happen only once
let _monacoConfigured = false;

interface WorkspaceProps {
    openFiles: OpenFile[];
    activeFilePath: string | null;
    setActiveFilePath: (path: string) => void;
    onCloseFile: (path: string) => void;
    onFileChange: (path: string, newContent: string) => void;
    onRunFile?: () => void;
    onStopRun?: () => void;
    isRunning?: boolean;
    onGenerateAnimation?: (filePath: string, code: string, language: string, blockInfo: any) => void;
    onCursorChange?: (line: number, column: number) => void;
    settings?: any;
}

/** Extensions that can be "run" */
const RUNNABLE_EXTENSIONS = new Set([
    '.py', '.js', '.ts', '.mjs',
    '.c', '.cpp', '.cc', '.cxx',
    '.java', '.go', '.rs'
]);

function isRunnable(fileName: string): boolean {
    const ext = fileName.substring(fileName.lastIndexOf('.'));
    return RUNNABLE_EXTENSIONS.has(ext.toLowerCase());
}

function Workspace({ openFiles, activeFilePath, setActiveFilePath, onCloseFile, onFileChange, onRunFile, onStopRun, isRunning, onGenerateAnimation, onCursorChange, settings }: WorkspaceProps) {
    const activeFile = openFiles.find(f => f.path === activeFilePath);

    // Refs for Monaco to control markers (squigglies)
    const monacoRef = useRef<any>(null);
    const editorRef = useRef<any>(null);
    const lintTimerRef = useRef<number | null>(null);
    const decorationIdsRef = useRef<string[]>([]);
    const decorationCollectionRef = useRef<any>(null);
    const blocksRef = useRef<any[]>([]);
    const [editorReady, setEditorReady] = useState(0);

    const editorOptions = useMemo(() => ({
        minimap: { enabled: settings?.minimap ?? false },
        glyphMargin: true,
        fontSize: settings?.fontSize || 14,
        fontFamily: settings?.fontFamily || "'JetBrains Mono', monospace",
        lineHeight: 22,
        padding: { top: 16 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth' as const,
        cursorSmoothCaretAnimation: 'on' as const,
        renderWhitespace: 'none' as const,
        readOnly: false,
        automaticLayout: true,
        contextmenu: true,
        wordWrap: (settings?.wordWrap || 'off') as 'off' | 'on' | 'wordWrapColumn' | 'bounded',
        tabSize: settings?.tabSize || 4,
        bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
        matchBrackets: "always" as const,
        autoClosingBrackets: "always" as const,
        autoClosingQuotes: "always" as const,
        formatOnPaste: false,
        formatOnType: false,
        folding: true,
        foldingHighlight: true,
        showFoldingControls: "always" as const,
        suggest: {
            showKeywords: true,
            showSnippets: true,
            showClasses: true,
            showFunctions: true,
            showVariables: true,
        },
        parameterHints: { enabled: true },
        snippetSuggestions: "top" as const,
        scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
            useShadows: false,
        }
    }), [settings]);

    // Live Linter Effect — runs when active file content changes
    useEffect(() => {
        if (!activeFile || !monacoRef.current || !editorRef.current) return;

        const electron = (window as any).electronAPI;
        if (!electron?.lintCode) return;

        // Clear previous timer
        if (lintTimerRef.current) {
            clearTimeout(lintTimerRef.current);
        }

        // Debounce linting by 800ms while user is typing
        lintTimerRef.current = window.setTimeout(async () => {
            try {
                const markers = await electron.lintCode(activeFile.path, activeFile.content);
                const model = editorRef.current.getModel();
                if (model) {
                    // Tell Monaco to draw the squiggly lines!
                    monacoRef.current.editor.setModelMarkers(model, 'linter', markers);
                }
            } catch (err) {
                console.warn('Linter error:', err);
            }
        }, 800);

        return () => {
            if (lintTimerRef.current) clearTimeout(lintTimerRef.current);
        };
    }, [activeFile?.content, activeFile?.path]);

    // Block Detection Effect — detects animatable blocks for ALL languages and adds gutter icons
    useEffect(() => {
        if (!activeFile || !monacoRef.current || !editorRef.current) return;

        // Languages that support block detection
        const ANIMATABLE_LANGS = new Set([
            'python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'csharp',
            'go', 'rust', 'ruby', 'php', 'kotlin', 'swift'
        ]);

        if (!ANIMATABLE_LANGS.has(activeFile.language)) {
            // Clear decorations for unsupported languages
            if (decorationCollectionRef.current) {
                decorationCollectionRef.current.clear();
            } else {
                decorationIdsRef.current = editorRef.current.deltaDecorations(decorationIdsRef.current, []);
            }
            blocksRef.current = [];
            return;
        }

        const electron = (window as any).electronAPI;
        if (!electron?.animation?.detectBlocksUniversal) return;

        const timer = window.setTimeout(async () => {
            try {
                const result = await electron.animation.detectBlocksUniversal(
                    activeFile.content,
                    activeFile.language
                );
                if (!result.success || !Array.isArray(result.blocks)) {
                    if (decorationCollectionRef.current) {
                        decorationCollectionRef.current.clear();
                    } else {
                        decorationIdsRef.current = editorRef.current.deltaDecorations(decorationIdsRef.current, []);
                    }
                    blocksRef.current = [];
                    return;
                }

                blocksRef.current = result.blocks;
                console.log(`[Workspace] Detected ${activeFile.language} blocks:`, result.blocks);

                // Create glyph margin decorations for each block
                const decorations = result.blocks.map((block: any) => ({
                    range: new monacoRef.current.Range(block.startLine, 1, block.startLine, 1),
                    options: {
                        isWholeLine: false,
                        glyphMarginClassName: 'block-play-icon',
                        glyphMarginHoverMessage: { value: `▶ Animate: ${block.label}` },
                    },
                }));

                if (editorRef.current.createDecorationsCollection) {
                    if (!decorationCollectionRef.current) {
                        decorationCollectionRef.current = editorRef.current.createDecorationsCollection([]);
                    }
                    decorationCollectionRef.current.set(decorations);
                } else {
                    decorationIdsRef.current = editorRef.current.deltaDecorations(
                        decorationIdsRef.current,
                        decorations
                    );
                }
            } catch (err) {
                console.warn('[Workspace] Block detection failed:', err);
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, [activeFile?.content, activeFile?.path, activeFile?.language, editorReady]);

    const handleEditorChange = (value: string | undefined) => {
        if (activeFilePath && value !== undefined) {
            onFileChange(activeFilePath, value);
        }
    };

    const handleEditorWillMount = (monaco: any) => {
        if (_monacoConfigured) return;
        _monacoConfigured = true;

        // Enable code suggestions and diagnostics for JS/TS
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
            noSyntaxValidation: false,
        });

        monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ESNext,
            allowNonTsExtensions: true,
            allowJs: true,
            moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            module: monaco.languages.typescript.ModuleKind.CommonJS,
            jsx: monaco.languages.typescript.JsxEmit.React,
        });

        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ESNext,
            allowNonTsExtensions: true,
            moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            module: monaco.languages.typescript.ModuleKind.CommonJS,
            jsx: monaco.languages.typescript.JsxEmit.React,
        });

        // Register custom completions for all languages
        registerPythonCompletions(monaco);
        registerAllCompletions(monaco);

        monaco.editor.defineTheme('custom-black', {
            base: 'vs-dark',
            inherit: true, /* Pulls in all standard syntax highlighting (blue, green, yellow, etc) */
            rules: [], /* Empty rules means it defaults entirely to standard vs-dark colors */
            colors: {
                'editor.background': '#1b1913', /* Core IDE background */
                'editor.lineHighlightBackground': '#49433a',
                'editorGutter.background': '#1b1913',
                'editorSuggestWidget.background': '#1b1913',
                'editorSuggestWidget.border': '#49433a',
                'editorWidget.background': '#1b1913',
                'editorWidget.border': '#49433a',
                'input.background': '#1b1913',
                'list.hoverBackground': '#49433a'
            }
        });
    };

    const lspConnections = useRef(new Set<string>());

    // Connect LSP when a file is opened whose language has a server.
    // We key on language so we connect once per language, not per file.
    useEffect(() => {
        const lang = activeFile?.language || '';
        if (!lang) return;
        if (lspConnections.current.has(lang)) return;
        lspConnections.current.add(lang);
        connectLsp(lang);
        console.log(`[Workspace] Initialized LSP connection for ${lang}`);
    }, [activeFile?.language]);

    // Editor Global Action Listener (from MenuBar)
    useEffect(() => {
        const handler = (e: Event) => {
            const act = (e as CustomEvent).detail;
            const ed = editorRef.current;
            if (!ed) return;

            ed.focus();

            switch (act) {
                // Formatting & Basic Editing
                case 'undo': ed.trigger('keyboard', 'undo', null); break;
                case 'redo': ed.trigger('keyboard', 'redo', null); break;
                case 'cut': document.execCommand('cut'); break;
                case 'copy': document.execCommand('copy'); break;
                case 'paste': document.execCommand('paste'); break;
                case 'selectAll': ed.setSelection(ed.getModel().getFullModelRange()); break;

                // Advanced Selection
                case 'expandSelection': ed.trigger('keyboard', 'editor.action.smartSelect.expand', null); break;
                case 'addCursorAbove': ed.trigger('keyboard', 'editor.action.insertCursorAbove', null); break;
                case 'addCursorBelow': ed.trigger('keyboard', 'editor.action.insertCursorBelow', null); break;

                // Format
                case 'formatDocument': ed.trigger('keyboard', 'editor.action.formatDocument', null); break;

                // Navigation
                case 'goToLine': ed.trigger('keyboard', 'editor.action.gotoLine', null); break;
                case 'navigateBack': ed.trigger('keyboard', 'workbench.action.navigateBack', null); break;
                case 'navigateForward': ed.trigger('keyboard', 'workbench.action.navigateForward', null); break;
            }
        };

        window.addEventListener('editor-action', handler);
        return () => window.removeEventListener('editor-action', handler);
    }, []);

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        setEditorReady(c => c + 1);

        // Report cursor position to parent for status bar
        editor.onDidChangeCursorPosition((e: any) => {
            onCursorChange?.(e.position.lineNumber, e.position.column);
        });

        // Initialize features only once per editor mount
        setupHtmlAutoClose(editor, monaco);

        // Listen for clicks on the glyph margin (play icons)
        editor.onMouseDown((e: any) => {
            if (e.target?.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                const lineNumber = e.target.position?.lineNumber;
                if (!lineNumber) return;

                // Find which block this line belongs to
                const block = blocksRef.current.find((b: any) => b.startLine === lineNumber);
                if (block && onGenerateAnimation && activeFilePath) {
                    onGenerateAnimation(activeFilePath, block.code, block.language, block);
                }
            }
        });
    };

    if (!activeFile) {
        return (
            <div className="workspace empty">
                <div className="empty-workspace-state">
                    <div className="colon-logo-large">&lt;:&gt;</div>
                    <p>Select a file from the explorer to start editing</p>
                    <div className="workspace-shortcuts">
                        <div className="shortcut-row"><span>Find / Open File</span> <kbd>Ctrl+P</kbd></div>
                        <div className="shortcut-row"><span>New Terminal</span> <kbd>Ctrl+`</kbd></div>
                        <div className="shortcut-row"><span>Save File</span> <kbd>Ctrl+S</kbd></div>
                    </div>
                </div>
            </div>
        );
    }

    const canRun = isRunnable(activeFile.name);

    return (
        <div className="workspace">
            {/* Editor Tabs Header */}
            <div className="workspace-tabs">
                <div className="tabs-list">
                    {openFiles.map((f) => (
                        <div
                            key={f.path}
                            className={`workspace-tab ${f.path === activeFilePath ? 'active' : ''}`}
                            onClick={() => setActiveFilePath(f.path)}
                        >
                            <FileIcon fileName={f.name} size={14} className="tab-icon" />
                            <span className="tab-title">{f.isDirty ? '● ' : ''}{f.name}</span>
                            <div className="tab-close-icon" onClick={(e) => { e.stopPropagation(); onCloseFile(f.path); }}>
                                <LuX />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Run Button */}
                {canRun && (
                    <div className="editor-toolbar">
                        {isRunning ? (
                            <button className="run-btn stop" onClick={onStopRun} title="Stop (Ctrl+Shift+F5)">
                                <LuSquare /> Stop
                            </button>
                        ) : (
                            <button className="run-btn" onClick={onRunFile} title="Run File (Ctrl+F5)">
                                <LuPlay /> Run
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Monaco Editor */}
            <div className="workspace-editor-container">
                <Editor
                    path={activeFile.path}
                    height="100%"
                    language={activeFile.language}
                    theme="custom-black"
                    defaultValue={activeFile.content}
                    onChange={handleEditorChange}
                    beforeMount={handleEditorWillMount}
                    onMount={handleEditorDidMount}
                    options={editorOptions}
                />
            </div>
        </div>
    );
}

export default Workspace;
