import { LuPlay, LuBug, LuSquare, LuStepForward, LuArrowDownToLine, LuArrowUpFromLine, LuRotateCcw } from 'react-icons/lu';
import { useState, useCallback, useEffect, useMemo } from 'react';

import './RunAndDebugPanel.css';

interface RunAndDebugPanelProps {
    activeFileName: string | undefined;
    activeFilePath?: string;
    activeLanguage?: string;
    onRunFile?: () => void;
    onStopRun?: () => void;
    isRunning?: boolean;
}

type DebugOutputLine = {
    stream: 'stdout' | 'stderr';
    text: string;
    ts: number;
};

export default function RunAndDebugPanel({ activeFileName, activeFilePath, activeLanguage, onRunFile, onStopRun, isRunning }: RunAndDebugPanelProps) {
    const [isDebugging, setIsDebugging] = useState(false);
    const [sessionId, setSessionId] = useState<number | null>(null);
    const [debugState, setDebugState] = useState<'starting' | 'running' | 'paused' | 'stopped' | 'error'>('stopped');
    const [debugOutput, setDebugOutput] = useState<DebugOutputLine[]>([]);
    const [watchInput, setWatchInput] = useState('');
    const [watchExpressions, setWatchExpressions] = useState<string[]>([]);
    const [breakpointInput, setBreakpointInput] = useState('');
    const [breakpoints, setBreakpoints] = useState<number[]>([]);

    useEffect(() => {
        if (!activeFilePath) {
            setBreakpoints([]);
            return;
        }
        const raw = localStorage.getItem(`colon_breakpoints:${activeFilePath}`);
        if (!raw) {
            setBreakpoints([]);
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            setBreakpoints(Array.isArray(parsed) ? parsed.filter((x) => Number.isInteger(x) && x > 0) : []);
        } catch {
            setBreakpoints([]);
        }
    }, [activeFilePath]);

    const saveBreakpoints = useCallback((next: number[]) => {
        setBreakpoints(next);
        if (activeFilePath) {
            localStorage.setItem(`colon_breakpoints:${activeFilePath}`, JSON.stringify(next));
        }
    }, [activeFilePath]);

    const parsedVariables = useMemo(() => {
        const vars = new Map<string, string>();
        for (const line of debugOutput) {
            const text = line.text.trim();
            const m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
            if (m) vars.set(m[1], m[2]);
        }
        return Array.from(vars.entries());
    }, [debugOutput]);

    const watchValues = useMemo(() => {
        const lines = debugOutput.map((l) => l.text).join('\n');
        return watchExpressions.map((expr) => {
            const exact = new RegExp(`(^|\\n)${expr.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*=\\s*([^\\n]+)`, 'i').exec(lines);
            return { expr, value: exact?.[2]?.trim() || 'n/a' };
        });
    }, [watchExpressions, debugOutput]);

    const handleStartDebug = useCallback(async () => {
        if (!activeFilePath) return;
        const electron = (window as any).electronAPI;
        if (electron && electron.debug) {
            try {
                const res = await electron.debug.start(activeFilePath, activeLanguage, {});
                if (!res?.success) {
                    console.error('Failed to start debugger:', res?.error || 'Unknown error');
                    return;
                }
                setSessionId(res.sessionId);
                setDebugState('starting');
                setIsDebugging(true);
                if (breakpoints.length > 0) {
                    console.info('[debug] breakpoints loaded for this file:', breakpoints);
                }
            } catch (err) {
                console.error("Failed to start debugging:", err);
            }
        }
    }, [activeFilePath, activeLanguage, breakpoints]);

    const handleStopDebug = useCallback(async () => {
        const electron = (window as any).electronAPI;
        if (electron && electron.debug && sessionId) {
            await electron.debug.stop(sessionId);
        }
        setSessionId(null);
        setDebugState('stopped');
        setIsDebugging(false);
    }, [sessionId]);

    const handleStep = useCallback(async (action: 'continue' | 'stepOver' | 'stepInto' | 'stepOut' | 'pause') => {
        const electron = (window as any).electronAPI;
        if (!sessionId || !electron?.debug?.step) return;
        await electron.debug.step(sessionId, action);
    }, [sessionId]);

    useEffect(() => {
        if (!isDebugging || !sessionId) return;

        const timer = setInterval(async () => {
            const electron = (window as any).electronAPI;
            if (!electron?.debug?.status) return;

            const res = await electron.debug.status(sessionId);
            if (!res?.success) {
                setDebugState('error');
                if (String(res?.error || '').toLowerCase().includes('not found')) {
                    setIsDebugging(false);
                    setSessionId(null);
                }
                return;
            }

            setDebugState(res.session?.state || 'running');
            setDebugOutput(Array.isArray(res.output) ? res.output : []);

            if (res.session?.state === 'stopped' || res.session?.exited) {
                setIsDebugging(false);
                setSessionId(null);
            }
        }, 700);

        return () => clearInterval(timer);
    }, [isDebugging, sessionId]);

    const addWatchExpression = useCallback(() => {
        const expr = watchInput.trim();
        if (!expr || watchExpressions.includes(expr)) return;
        setWatchExpressions(prev => [...prev, expr]);
        setWatchInput('');
    }, [watchInput, watchExpressions]);

    const removeWatchExpression = useCallback((expr: string) => {
        setWatchExpressions(prev => prev.filter(e => e !== expr));
    }, []);

    const addBreakpoint = useCallback(() => {
        const line = Number.parseInt(breakpointInput, 10);
        if (!Number.isInteger(line) || line <= 0 || breakpoints.includes(line)) return;
        const next = [...breakpoints, line].sort((a, b) => a - b);
        saveBreakpoints(next);
        setBreakpointInput('');
    }, [breakpointInput, breakpoints, saveBreakpoints]);

    const removeBreakpoint = useCallback((line: number) => {
        saveBreakpoints(breakpoints.filter((bp) => bp !== line));
    }, [breakpoints, saveBreakpoints]);

    return (
        <div className="debug-panel">
            <div className="debug-header">
                <span className="debug-title">RUN AND DEBUG</span>
            </div>
            
            <div className="debug-content">
                {activeFileName ? (
                    <div className="debug-active-file">
                        <div className="debug-file-label">Active File:</div>
                        <div className="debug-file-name">{activeFileName}</div>
                        
                        <div className="debug-primary-actions">
                            {!isRunning && !isDebugging ? (
                                <>
                                    <button className="debug-btn run" onClick={onRunFile}>
                                        <LuPlay /> Run Code
                                    </button>
                                    <button className="debug-btn debug-mode" onClick={handleStartDebug}>
                                        <LuBug /> Start Debugging
                                    </button>
                                </>
                            ) : null}

                            {isRunning && !isDebugging ? (
                                <button className="debug-btn stop" onClick={onStopRun}>
                                    <LuSquare /> Stop Code
                                </button>
                            ) : null}

                            {isDebugging ? (
                                <div className="debug-active-controls">
                                    <div className="debug-control-group">
                                        <button className="debug-btn-icon" title="Continue" onClick={() => handleStep('continue')}><LuPlay /></button>
                                        <button className="debug-btn-icon" title="Step Over" onClick={() => handleStep('stepOver')}><LuStepForward /></button>
                                        <button className="debug-btn-icon" title="Step Into" onClick={() => handleStep('stepInto')}><LuArrowDownToLine /></button>
                                        <button className="debug-btn-icon" title="Step Out" onClick={() => handleStep('stepOut')}><LuArrowUpFromLine /></button>
                                        <button className="debug-btn-icon" title="Pause" onClick={() => handleStep('pause')}><LuRotateCcw /></button>
                                        <button className="debug-btn-icon stop" title="Stop" onClick={handleStopDebug}><LuSquare /></button>
                                    </div>
                                    <div className="debug-status-pill">● {debugState}</div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className="debug-no-file">
                        Open a file to run or debug.
                    </div>
                )}
                
                <div className="debug-controls-section">
                    <div className="debug-section-header">VARIABLES</div>
                    {parsedVariables.length === 0 ? (
                        <div className="debug-empty-state">No variables detected yet</div>
                    ) : (
                        <div className="debug-keyvalue-list">
                            {parsedVariables.map(([k, v]) => (
                                <div key={k} className="debug-keyvalue-row">
                                    <span className="debug-key">{k}</span>
                                    <span className="debug-value">{v}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="debug-controls-section">
                    <div className="debug-section-header">WATCH</div>
                    <div className="debug-inline-form">
                        <input
                            className="debug-input"
                            type="text"
                            placeholder="expression (e.g. total)"
                            value={watchInput}
                            onChange={(e) => setWatchInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addWatchExpression()}
                        />
                        <button className="debug-inline-btn" onClick={addWatchExpression}>Add</button>
                    </div>
                    {watchValues.length === 0 ? (
                        <div className="debug-empty-state">Add an expression to start watching values</div>
                    ) : (
                        <div className="debug-keyvalue-list">
                            {watchValues.map(({ expr, value }) => (
                                <div key={expr} className="debug-keyvalue-row">
                                    <span className="debug-key">{expr}</span>
                                    <span className="debug-value">{value}</span>
                                    <button className="debug-remove-btn" onClick={() => removeWatchExpression(expr)}>x</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="debug-controls-section">
                    <div className="debug-section-header">CALL STACK</div>
                    <div className="debug-empty-state">{isDebugging ? `Session ${sessionId || ''} (${debugState})` : 'Not paused'}</div>
                </div>
                
                <div className="debug-controls-section">
                    <div className="debug-section-header">BREAKPOINTS</div>
                    <div className="debug-inline-form">
                        <input
                            className="debug-input"
                            type="number"
                            min={1}
                            placeholder="line number"
                            value={breakpointInput}
                            onChange={(e) => setBreakpointInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addBreakpoint()}
                        />
                        <button className="debug-inline-btn" onClick={addBreakpoint}>Add</button>
                    </div>
                    {breakpoints.length === 0 ? (
                        <div className="debug-empty-state">No breakpoints set for this file</div>
                    ) : (
                        <div className="debug-keyvalue-list">
                            {breakpoints.map((line) => (
                                <div key={line} className="debug-keyvalue-row">
                                    <span className="debug-key">Line {line}</span>
                                    <span className="debug-value">{activeFileName || 'Current file'}</span>
                                    <button className="debug-remove-btn" onClick={() => removeBreakpoint(line)}>x</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="debug-controls-section">
                    <div className="debug-section-header">DEBUG CONSOLE</div>
                    <div className="debug-console">
                        {debugOutput.length === 0 ? (
                            <div className="debug-empty-state">No debug output yet</div>
                        ) : (
                            debugOutput.map((line, idx) => (
                                <div key={`${line.ts}-${idx}`} className={`debug-console-line ${line.stream}`}>
                                    {line.text}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
