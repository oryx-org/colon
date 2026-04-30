import { LuChevronRight } from 'react-icons/lu';
import { useState, useEffect, useRef } from 'react';

import './CommandPalette.css';

interface Command {
    id: string;
    label: string;
    category?: string;
    shortcut?: string;
    action: () => void;
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    commands: Command[];
}

function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const filtered = commands.filter(c => 
        c.label.toLowerCase().includes(query.toLowerCase()) || 
        c.category?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 50);

    // Reset selection and focus when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    }, [isOpen]);

    // Handle Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered[selectedIndex]) {
                    filtered[selectedIndex].action();
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen, filtered, selectedIndex, onClose]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    if (!isOpen) return null;

    return (
        <div className="command-palette-overlay" onClick={onClose}>
            <div className="command-palette" onClick={e => e.stopPropagation()}>
                <div className="command-input-wrapper">
                    <LuChevronRight className="command-chevron" />
                    <input
                        ref={inputRef}
                        className="command-input"
                        placeholder="Type a command or search..."
                        value={query}
                        onChange={e => {
                            setQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                    />
                </div>
                {filtered.length > 0 && (
                    <div className="command-list" ref={listRef}>
                        {filtered.map((cmd, idx) => (
                            <div
                                key={cmd.id}
                                className={`command-item ${idx === selectedIndex ? 'selected' : ''}`}
                                onMouseEnter={() => setSelectedIndex(idx)}
                                onClick={() => {
                                    cmd.action();
                                    onClose();
                                }}
                            >
                                <div className="command-label-wrapper">
                                    {cmd.category && <span className="command-category">{cmd.category}: </span>}
                                    <span className="command-label">{cmd.label}</span>
                                </div>
                                {cmd.shortcut && <span className="command-shortcut">{cmd.shortcut}</span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default CommandPalette;
