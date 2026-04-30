import { LuSearch, LuChevronDown, LuChevronRight, LuReplace } from 'react-icons/lu';
import { useState, useCallback, useRef, useEffect } from 'react';

import FileIcon from '../FileIcon/FileIcon';
import './SearchPanel.css';

interface SearchResult {
    filePath: string;
    fileName: string;
    lineNumber: number;
    lineContent: string;
    matchStart: number;
    matchEnd: number;
}

interface GroupedResult {
    filePath: string;
    fileName: string;
    matches: SearchResult[];
}

interface SearchPanelProps {
    onFileClick: (filePath: string, name: string, line?: number) => void;
}

function SearchPanel({ onFileClick }: SearchPanelProps) {
    const [query, setQuery] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [showReplace, setShowReplace] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [useRegex, setUseRegex] = useState(false);
    const [results, setResults] = useState<GroupedResult[]>([]);
    const [totalMatches, setTotalMatches] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
    const searchTimer = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const doSearch = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            setTotalMatches(0);
            return;
        }

        const electron = (window as any).electronAPI;
        if (!electron?.searchInFiles) return;

        setIsSearching(true);
        try {
            const result = await electron.searchInFiles(searchQuery, {
                caseSensitive,
                wholeWord,
                useRegex
            });

            if (result.success) {
                setResults(result.grouped);
                setTotalMatches(result.totalMatches);
                // Auto-expand all files
                setExpandedFiles(new Set(result.grouped.map((g: GroupedResult) => g.filePath)));
            }
        } catch (err) {
            console.warn('[SearchPanel] Search error:', err);
        } finally {
            setIsSearching(false);
        }
    }, [caseSensitive, wholeWord, useRegex]);

    const handleQueryChange = (value: string) => {
        setQuery(value);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = window.setTimeout(() => doSearch(value), 400);
    };

    const handleReplaceAll = async () => {
        const electron = (window as any).electronAPI;
        if (!electron?.replaceInFiles || !query.trim()) return;

        try {
            const result = await electron.replaceInFiles(query, replaceText, {
                caseSensitive,
                wholeWord,
                useRegex
            });
            if (result.success) {
                // Re-search to update results
                doSearch(query);
            }
        } catch (err) {
            console.warn('[SearchPanel] Replace error:', err);
        }
    };

    const toggleFile = (filePath: string) => {
        setExpandedFiles(prev => {
            const next = new Set(prev);
            if (next.has(filePath)) next.delete(filePath);
            else next.add(filePath);
            return next;
        });
    };

    const highlightMatch = (text: string, start: number, end: number) => {
        const before = text.substring(0, start);
        const match = text.substring(start, end);
        const after = text.substring(end);
        return (
            <span>
                <span className="search-text">{before}</span>
                <span className="search-highlight">{match}</span>
                <span className="search-text">{after}</span>
            </span>
        );
    };

    return (
        <div className="search-panel">
            <div className="search-header">
                <span className="search-title">SEARCH</span>
            </div>

            <div className="search-inputs">
                <div className="search-input-row">
                    <button
                        className="toggle-replace-btn"
                        onClick={() => setShowReplace(!showReplace)}
                        title={showReplace ? 'Hide Replace' : 'Show Replace'}
                    >
                        {showReplace ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                    </button>
                    <div className="search-input-wrapper">
                        <LuSearch size={14} className="search-input-icon" />
                        <input
                            ref={inputRef}
                            className="search-input"
                            placeholder="Search"
                            value={query}
                            onChange={e => handleQueryChange(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') doSearch(query); }}
                        />
                        <div className="search-options">
                            <button
                                className={`search-option-btn ${caseSensitive ? 'active' : ''}`}
                                onClick={() => { setCaseSensitive(!caseSensitive); doSearch(query); }}
                                title="Match Case"
                            >Aa</button>
                            <button
                                className={`search-option-btn ${wholeWord ? 'active' : ''}`}
                                onClick={() => { setWholeWord(!wholeWord); doSearch(query); }}
                                title="Match Whole Word"
                            >Ab</button>
                            <button
                                className={`search-option-btn ${useRegex ? 'active' : ''}`}
                                onClick={() => { setUseRegex(!useRegex); doSearch(query); }}
                                title="Use Regular Expression"
                            >.*</button>
                        </div>
                    </div>
                </div>

                {showReplace && (
                    <div className="search-input-row replace-row">
                        <div className="toggle-replace-spacer" />
                        <div className="search-input-wrapper">
                            <input
                                className="search-input"
                                placeholder="Replace"
                                value={replaceText}
                                onChange={e => setReplaceText(e.target.value)}
                            />
                            <button
                                className="replace-all-btn"
                                onClick={handleReplaceAll}
                                title="Replace All"
                            >
                                <LuReplace size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="search-summary">
                {isSearching ? (
                    <span>Searching...</span>
                ) : query.trim() ? (
                    <span>{totalMatches} result{totalMatches !== 1 ? 's' : ''} in {results.length} file{results.length !== 1 ? 's' : ''}</span>
                ) : null}
            </div>

            <div className="search-results">
                {results.map(group => (
                    <div key={group.filePath} className="search-file-group">
                        <div
                            className="search-file-header"
                            onClick={() => toggleFile(group.filePath)}
                        >
                            {expandedFiles.has(group.filePath)
                                ? <LuChevronDown size={14} />
                                : <LuChevronRight size={14} />
                            }
                            <FileIcon fileName={group.fileName} size={14} />
                            <span className="search-file-name">{group.fileName}</span>
                            <span className="search-match-count">{group.matches.length}</span>
                        </div>

                        {expandedFiles.has(group.filePath) && (
                            <div className="search-match-list">
                                {group.matches.map((m, i) => (
                                    <div
                                        key={i}
                                        className="search-match-item"
                                        onClick={() => onFileClick(m.filePath, group.fileName, m.lineNumber)}
                                    >
                                        <span className="search-line-num">{m.lineNumber}</span>
                                        {highlightMatch(m.lineContent.trim(), m.matchStart, m.matchEnd)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default SearchPanel;
