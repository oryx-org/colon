import { LuRefreshCw, LuCloudDownload, LuCheck, LuCircleX } from 'react-icons/lu';
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
}

interface InstallProgress {
    runtimeId: string;
    status: 'installing' | 'failed' | 'success';
    stdout?: string;
    stderr?: string;
    error?: string;
}

export default function LanguageManagerPanel() {
    const [environments, setEnvironments] = useState<Record<string, RuntimeEnvironment>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [installProgress, setInstallProgress] = useState<Record<string, InstallProgress>>({});

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

        if (electron?.onRuntimeInstallEvent) {
            electron.onRuntimeInstallEvent((payload: any) => {
                setInstallProgress(prev => {
                    const current = prev[payload.runtimeId] || { runtimeId: payload.runtimeId, status: 'installing' };
                    
                    if (payload.type === 'exit') {
                        // Backend sends type:'exit' with success:true/false on completion
                        const status = payload.success ? 'success' : 'failed';
                        if (payload.success) {
                            // Re-scan environments after successful install
                            scanEnvironments();
                        }
                        return { ...prev, [payload.runtimeId]: { ...current, status, error: payload.success ? undefined : payload.message } };
                    } else if (payload.type === 'error') {
                        return { ...prev, [payload.runtimeId]: { ...current, status: 'failed', error: payload.message } };
                    } else if (payload.type === 'stdout' || payload.type === 'stderr') {
                        return { ...prev, [payload.runtimeId]: { ...current, status: 'installing', stdout: payload.message } };
                    } else if (payload.type === 'start') {
                        return { ...prev, [payload.runtimeId]: { runtimeId: payload.runtimeId, status: 'installing' } };
                    }
                    return prev;
                });
            });
        }
        
        return () => {
            if (electron?.removeRuntimeInstallListeners) {
                electron.removeRuntimeInstallListeners();
            }
            if (electron?.animEngine?.removeInstallListeners) {
                electron.animEngine.removeInstallListeners();
            }
        };
    }, []);

    const handleInstall = async (runtimeId: string) => {
        if (!electron?.installRuntime) return;
        setInstallProgress(prev => ({
            ...prev,
            [runtimeId]: { runtimeId, status: 'installing' }
        }));
        try {
            const success = await electron.installRuntime(runtimeId);
            if (success) {
                // re-scan
                scanEnvironments();
            } else {
                setInstallProgress(prev => ({
                    ...prev,
                    [runtimeId]: { runtimeId, status: 'failed', error: 'Installation failed' }
                }));
            }
        } catch (e: any) {
            setInstallProgress(prev => ({
                ...prev,
                [runtimeId]: { runtimeId, status: 'failed', error: e.message }
            }));
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
                setAnimEngineInstallLogs(prev => prev + '\n' + (result.error || 'Unknown error'));
            }
        } catch (e: any) {
            setAnimEngineInstallResult('failed');
            setAnimEngineInstallLogs(prev => prev + '\n' + e.message);
        } finally {
            setAnimEngineInstalling(false);
        }
    };

    return (
        <div className="language-manager">
            <div className="lm-header">
                <span className="lm-title">EXTENSIONS</span>
                <button className="lm-refresh-btn" onClick={scanEnvironments} title="Scan for Runtimes" disabled={isLoading}>
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
                    const progress = installProgress[env.id];
                    const isInstalling = progress?.status === 'installing';
                    
                    return (
                        <div key={env.id} className="lm-card">
                            <div className="lm-card-header">
                                <h3 className="lm-card-title">{env.name}</h3>
                                {env.installed ? (
                                    <span className="lm-badge success"><LuCheck /> Installed</span>
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
                                ) : (
                                    <div className="lm-not-installed-msg">
                                        This runtime is not installed on your system.
                                    </div>
                                )}
                                
                                {progress?.status === 'failed' && (
                                    <div className="lm-error">
                                        <LuCircleX /> {progress.error}
                                    </div>
                                )}
                            </div>
                            
                            <div className="lm-card-actions">
                                {!env.installed && env.installCmd && (
                                    <button 
                                        className="lm-install-btn" 
                                        onClick={() => handleInstall(env.id)}
                                        disabled={isInstalling}
                                    >
                                        <LuCloudDownload /> {isInstalling ? 'Installing...' : 'Install via System'}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
