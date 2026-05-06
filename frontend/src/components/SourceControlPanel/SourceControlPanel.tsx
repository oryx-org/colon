import { LuRefreshCw, LuPlus, LuRotateCcw, LuGitCommitHorizontal, LuGitBranch } from 'react-icons/lu';
import { useState, useCallback, useEffect } from 'react';

import './SourceControlPanel.css';

interface GitStatus {
    isRepo: boolean;
    files?: Array<{ file: string, status: string, path?: string }>;
}

interface SourceControlPanelProps {
    onFileClick: (path: string, name: string) => void;
}

export default function SourceControlPanel({ onFileClick }: SourceControlPanelProps) {
    const [status, setStatus] = useState<GitStatus | null>(null);
    const [branch, setBranch] = useState<string | null>(null);
    const [commitMessage, setCommitMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const electron = (window as any).electronAPI;

    const loadStatus = useCallback(async () => {
        if (!electron?.git) return;
        setIsLoading(true);
        try {
            const [gitStat, gitBranch] = await Promise.all([
                electron.git.status(),
                electron.git.branch()
            ]);
            setStatus(gitStat);
            setBranch(gitBranch);
        } catch (e) {
            console.error('Failed to load git status', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    const handleCommit = async () => {
        if (!electron?.git || !commitMessage.trim()) return;
        
        setIsLoading(true);
        try {
            await electron.git.addAll(null);
            const res = await electron.git.commit(null, commitMessage);
            
            if (res.success) {
                setCommitMessage('');
                await loadStatus();
            } else {
                alert('Commit failed: ' + res.stderr);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleStage = async (file: string) => {
        if (!electron?.git) return;
        setIsLoading(true);
        try {
            await electron.git.addFile(null, file);
            await loadStatus();
        } finally {
            setIsLoading(false);
        }
    };

    const handleDiscard = async (file: string) => {
        if (!electron?.git) return;
        if (!confirm(`Are you sure you want to discard changes in ${file}?`)) return;
        
        setIsLoading(true);
        try {
            await electron.git.checkoutFile(null, file);
            await loadStatus();
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleInit = async () => {
        if (!electron?.git) return;
        setIsLoading(true);
        try {
            await electron.git.init(null);
            await loadStatus();
        } finally {
            setIsLoading(false);
        }
    };

    if (!status) {
        return <div className="sc-panel"><div className="sc-loading">Loading...</div></div>;
    }

    if (!status.isRepo) {
        return (
            <div className="sc-panel">
                <div className="sc-header">
                    <span className="sc-title">SOURCE CONTROL</span>
                </div>
                <div className="sc-no-repo">
                    <p>The current workspace is not a Git repository.</p>
                    <button className="sc-init-btn" onClick={handleInit}>
                        Initialize Repository
                    </button>
                </div>
            </div>
        );
    }

    const { files = [] } = status;

    return (
        <div className="sc-panel">
            <div className="sc-header">
                <span className="sc-title">SOURCE CONTROL</span>
                <div className="sc-header-actions">
                    <button className="sc-action-btn" onClick={loadStatus} title="Refresh">
                        <LuRefreshCw className={isLoading ? 'spinning' : ''} />
                    </button>
                </div>
            </div>

            <div className="sc-branch-info">
                <LuGitBranch />
                <span>{branch || 'main'}</span>
            </div>

            <div className="sc-commit-box">
                <input 
                    type="text" 
                    placeholder="Message (Input to Commit)"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
                    disabled={isLoading}
                />
                <button 
                    className="sc-commit-btn" 
                    onClick={handleCommit}
                    disabled={isLoading || !commitMessage.trim() || files.length === 0}
                    title="Commit (All files)"
                >
                    <LuGitCommitHorizontal /> Commit
                </button>
            </div>

            <div className="sc-file-list">
                {files.length === 0 ? (
                    <div className="sc-no-changes">No active changes</div>
                ) : (
                    files.map((item, idx) => {
                        const statusColor = item.status.includes('M') ? 'var(--git-modified)' : 
                                            item.status.includes('A') || item.status.includes('?') ? 'var(--git-added)' : 
                                            item.status.includes('D') ? 'var(--git-deleted)' : 'var(--text-secondary)';

                        return (
                            <div key={idx} className="sc-file-item">
                                <div 
                                    className="sc-file-name" 
                                    onClick={() => onFileClick(item.path || item.file, item.file.split(/[\/\\]/).pop() || item.file)}
                                >
                                    <span className="sc-file-status" style={{ color: statusColor }}>
                                        {item.status.trim().charAt(0)}
                                    </span>
                                    <span>{item.file.split(/[\/\\]/).pop()}</span>
                                    <span className="sc-file-path">{item.file}</span>
                                </div>
                                <div className="sc-file-actions">
                                    <button title="Stage File" onClick={() => handleStage(item.file)}>
                                        <LuPlus />
                                    </button>
                                    <button title="Discard Changes" onClick={() => handleDiscard(item.file)}>
                                        <LuRotateCcw />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
