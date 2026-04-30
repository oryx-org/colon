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
        
        if (electron?.onRuntimeInstallEvent) {
            electron.onRuntimeInstallEvent((payload: any) => {
                setInstallProgress(prev => {
                    const current = prev[payload.runtimeId] || { runtimeId: payload.runtimeId, status: 'installing' };
                    // We append logs or just update status
                    if (payload.status === 'success') {
                         return { ...prev, [payload.runtimeId]: { ...current, status: 'success' } };
                    } else if (payload.status === 'failed') {
                         return { ...prev, [payload.runtimeId]: { ...current, status: 'failed', error: payload.error } };
                    } else if (payload.stdout || payload.stderr) {
                         return { ...prev, [payload.runtimeId]: { ...current, status: 'installing', stdout: payload.stdout, stderr: payload.stderr } };
                    }
                    return prev;
                });
            });
        }
        
        return () => {
            if (electron?.removeRuntimeInstallListeners) {
                electron.removeRuntimeInstallListeners();
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

    return (
        <div className="language-manager">
            <div className="lm-header">
                <span className="lm-title">EXTENSIONS (LANGUAGES)</span>
                <button className="lm-refresh-btn" onClick={scanEnvironments} title="Scan for Runtimes" disabled={isLoading}>
                    <LuRefreshCw className={isLoading ? 'spinning' : ''} />
                </button>
            </div>
            
            <div className="lm-content">
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
