import { LuTrash2, LuCode, LuSparkles, LuCircleAlert, LuFilm, LuLoader } from 'react-icons/lu';
import { VscTrash } from 'react-icons/vsc';
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
    // Manim props
    manimVideos?: ManimVideo[];
    isManimRendering?: boolean;
    manimError?: string | null;
    onGenerateManimVideo?: () => void;
    onDeleteManimVideo?: (videoId: string) => void;
    activeFileLineCount?: number;
}

const MAX_MANIM_LINES = 200;

function AnimationTab({
    animations, isGenerating, onDeleteAnimation, onClearAll, llmConfigured, animError, activeFileName,
    manimVideos = [], isManimRendering = false, manimError, onGenerateManimVideo, onDeleteManimVideo,
    activeFileLineCount = 0
}: AnimationTabProps) {
    const canGenerateVideo = llmConfigured && activeFileName && activeFileLineCount > 0 && activeFileLineCount <= MAX_MANIM_LINES;

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
                            <VscTrash size={12} />
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
                        <button
                            className="manim-generate-btn"
                            onClick={onGenerateManimVideo}
                            disabled={!canGenerateVideo || isManimRendering}
                            title={
                                !activeFileName ? 'Open a file first' :
                                activeFileLineCount > MAX_MANIM_LINES ? `File too long (${activeFileLineCount}/${MAX_MANIM_LINES} lines)` :
                                !llmConfigured ? 'Configure API key in .env' :
                                isManimRendering ? 'Rendering in progress...' :
                                'Generate Manim video for this file'
                            }
                        >
                            {isManimRendering ? (
                                <><LuLoader size={14} className="spin-icon" /> Rendering Video...</>
                            ) : (
                                <><LuFilm size={14} /> Generate Video</>
                            )}
                        </button>
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
                                    <span className="error-message">{manimError}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {manimVideos.map(video => (
                        <div key={video.id} className="animation-card manim-card">
                            <div className="card-header">
                                <span className="card-label">
                                    <LuFilm size={10} style={{ marginRight: 4, opacity: 0.6 }} />
                                    Manim Video
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
                        <div className="tracing-indicator">
                            <div className="tracing-spinner" />
                            <span>Generating animation...</span>
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
                                <>Click the <span style={{ color: '#16a34a' }}>▶</span> icon next to a code block<br />to generate an animation</>
                            ) : (
                                <>Add your API key to <strong>backend/.env</strong><br />to enable LLM animations</>
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
