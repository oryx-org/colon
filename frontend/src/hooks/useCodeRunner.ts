/**
 * useCodeRunner — Manages code execution and runtime installation.
 *
 * Extracted from App.tsx to reduce root component complexity.
 * Handles: running active file, stopping code, installing missing runtimes,
 * environment scanning.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import type { OpenFile, RuntimeInfo } from '../App';
import type { TerminalPanelRef } from '../components/TerminalPanel/TerminalPanel';

export function useCodeRunner(
  activeFileRef: React.MutableRefObject<OpenFile | null>,
  terminalRef: React.RefObject<TerminalPanelRef | null>,
  saveActiveFile: () => Promise<void>,
  setShowTerminal: (v: boolean | ((prev: boolean) => boolean)) => void,
) {
  const [_environments, setEnvironments] = useState<Record<string, RuntimeInfo>>({});
  const [isRunning, setIsRunning] = useState(false);

  // Mirror isRunning in a ref so keydown handler closure always reads fresh value
  const isRunningRef = useRef(false);
  const setIsRunningSync = (val: boolean) => {
    isRunningRef.current = val;
    setIsRunning(val);
  };

  const refreshEnvironments = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.scanEnvironments) return null;
    const envs = await api.scanEnvironments();
    setEnvironments(envs);
    return envs;
  }, []);

  const installMissingRuntime = useCallback(async (runtime: RuntimeInfo | undefined, reason: string) => {
    const runtimeName = runtime?.name || 'Required runtime';

    setShowTerminal(true);

    if (!runtime?.id) {
      terminalRef.current?.sendCommandToTerminal(
        `echo "⚠️ ${reason}" && echo "No automatic install command is available for this OS/runtime."`
      );
      return;
    }

    const api = (window as any).electronAPI;
    if (!api?.getInstallCommand) {
      terminalRef.current?.sendCommandToTerminal(
        `echo "⚠️ Installer API not available."`
      );
      return;
    }

    const result = await api.getInstallCommand(runtime.id);
    if (!result?.success) {
      terminalRef.current?.sendCommandToTerminal(
        `echo "⚠️ ${result?.reason || `No install command available for ${runtimeName}`}"`
      );
      return;
    }

    const shouldInstall = window.confirm(
      `${reason}\n\nColon will run the install command in terminal:\n${result.command}\n\n` +
      'Continue? You can interact with the terminal during installation.'
    );

    if (!shouldInstall) {
      terminalRef.current?.sendCommandToTerminal(
        `echo "ℹ️ Installation cancelled. Run manually: ${result.command}"`
      );
      return;
    }

    terminalRef.current?.sendCommandToTerminal(result.command);
  }, [setShowTerminal, terminalRef]);

  // Scan environments on startup
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api) {
      refreshEnvironments().then((envs) => {
        if (envs) console.log('[useCodeRunner] Environments scanned:', envs);
        return undefined;
      }).catch((err: any) => console.error('[useCodeRunner] Failed to scan environments:', err));
    }
  }, [refreshEnvironments]);

  /**
   * Run active file — the VS Code way:
   * 1. Save file if dirty
   * 2. Ask backend for the shell command (e.g., "python3 /path/to/file.py")
   * 3. Type that command into the active terminal PTY
   */
  const runActiveFile = async () => {
    const file = activeFileRef.current;
    if (!file || isRunningRef.current) return;

    try {
      if (file.isDirty) await saveActiveFile();

      const api = (window as any).electronAPI;
      if (!api) return;

      const result = await api.getRunCommand(file.path);

      if (!result.success) {
        await installMissingRuntime(result.runtime, result.reason);
        return;
      }

      setShowTerminal(true);
      setIsRunningSync(true);
      terminalRef.current?.sendCommandToTerminal(result.command);
      // Auto-reset the Run button after 1.5s
      setTimeout(() => setIsRunningSync(false), 1500);
    } catch (err) {
      console.error('[useCodeRunner] runActiveFile error:', err);
      setIsRunningSync(false);
    }
  };

  const stopRunningCode = () => {
    // Send raw Ctrl+C to the active terminal to interrupt the running process
    terminalRef.current?.sendRawToTerminal('\x03');
    setIsRunningSync(false);
  };

  return {
    isRunning,
    isRunningRef,
    refreshEnvironments,
    runActiveFile,
    stopRunningCode,
  };
}
