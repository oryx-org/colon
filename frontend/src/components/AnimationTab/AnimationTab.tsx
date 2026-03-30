import { LuTrash2, LuCode, LuSparkles } from 'react-icons/lu';
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

interface AnimationTabProps {
    animations: AnimationRecord[];
    isGenerating: boolean;
    onDeleteAnimation: (animId: string) => void;
    onClearAll: () => void;
    llmConfigured: boolean;
}

function AnimationTab({ animations, isGenerating, onDeleteAnimation, onClearAll, llmConfigured }: AnimationTabProps) {
    return (
        <div className="animation-tab">
            <div className="animation-header">
                <span className="animation-title">ANIMATION</span>
                <div className="animation-header-actions">
                    {animations.length > 0 && (
                        <button
                            className="anim-header-btn danger"
                            onClick={onClearAll}
                            title="Clear all animations"
                        >
                            <VscTrash size={12} />
                        </button>
                    )}
                </div>
            </div>

            <div className="animation-cards-scroll">
                {isGenerating && (
                    <div className="animation-card tracing">
                        <div className="tracing-indicator">
                            <div className="tracing-spinner" />
                            <span>Generating animation...</span>
                        </div>
                    </div>
                )}

                {animations.length === 0 && !isGenerating && (
                    <div className="animation-empty">
                        <LuCode size={32} className="empty-icon" />
                        <p>No animations yet</p>
                        <span className="empty-hint">
                            {llmConfigured ? (
                                <>Click the ▶ icon next to a code block<br />to generate an animation</>
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
