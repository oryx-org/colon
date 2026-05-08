import { LuRefreshCw, LuCloudDownload, LuCheck, LuCircleX, LuTerminal } from 'react-icons/lu';
import { useState, useEffect } from 'react';

import './LanguageManagerPanel.css';

interface RuntimeEnvironment {
    id: string;
    name: string;
    installed: boolean;
    version?: string;
    path?: string;
    command?: string;
    extensions?: string[];
    installCmd?: string;
    reason?: string;
    installError?: string;
    installManager?: string;
}

interface LanguageManagerPanelProps {
    onRunInTerminal?: (command: string) => void;
    onShowTerminal?: () => void;
}

export default function LanguageManagerPanel({ onRunInTerminal, onShowTerminal }: LanguageManagerPanelProps) {
    const [environments, setEnvironments] = useState<Record<string, RuntimeEnvironment>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [sentToTerminal, setSentToTerminal] = useState<Record<string, boolean>>({});

    const [animEngineStatus, setAnimEngineStatus] = useState<{
        installed: boolean;
        pythonFound?: boolean;
        engineFound?: boolean;
        ffmpegFound?: boolean;
        engineVersion?: string | null;
        details?: string;
    } | null>(null);
    const [animEngineInstalling, setAnimEngineInstalling] = useState(false);
    const [animEngineInstallLogs, setAnimEngineInstallLogs] = useState('');
    const [animEngineInstallResult, setAnimEngineInstallResult] = useState<'success' | 'failed' | null>(null);

    const electron = (window as any).electronAPI;

    const loadEnvironments = async () => {
        if (!electron?.getEnvironments) return;
        setIsLoading(true);
        try {
            const envs = await electron.getEnvironments();
            setEnvironments(envs);
        } catch (e) {
            console.error('Failed to load environments', e);
        } finally {
            setIsLoading(false);
        }
    };

    const scanEnvironments = async () => {
        if (!electron?.scanEnvironments) return;
        setIsLoading(true);
        try {
            const envs = await electron.scanEnvironments();
            setEnvironments(envs);
            // Clear "sent to terminal" flags on re-scan so badges update properly
            setSentToTerminal({});
        } catch (e) {
            console.error('Failed to scan environments', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadEnvironments();
        
        if (electron?.animEngine?.check) {
            electron.animEngine.check().then((status: any) => {
                setAnimEngineStatus(status);
                return undefined;
            }).catch((err: any) => {
                console.error('Failed to check animation engine status', err);
            });
        }
        
        if (electron?.animEngine?.onInstallProgress) {
            electron.animEngine.onInstallProgress((msg: string) => {
                setAnimEngineInstallLogs(prev => {
                    const next = prev + msg;
                    // Cap at ~50KB to prevent React re-render slowdown
                    return next.length > 50000 ? next.slice(-40000) : next;
                });
            });
        }
        
        return () => {
            if (electron?.animEngine?.removeInstallListeners) {
                electron.animEngine.removeInstallListeners();
            }
        };
    }, []);

    /** Terminal-based install: get the command and send it to the IDE terminal */
    const handleInstall = async (runtimeId: string) => {
        if (!electron?.getInstallCommand) return;

        try {
            const result = await electron.getInstallCommand(runtimeId);

            if (result?.alreadyInstalled) {
                // Already installed — just re-scan to refresh the UI
                scanEnvironments();
                return;
            }

            if (!result?.success) {
                // Show error inline — no command available
                console.error(result?.reason || 'No install command available for this runtime.');
                return;
            }

            // Show the terminal and send the install command
            onShowTerminal?.();
            onRunInTerminal?.(result.command);

            // Mark this runtime as "sent to terminal" for UI feedback
            setSentToTerminal(prev => ({ ...prev, [runtimeId]: true }));
        } catch (e: any) {
            console.error(`Failed to get install command: ${e.message}`);
        }
    };

    const handleInstallAnimEngine = async () => {
        if (!electron?.animEngine?.install) return;
        setAnimEngineInstalling(true);
        setAnimEngineInstallLogs('');
        setAnimEngineInstallResult(null);
        try {
            const result = await electron.animEngine.install();
            if (result.success) {
                setAnimEngineInstallResult('success');
                const status = await electron.animEngine.check();
                setAnimEngineStatus(status);
            } else {
                setAnimEngineInstallResult('failed');
                setAnimEngineInstallLogs(prev => `${prev}\n${result.error || 'Unknown error'}`);
            }
        } catch (e: any) {
            setAnimEngineInstallResult('failed');
            setAnimEngineInstallLogs(prev => `${prev}\n${e.message}`);
        } finally {
            setAnimEngineInstalling(false);
        }
    };

    return (
        <div className="language-manager">
            <div className="lm-header">
                <span className="lm-title">EXTENSIONS</span>
                <button className="lm-refresh-btn" onClick={scanEnvironments} title="Re-scan for installed runtimes" disabled={isLoading}>
                    <LuRefreshCw className={isLoading ? 'spinning' : ''} />
                </button>
            </div>
            
            <div className="lm-content">
                {/* ── Colon Animation Engine Section ── */}
                <div className="lm-section-label">TOOLS & ENGINES</div>

                <div className="lm-card lm-card-engine">
                    <div className="lm-card-header">
                        <h3 className="lm-card-title">Colon Animation Engine</h3>
                        {animEngineStatus?.installed ? (
                            <span className="lm-badge success"><LuCheck /> Installed</span>
                        ) : (
                            <span className="lm-badge missing">Not Installed</span>
                        )}
                    </div>

                    <div className="lm-card-details">
                        {animEngineStatus?.installed ? (
                            <>
                                <div><span className="lm-label">Version: </span>{animEngineStatus.engineVersion || 'unknown'}</div>
                            </>
                        ) : (
                            <div className="lm-not-installed-msg">
                                {animEngineStatus?.details || 'Required for generating code execution videos and animations.'}
                            </div>
                        )}

                        {animEngineInstallResult === 'success' && (
                            <div className="lm-success-msg">
                                ✅ Installed successfully! Please restart the IDE to activate.
                            </div>
                        )}

                        {animEngineInstallResult === 'failed' && (
                            <div className="lm-error">
                                <LuCircleX /> Installation failed. Check logs below.
                            </div>
                        )}
                    </div>

                    {/* Install logs */}
                    {(animEngineInstalling || animEngineInstallLogs) && (
                        <pre className="lm-install-logs">
                            {animEngineInstallLogs || 'Starting installation...'}
                        </pre>
                    )}

                    <div className="lm-card-actions">
                        {!animEngineStatus?.installed && (
                            <button
                                className="lm-install-btn"
                                onClick={handleInstallAnimEngine}
                                disabled={animEngineInstalling || !animEngineStatus?.pythonFound}
                                title={!animEngineStatus?.pythonFound ? 'Install Python first' : 'Install Colon Animation Engine'}
                            >
                                <LuCloudDownload /> {animEngineInstalling ? 'Installing...' : 'Install'}
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Languages Section Label ── */}
                <div className="lm-section-label">LANGUAGES</div>

                {Object.values(environments).map(env => {
                    const wasSentToTerminal = sentToTerminal[env.id];
                    
                    return (
                        <div key={env.id} className="lm-card">
                            <div className="lm-card-header">
                                <h3 className="lm-card-title">{env.name}</h3>
                                {env.installed ? (
                                    <span className="lm-badge success"><LuCheck /> Installed</span>
                                ) : wasSentToTerminal ? (
                                    <span className="lm-badge installing"><LuTerminal /> Installing</span>
                                ) : (
                                    <span className="lm-badge missing">Missing</span>
                                )}
                            </div>
                            
                            <div className="lm-card-details">
                                {env.installed ? (
                                    <>
                                        <div><span className="lm-label">Version: </span> {env.version}</div>
                                        <div><span className="lm-label">Path: </span> <span className="lm-path">{env.path}</span></div>
                                    </>
                                ) : wasSentToTerminal ? (
                                    <div className="lm-terminal-hint">
                                        <LuTerminal style={{ flexShrink: 0, marginTop: 1 }} />
                                        <span>
                                            Install command sent to terminal. Complete the installation there, 
                                            then click <strong>Refresh</strong> <LuRefreshCw style={{ verticalAlign: 'middle', fontSize: 11 }} /> above to re-scan.
                                        </span>
                                    </div>
                                ) : (
                                    <div className="lm-not-installed-msg">
                                        {env.reason || 'This runtime is not installed on your system.'}
                                    </div>
                                )}

                                {env.installError && !env.installed && !wasSentToTerminal && (
                                    <div className="lm-not-installed-msg" style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                                        {env.installError}
                                    </div>
                                )}
                            </div>
                            
                            <div className="lm-card-actions">
                                {!env.installed && env.installCmd && (
                                    <button 
                                        className="lm-install-btn"
                                        onClick={() => handleInstall(env.id)}
                                        disabled={wasSentToTerminal}
                                        title={wasSentToTerminal 
                                            ? 'Install command already sent to terminal' 
                                            : `Install ${env.name} via ${env.installManager || 'system installer'}`
                                        }
                                    >
                                        <LuTerminal /> {wasSentToTerminal ? 'Sent to Terminal' : 'Install'}
                                    </button>
                                )}
                                {wasSentToTerminal && !env.installed && (
                                    <button 
                                        className="lm-rescan-btn"
                                        onClick={scanEnvironments}
                                        disabled={isLoading}
                                    >
                                        <LuRefreshCw className={isLoading ? 'spinning' : ''} /> Re-scan
                                    </button>
                                )}
                                {!env.installed && !env.installCmd && !env.installError && (
                                    <span style={{ fontSize: 11, opacity: 0.5 }}>No installer available for this OS</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
