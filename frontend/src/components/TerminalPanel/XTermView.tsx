import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { xtermRegistry } from './TerminalPanel';
import '@xterm/xterm/css/xterm.css';

interface XTermViewProps {
    terminalId: string;
    isVisible: boolean;
    onFocus?: () => void;
}

function XTermView({ terminalId, isVisible, onFocus }: XTermViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const fitTimerRef = useRef<number | null>(null);
    const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);

    /** Debounced fit — prevents rapid layout thrashing */
    const debouncedFit = () => {
        if (fitTimerRef.current) cancelAnimationFrame(fitTimerRef.current);
        fitTimerRef.current = requestAnimationFrame(() => {
            try {
                const el = containerRef.current;
                // During panel drag/show-hide transitions, zero/tiny dimensions can occur briefly.
                // Fitting in that state can produce invalid row/col calculations.
                if (!el || el.clientWidth < 40 || el.clientHeight < 30) return;
                if (fitAddonRef.current && xtermRef.current?.element) {
                    fitAddonRef.current.fit();
                }
            } catch {
                // ignore fit errors during rapid resizing
            }
        });
    };

    useEffect(() => {
        if (!containerRef.current) return;

        const terminal = new Terminal({
            cursorBlink: true,
            scrollback: 10000,
            convertEol: true,
            allowProposedApi: true,
            theme: {
                background: '#000000',
                foreground: '#d4d4d4',
                cursor: '#aeafad',
                selectionBackground: '#264f78',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#e5e5e5',
            },
            fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
            fontSize: 13,
            lineHeight: 1.35,
            letterSpacing: 0,
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(containerRef.current);

        xtermRef.current = terminal;
        fitAddonRef.current = fitAddon;

        // Initial fit after a short delay to allow DOM to settle
        const initFitTimer = setTimeout(() => {
            try { fitAddon.fit(); } catch { /* ignore */ }
        }, 100);

        let ptyResizeTimer: ReturnType<typeof setTimeout>;

        // Connect to Electron backend PTY
        const electron = (window as any).electronAPI;
        if (electron?.terminal) {
            electron.terminal.create(terminalId);

            terminal.onData((data: string) => {
                electron.terminal.input(terminalId, data);
            });

            electron.terminal.onData(terminalId, (data: string) => {
                terminal.write(data);
            });

            terminal.onResize(({ cols, rows }) => {
                // Ignore transient invalid sizes while Split panels are being dragged.
                if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
                if (cols < 2 || rows < 2) return;

                const prev = lastResizeRef.current;
                if (prev && prev.cols === cols && prev.rows === rows) return;

                lastResizeRef.current = { cols, rows };
                
                // Debounce backend PTY resize to prevent SIGWINCH spam 
                // which causes extra prompts & vanishing text
                clearTimeout(ptyResizeTimer);
                ptyResizeTimer = setTimeout(() => {
                    electron.terminal.resize(terminalId, cols, rows);
                }, 100);
            });
        }

        // Debounced resize observer — prevents glitchiness
        const observer = new ResizeObserver(() => {
            debouncedFit();
        });
        observer.observe(containerRef.current);

        // Register in shared registry for code runner
        xtermRegistry.set(terminalId, terminal);

        return () => {
            clearTimeout(initFitTimer);
            if (ptyResizeTimer) clearTimeout(ptyResizeTimer);
            if (fitTimerRef.current) cancelAnimationFrame(fitTimerRef.current);
            observer.disconnect();
            xtermRegistry.delete(terminalId);
            const electron = (window as any).electronAPI;
            // Kill backend PTY so StrictMode double-mount doesn't leave orphaned processes
            electron?.terminal?.kill(terminalId);
            electron?.terminal?.removeDataListener?.(terminalId);
            try { terminal.dispose(); } catch { /* ignore */ }
        };
    }, [terminalId]);

    // Handle visibility changes → refit so columns are correct
    useEffect(() => {
        if (isVisible && fitAddonRef.current && xtermRef.current?.element) {
            // Use multiple delayed refits to handle slow layout transitions
            const t1 = setTimeout(() => debouncedFit(), 50);
            const t2 = setTimeout(() => debouncedFit(), 200);
            const t3 = setTimeout(() => {
                debouncedFit();
                xtermRef.current?.focus();
            }, 400);
            return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
        }
    }, [isVisible]);

    return (
        <div
            ref={containerRef}
            className="xterm-container"
            onClick={onFocus}
        />
    );
}

export default XTermView;
