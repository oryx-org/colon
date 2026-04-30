import { LuGitBranch, LuBell, LuCircleX, LuTriangleAlert } from 'react-icons/lu';

import './StatusBar.css';

interface StatusBarProps {
    language: string;
    line: number;
    column: number;
    encoding?: string;
    eol?: string;
    indentSize?: number;
    indentType?: string;
}

const LANGUAGE_DISPLAY: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    go: 'Go',
    rust: 'Rust',
    ruby: 'Ruby',
    php: 'PHP',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    json: 'JSON',
    xml: 'XML',
    markdown: 'Markdown',
    yaml: 'YAML',
    sql: 'SQL',
    shell: 'Shell Script',
    dockerfile: 'Dockerfile',
    kotlin: 'Kotlin',
    swift: 'Swift',
    lua: 'Lua',
    perl: 'Perl',
    plaintext: 'Plain Text',
};

function StatusBar({
    language,
    line,
    column,
    encoding = 'UTF-8',
    eol = 'LF',
    indentSize = 4,
    indentType = 'Spaces',
}: StatusBarProps) {
    const displayLang = LANGUAGE_DISPLAY[language] || language || 'Plain Text';

    return (
        <div className="status-bar">
            <div className="status-left">
                <div className="status-item branch">
                    <LuGitBranch size={13} />
                    <span>main</span>
                </div>
                <div className="status-item">
                    <LuCircleX size={13} className="status-error-icon" />
                    <span>0</span>
                    <LuTriangleAlert size={13} className="status-warn-icon" />
                    <span>0</span>
                </div>
            </div>

            <div className="status-right">
                <div className="status-item clickable">
                    Ln {line}, Col {column}
                </div>
                <div className="status-item clickable">
                    {indentType}: {indentSize}
                </div>
                <div className="status-item clickable">
                    {encoding}
                </div>
                <div className="status-item clickable">
                    {eol}
                </div>
                <div className="status-item clickable lang">
                    {displayLang}
                </div>
                <div className="status-item">
                    <LuBell size={13} />
                </div>
            </div>
        </div>
    );
}

export default StatusBar;
