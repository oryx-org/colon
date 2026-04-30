import { LuFile, LuFileJson, LuFileCode, LuSettings } from 'react-icons/lu';
/**
 * FileIcon — Maps file extensions to language-specific colored icons.
 * Used in ExplorerPanel and Workspace tabs for a VS Code-like experience.
 */


import {
    SiPython, SiJavascript, SiTypescript, SiReact,
    SiHtml5, SiCss, SiSass,
    SiRust, SiRuby, SiPhp, SiSwift, SiKotlin, SiLua,
    SiGnubash, SiDocker, SiGraphql, SiYaml
} from 'react-icons/si';
import {
    FaJava, FaCuttlefish, FaDatabase, FaFileCode, FaGitAlt, FaFileImage, FaFilePdf
} from 'react-icons/fa';
import { BiLogoGoLang } from 'react-icons/bi';
import { DiPerl } from 'react-icons/di';

interface FileIconProps {
    fileName: string;
    size?: number;
    className?: string;
}

interface IconMapping {
    icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
    color: string;
}

/** Extension → icon + color mapping */
const EXTENSION_MAP: Record<string, IconMapping> = {
    // JavaScript
    '.js': { icon: SiJavascript, color: '#F7DF1E' },
    '.mjs': { icon: SiJavascript, color: '#F7DF1E' },
    '.cjs': { icon: SiJavascript, color: '#F7DF1E' },
    '.jsx': { icon: SiReact, color: '#61DAFB' },

    // TypeScript
    '.ts': { icon: SiTypescript, color: '#3178C6' },
    '.tsx': { icon: SiReact, color: '#3178C6' },
    '.d.ts': { icon: SiTypescript, color: '#3178C6' },

    // Python
    '.py': { icon: SiPython, color: '#3776AB' },
    '.pyw': { icon: SiPython, color: '#3776AB' },
    '.pyi': { icon: SiPython, color: '#3776AB' },

    // Java
    '.java': { icon: FaJava, color: '#ED8B00' },
    '.jar': { icon: FaJava, color: '#ED8B00' },
    '.class': { icon: FaJava, color: '#ED8B00' },

    // C / C++
    '.c': { icon: FaCuttlefish, color: '#A8B9CC' },
    '.h': { icon: FaCuttlefish, color: '#A8B9CC' },
    '.cpp': { icon: FaCuttlefish, color: '#00599C' },
    '.cc': { icon: FaCuttlefish, color: '#00599C' },
    '.cxx': { icon: FaCuttlefish, color: '#00599C' },
    '.hpp': { icon: FaCuttlefish, color: '#00599C' },

    // Web
    '.html': { icon: SiHtml5, color: '#E34F26' },
    '.htm': { icon: SiHtml5, color: '#E34F26' },
    '.css': { icon: SiCss, color: '#1572B6' },
    '.scss': { icon: SiSass, color: '#CC6699' },
    '.sass': { icon: SiSass, color: '#CC6699' },
    '.less': { icon: SiCss, color: '#1D365D' },

    // Data / Config
    '.json': { icon: LuFileJson, color: '#F5C518' },
    '.yaml': { icon: SiYaml, color: '#CB171E' },
    '.yml': { icon: SiYaml, color: '#CB171E' },
    '.xml': { icon: FaFileCode, color: '#E37933' },
    '.svg': { icon: FaFileImage, color: '#FFB13B' },
    '.toml': { icon: LuSettings, color: '#9C4121' },
    '.ini': { icon: LuSettings, color: '#6D8086' },
    '.env': { icon: LuSettings, color: '#ECD53F' },

    // Markdown
    '.md': { icon: LuFileCode, color: '#519ABA' },
    '.mdx': { icon: LuFileCode, color: '#519ABA' },

    // Shell
    '.sh': { icon: SiGnubash, color: '#4EAA25' },
    '.bash': { icon: SiGnubash, color: '#4EAA25' },
    '.zsh': { icon: SiGnubash, color: '#4EAA25' },
    '.fish': { icon: SiGnubash, color: '#4EAA25' },

    // Rust
    '.rs': { icon: SiRust, color: '#DEA584' },

    // Go
    '.go': { icon: BiLogoGoLang, color: '#00ADD8' },

    // Ruby
    '.rb': { icon: SiRuby, color: '#CC342D' },
    '.erb': { icon: SiRuby, color: '#CC342D' },
    '.gemspec': { icon: SiRuby, color: '#CC342D' },

    // PHP
    '.php': { icon: SiPhp, color: '#777BB4' },

    // Swift
    '.swift': { icon: SiSwift, color: '#F05138' },

    // Kotlin
    '.kt': { icon: SiKotlin, color: '#7F52FF' },
    '.kts': { icon: SiKotlin, color: '#7F52FF' },

    // Lua
    '.lua': { icon: SiLua, color: '#2C2D72' },

    // Perl
    '.pl': { icon: DiPerl, color: '#39457E' },
    '.pm': { icon: DiPerl, color: '#39457E' },

    // Database / SQL
    '.sql': { icon: FaDatabase, color: '#00758F' },

    // Docker
    '.dockerfile': { icon: SiDocker, color: '#2496ED' },

    // GraphQL
    '.graphql': { icon: SiGraphql, color: '#E10098' },
    '.gql': { icon: SiGraphql, color: '#E10098' },

    // Git
    '.gitignore': { icon: FaGitAlt, color: '#F05032' },
    '.gitattributes': { icon: FaGitAlt, color: '#F05032' },
    '.gitmodules': { icon: FaGitAlt, color: '#F05032' },

    // Images
    '.png': { icon: FaFileImage, color: '#A074C4' },
    '.jpg': { icon: FaFileImage, color: '#A074C4' },
    '.jpeg': { icon: FaFileImage, color: '#A074C4' },
    '.gif': { icon: FaFileImage, color: '#A074C4' },
    '.webp': { icon: FaFileImage, color: '#A074C4' },
    '.ico': { icon: FaFileImage, color: '#A074C4' },

    // PDF
    '.pdf': { icon: FaFilePdf, color: '#FF0000' },
};

/** Special full-filename matches (e.g., "Dockerfile", "Makefile") */
const FILENAME_MAP: Record<string, IconMapping> = {
    'dockerfile': { icon: SiDocker, color: '#2496ED' },
    'docker-compose.yml': { icon: SiDocker, color: '#2496ED' },
    'docker-compose.yaml': { icon: SiDocker, color: '#2496ED' },
    'makefile': { icon: LuSettings, color: '#6D8086' },
    'cmakelists.txt': { icon: LuSettings, color: '#6D8086' },
    '.gitignore': { icon: FaGitAlt, color: '#F05032' },
    '.gitattributes': { icon: FaGitAlt, color: '#F05032' },
    '.env': { icon: LuSettings, color: '#ECD53F' },
    '.env.local': { icon: LuSettings, color: '#ECD53F' },
    '.env.development': { icon: LuSettings, color: '#ECD53F' },
    '.env.production': { icon: LuSettings, color: '#ECD53F' },
    'package.json': { icon: LuFileJson, color: '#CB3837' },
    'tsconfig.json': { icon: SiTypescript, color: '#3178C6' },
    'vite.config.ts': { icon: SiTypescript, color: '#646CFF' },
    'vite.config.js': { icon: SiJavascript, color: '#646CFF' },
};

function getIconForFile(fileName: string): IconMapping {
    const lowerName = fileName.toLowerCase();

    // Check full filename first
    if (FILENAME_MAP[lowerName]) return FILENAME_MAP[lowerName];

    // Check extension
    const dotIdx = lowerName.lastIndexOf('.');
    if (dotIdx >= 0) {
        const ext = lowerName.substring(dotIdx);
        if (EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
    }

    // Default
    return { icon: LuFile, color: '#9D9D9D' };
}

function FileIcon({ fileName, size = 15, className = '' }: FileIconProps) {
    const { icon: Icon, color } = getIconForFile(fileName);
    return <Icon size={size} color={color} className={className} />;
}

export { FileIcon, getIconForFile };
export default FileIcon;
