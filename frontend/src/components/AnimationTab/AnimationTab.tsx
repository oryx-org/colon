import { LuTrash2, LuCode, LuSparkles, LuCircleAlert, LuFilm, LuLoader, LuDownload } from 'react-icons/lu';
import { useState, useEffect } from 'react';


import AnimationPlayer, { AnimationData } from './AnimationPlayer';
import './AnimationTab.css';

export interface AnimationRecord {
    id: string;
    sourceFile: string;
    language: string;
    animation: AnimationData;
    createdAt: string;
}

interface ManimVideo {
    id: string;
    sourceFile: string;
    language: string;
    videoPath: string;
    createdAt: string;
}

interface AnimationTabProps {
    animations: AnimationRecord[];
    isGenerating: boolean;
    onDeleteAnimation: (animId: string) => void;
    onClearAll: () => void;
    llmConfigured: boolean;
    animError?: string | null;
    activeFileName?: string;
    // Video generation props
    manimVideos?: ManimVideo[];
    isManimRendering?: boolean;
    manimError?: string | null;
    onGenerateManimVideo?: () => void;
    onDeleteManimVideo?: (videoId: string) => void;
    onCancelAnimation?: () => void;
    onCancelManimVideo?: () => void;
    activeFileLineCount?: number;
    animEngineInstalled?: boolean;
}

const MAX_MANIM_LINES = 200;

function AnimationTab({
    animations, isGenerating, onDeleteAnimation, onClearAll, llmConfigured, animError, activeFileName,
    manimVideos = [], isManimRendering = false, manimError, onGenerateManimVideo, onDeleteManimVideo,
    onCancelAnimation, onCancelManimVideo, activeFileLineCount = 0, animEngineInstalled = false
}: AnimationTabProps) {
    const canGenerateVideo = llmConfigured && activeFileName && activeFileLineCount > 0 && activeFileLineCount <= MAX_MANIM_LINES;

    // Timers
    const [manimElapsed, setManimElapsed] = useState(0);
    const [blockElapsed, setBlockElapsed] = useState(0);

    useEffect(() => {
        let interval: any;
        if (isManimRendering) {
            interval = setInterval(() => setManimElapsed(p => p + 1), 1000);
        } else {
            setManimElapsed(0);
        }
        return () => clearInterval(interval);
    }, [isManimRendering]);

    useEffect(() => {
        let interval: any;
        if (isGenerating) {
            interval = setInterval(() => setBlockElapsed(p => p + 1), 1000);
        } else {
            setBlockElapsed(0);
        }
        return () => clearInterval(interval);
    }, [isGenerating]);

    const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
    
    // Estimates (optimized generation)
    const manimEstimate = Math.max(25, Math.floor(activeFileLineCount * 1.0)); // ~1s per line
    const blockEstimate = 15; // ~15 seconds for block animation

    return (
        <div className="animation-tab">
            <div className="animation-header">
                <span className="animation-title">
                    ANIMATION
                    {activeFileName && (
                        <span className="animation-file-badge">{activeFileName}</span>
                    )}
                </span>
                <div className="animation-header-actions">
                    {animations.length > 0 && (
                        <button
                            className="anim-header-btn danger"
                            onClick={onClearAll}
                            title="Clear all block animations"
                        >
                            <LuTrash2 size={12} />
                        </button>
                    )}
                </div>
            </div>

            <div className="animation-cards-scroll">

                {/* ── Manim Video Secion ── */}
                <div className="manim-section">
                    <div className="manim-section-header">
                        <LuFilm size={12} />
                        <span>Full-File Video</span>
                    </div>

                    {onGenerateManimVideo && (
                        <>
                        {/* ── First-use awareness: install engine banner ── */}
                        {!animEngineInstalled && (
                            <div className="engine-install-banner">
                                <LuDownload size={14} />
                                <div className="engine-install-banner-content">
                                    <span className="engine-install-banner-title">Setup Required</span>
                                    <span className="engine-install-banner-msg">
                                        Install the <strong>Colon Animation Engine</strong> from the <strong>Extensions</strong> tab to generate videos.
                                    </span>
                                </div>
                            </div>
                        )}
                        <button
                            className="manim-generate-btn"
                            onClick={onGenerateManimVideo}
                            disabled={!canGenerateVideo || isManimRendering}
                            title={
                                !activeFileName ? 'Open a file first' :
                                activeFileLineCount > MAX_MANIM_LINES ? `File too long (${activeFileLineCount}/${MAX_MANIM_LINES} lines)` :
                                !llmConfigured ? 'Configure AI Service in backend/.env' :
                                isManimRendering ? 'Rendering in progress...' :
                                'Generate High-Quality Video for this file'
                            }
                        >
                            {isManimRendering ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <LuLoader size={14} className="spin-icon" /> Rendering Video...
                                    </div>
                                    <div style={{ fontSize: '10px', opacity: 0.8, fontWeight: 'normal', fontFamily: 'monospace' }}>
                                        {formatTime(manimElapsed)} / ~{formatTime(manimEstimate)}
                                    </div>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onCancelManimVideo?.(); }}
                                        style={{ marginTop: 4, padding: '2px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}
                                    >
                                        Stop Generation
                                    </button>
                                </div>
                            ) : (
                                <><LuFilm size={14} /> Generate Video</>
                            )}
                        </button>
                        </>
                    )}

                    {activeFileLineCount > MAX_MANIM_LINES && activeFileName && (
                        <div className="manim-line-warning">
                            File too long ({activeFileLineCount} lines). Max {MAX_MANIM_LINES} lines.
                        </div>
                    )}

                    {manimError && !isManimRendering && (
                        <div className="animation-card error-card">
                            <div className="error-indicator">
                                <LuCircleAlert size={16} className="error-icon" />
                                <div className="error-content">
                                    <span className="error-title">Video Generation Failed</span>
                                    <span className="error-message">
                                        {manimError.includes('not installed') || manimError.includes('exit code') || manimError.includes('ENOENT') || manimError.includes('Failed to start') ? (
                                            <>Colon Animation Engine is not installed. Go to the <strong>Extensions tab</strong> (sidebar) to install it.</>
                                        ) : (
                                            manimError
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {manimVideos.map(video => (
                        <div key={video.id} className="animation-card manim-card">
                            <div className="card-header">
                                <span className="card-label">
                                    <LuFilm size={10} style={{ marginRight: 4, opacity: 0.6 }} />
                                    HD Render
                                </span>
                                <div className="card-meta">
                                    <span className="card-steps manim-badge">MP4</span>
                                    {onDeleteManimVideo && (
                                        <button
                                            className="card-delete-btn"
                                            onClick={() => onDeleteManimVideo(video.id)}
                                            title="Delete video"
                                        >
                                            <LuTrash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="manim-video-container">
                                <video
                                    controls
                                    preload="metadata"
                                    className="manim-video-player"
                                    src={`file://${video.videoPath}`}
                                >
                                    Your browser does not support video playback.
                                </video>
                            </div>
                        </div>
                    ))}

                    {manimVideos.length === 0 && !isManimRendering && !manimError && activeFileName && (
                        <div className="manim-empty-hint">
                            No videos yet. Click "Generate Video" above.
                        </div>
                    )}
                </div>

                {/* ── Divider ── */}
                {activeFileName && (
                    <div className="section-divider">
                        <span className="section-divider-label">Block Animations</span>
                    </div>
                )}

                {/* ── Block Animations Section ── */}
                {isGenerating && (
                    <div className="animation-card tracing">
                        <div className="tracing-indicator" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div className="tracing-spinner" />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span>Generating AI animation...</span>
                                    <span style={{ fontSize: '10px', opacity: 0.7, fontFamily: 'monospace' }}>
                                        {formatTime(blockElapsed)} / ~{formatTime(blockEstimate)}
                                    </span>
                                </div>
                            </div>
                            <button 
                                onClick={onCancelAnimation}
                                style={{ padding: '4px 8px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}
                            >
                                Stop
                            </button>
                        </div>
                    </div>
                )}

                {animError && !isGenerating && (
                    <div className="animation-card error-card">
                        <div className="error-indicator">
                            <LuCircleAlert size={16} className="error-icon" />
                            <div className="error-content">
                                <span className="error-title">Generation Failed</span>
                                <span className="error-message">{animError}</span>
                            </div>
                        </div>
                    </div>
                )}

                {animations.length === 0 && !isGenerating && !animError && (
                    <div className="animation-empty">
                        <LuCode size={32} className="empty-icon" />
                        <p>No block animations yet</p>
                        <span className="empty-hint">
                            {llmConfigured ? (
                                <>No block animations generated yet.<br />Click the play button on a code block in the editor to trace it.</>
                            ) : (
                                <>Configure your <strong>AI Service</strong><br />to enable animations</>
                            )}
                        </span>
                    </div>
                )}

                {animations.map(anim => (
                    <div key={anim.id} className="animation-card">
                        <div className="card-header">
                            <span className="card-label">
                                <LuSparkles size={10} style={{ marginRight: 4, opacity: 0.6 }} />
                                {anim.animation?.title || 'Animation'}
                            </span>
                            <div className="card-meta">
                                <span className="card-steps">
                                    {anim.animation?.frames?.length || 0} frames
                                </span>
                                <button
                                    className="card-delete-btn"
                                    onClick={() => onDeleteAnimation(anim.id)}
                                    title="Delete animation"
                                >
                                    <LuTrash2 size={12} />
                                </button>
                            </div>
                        </div>
                        {anim.animation && (
                            <AnimationPlayer animation={anim.animation} height={280} />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default AnimationTab;
