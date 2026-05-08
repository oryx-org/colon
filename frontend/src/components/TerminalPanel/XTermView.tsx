import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
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
    const mountedRef = useRef(false);

    const debouncedFit = () => {
        if (fitTimerRef.current) cancelAnimationFrame(fitTimerRef.current);
        fitTimerRef.current = requestAnimationFrame(() => {
            try {
                const el = containerRef.current;
                if (!el || el.clientWidth < 40 || el.clientHeight < 30) return;
                if (fitAddonRef.current && xtermRef.current?.element) {
                    fitAddonRef.current.fit();
                }
            } catch {
                /* ignore */
            }
        });
    };

    useEffect(() => {
        // Guard against React StrictMode double-mount.
        // On the first mount we set mountedRef=true and create the terminal.
        // StrictMode unmount sets it false, then the second mount sees it's false
        // and creates the terminal again. The cleanup only kills the PTY if
        // the component is TRULY being removed (mountedRef stays false after unmount).
        if (mountedRef.current) return;
        mountedRef.current = true;

        if (!containerRef.current) return;

        const terminal = new Terminal({
            cursorBlink: true,
            cursorStyle: 'bar',
            cursorWidth: 2,
            scrollback: 5000,
            convertEol: true,
            allowProposedApi: true,
            rightClickSelectsWord: true,
            theme: {
                background: '#1b1913',
                foreground: '#d4d4d4',
                cursor: '#d4d4d4',
                cursorAccent: '#1b1913',
                selectionBackground: 'rgba(255, 255, 255, 0.15)',
                selectionForeground: '#ffffff',
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
                brightWhite: '#ffffff',
            },
            fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", "Consolas", monospace',
            fontSize: 13,
            lineHeight: 1.3,
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        try {
            terminal.loadAddon(new WebLinksAddon());
        } catch { /* not critical */ }

        terminal.open(containerRef.current);

        xtermRef.current = terminal;
        fitAddonRef.current = fitAddon;

        // Clipboard support
        terminal.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
            // Ctrl+C with selection → copy (don't send SIGINT)
            if (ev.ctrlKey && ev.key === 'c' && terminal.hasSelection()) {
                navigator.clipboard.writeText(terminal.getSelection());
                terminal.clearSelection();
                return false;
            }
            // Ctrl+V → paste
            if (ev.ctrlKey && ev.key === 'v' && ev.type === 'keydown') {
                navigator.clipboard.readText().then(text => {
                    if (text) {
                        const api = (window as any).electronAPI;
                        api?.terminal?.input(terminalId, text);
                    }
                    return undefined;
                }).catch(() => {});
                return false;
            }
            // Ctrl+Shift+C → always copy
            if (ev.ctrlKey && ev.shiftKey && ev.key === 'C') {
                const sel = terminal.getSelection();
                if (sel) navigator.clipboard.writeText(sel);
                return false;
            }
            // Ctrl+Shift+V → always paste
            if (ev.ctrlKey && ev.shiftKey && ev.key === 'V' && ev.type === 'keydown') {
                navigator.clipboard.readText().then(text => {
                    if (text) {
                        const api = (window as any).electronAPI;
                        api?.terminal?.input(terminalId, text);
                    }
                    return undefined;
                }).catch(() => {});
                return false;
            }
            return true;
        });

        // Initial fit after DOM settles
        const initFit = setTimeout(() => {
            try { fitAddon.fit(); } catch { /* */ }
        }, 150);

        let ptyResizeTimer: ReturnType<typeof setTimeout>;

        // Connect to backend PTY
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
                if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
                if (cols < 2 || rows < 2) return;
                const prev = lastResizeRef.current;
                if (prev && prev.cols === cols && prev.rows === rows) return;
                lastResizeRef.current = { cols, rows };
                clearTimeout(ptyResizeTimer);
                ptyResizeTimer = setTimeout(() => {
                    electron.terminal.resize(terminalId, cols, rows);
                }, 80);
            });
        }

        // Resize observer
        const observer = new ResizeObserver(() => debouncedFit());
        observer.observe(containerRef.current);

        xtermRegistry.set(terminalId, terminal);
        terminal.focus();

        return () => {
            // In StrictMode dev, this cleanup runs between mount #1 and mount #2.
            // We set mountedRef to false so the next mount can re-create.
            mountedRef.current = false;

            clearTimeout(initFit);
            if (ptyResizeTimer) clearTimeout(ptyResizeTimer);
            if (fitTimerRef.current) cancelAnimationFrame(fitTimerRef.current);
            observer.disconnect();
            xtermRegistry.delete(terminalId);

            // Delay PTY kill slightly — if StrictMode remounts within 100ms,
            // the new mount will set mountedRef=true and we skip the kill.
            const tid = terminalId;
            setTimeout(() => {
                if (!mountedRef.current) {
                    const api = (window as any).electronAPI;
                    api?.terminal?.kill(tid);
                    api?.terminal?.removeDataListener?.(tid);
                }
            }, 100);

            try { terminal.dispose(); } catch { /* */ }
        };
    }, [terminalId]);

    // Refit on visibility change
    useEffect(() => {
        if (isVisible && fitAddonRef.current && xtermRef.current?.element) {
            const t1 = setTimeout(() => debouncedFit(), 50);
            const t2 = setTimeout(() => {
                debouncedFit();
                xtermRef.current?.focus();
            }, 200);
            return () => { clearTimeout(t1); clearTimeout(t2); };
        }
    }, [isVisible]);

    return (
        <div
            ref={containerRef}
            className="xterm-container"
            onClick={() => {
                onFocus?.();
                xtermRef.current?.focus();
            }}
        />
    );
}

export default XTermView;
