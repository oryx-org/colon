/**
 * useFileManagement — Manages open files, active file, save, close, rename.
 *
 * Extracted from App.tsx to reduce root component complexity.
 */
import { useState, useRef, useCallback } from 'react';
import type { OpenFile } from '../App';

/** Map of file extensions to Monaco language IDs */
const LANGUAGE_MAP: Record<string, string> = {
  'js': 'javascript', 'jsx': 'javascript', 'mjs': 'javascript',
  'ts': 'typescript', 'tsx': 'typescript',
  'py': 'python', 'pyw': 'python',
  'java': 'java',
  'c': 'c', 'h': 'c',
  'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'hpp': 'cpp',
  'cs': 'csharp',
  'go': 'go',
  'rs': 'rust',
  'rb': 'ruby',
  'php': 'php',
  'html': 'html', 'htm': 'html',
  'css': 'css', 'scss': 'scss', 'less': 'less',
  'json': 'json',
  'xml': 'xml',
  'md': 'markdown', 'mdx': 'markdown',
  'yaml': 'yaml', 'yml': 'yaml',
  'sql': 'sql',
  'sh': 'shell', 'bash': 'shell', 'zsh': 'shell',
  'ps1': 'powershell',
  'dockerfile': 'dockerfile',
  'r': 'r',
  'swift': 'swift',
  'kt': 'kotlin', 'kts': 'kotlin',
  'lua': 'lua',
  'pl': 'perl',
  'toml': 'ini',
  'ini': 'ini',
  'bat': 'bat', 'cmd': 'bat',
  'graphql': 'graphql', 'gql': 'graphql',
};

const BINARY_EXTENSIONS = new Set([
  'png','jpg','jpeg','gif','webp','bmp','ico','tiff','svg',
  'pdf','doc','docx','xls','xlsx','ppt','pptx',
  'zip','tar','gz','7z','rar',
  'exe','dll','so','bin','dmg','app',
  'mp3','mp4','wav','avi','mov','mkv','webm',
  'ttf','woff','woff2','eot',
  'class','pyc','pyo',
]);

export function useFileManagement(settings: any) {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const activeFileRef = useRef<OpenFile | null>(null);
  activeFileRef.current = openFiles.find(f => f.path === activeFilePath) || null;

  const openFilesRef = useRef(openFiles);
  openFilesRef.current = openFiles;

  const handleOpenFile = async (filePath: string, name: string) => {
    const existing = openFiles.find(f => f.path === filePath);
    if (existing) {
      setActiveFilePath(filePath);
      return;
    }

    // Block binary / non-text file types from being opened in Monaco
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (BINARY_EXTENSIONS.has(ext)) {
      console.warn(`[useFileManagement] Skipping binary file: ${name}`);
      return;
    }

    const electron = (window as any).electronAPI;
    if (electron) {
      try {
        const content = await electron.readFile(filePath);
        console.log(`[useFileManagement] Read file ${filePath}, content length: ${content?.length}`);
        const language = LANGUAGE_MAP[ext] || 'plaintext';

        const newFile: OpenFile = { name, path: filePath, language, content, isDirty: false };
        setOpenFiles(prev => [...prev, newFile]);
        setActiveFilePath(filePath);
      } catch (err) {
        console.error("Failed to read file", err);
      }
    } else {
      console.warn("electronAPI not available, using mock");
      setOpenFiles(prev => [...prev, { name, path: filePath, language: 'javascript', content: '// mock content', isDirty: false }]);
      setActiveFilePath(filePath);
    }
  };

  const handleFileChange = (filePath: string, newContent: string) => {
    setOpenFiles(prev => prev.map(f =>
      f.path === filePath ? { ...f, content: newContent, isDirty: true } : f
    ));
  };

  const saveActiveFile = async () => {
    const fileToSave = activeFileRef.current;
    if (!fileToSave || !fileToSave.isDirty) return;

    if (settings?.formatOnSave) {
      window.dispatchEvent(new CustomEvent('editor-action', { detail: 'formatDocument' }));
      await new Promise<void>(r => setTimeout(r, 50));
    }

    const electron = (window as any).electronAPI;
    if (electron) {
      const latestFile = openFilesRef.current.find(f => f.path === fileToSave.path);
      const contentToSave = latestFile?.content || fileToSave.content;
      const success = await electron.writeFile(fileToSave.path, contentToSave);
      if (success) {
        setOpenFiles(prev => prev.map(f =>
          f.path === fileToSave.path ? { ...f, isDirty: false } : f
        ));
      }
    }
  };

  const saveAllFiles = async () => {
    const electron = (window as any).electronAPI;
    if (!electron) return;

    const dirtyFiles = openFiles.filter(f => f.isDirty);
    for (const file of dirtyFiles) {
      const success = await electron.writeFile(file.path, file.content);
      if (success) {
        setOpenFiles(prev => prev.map(f =>
          (f.path === file.path ? { ...f, isDirty: false } : f)
        ));
      }
    }
  };

  /** When a file is renamed in the explorer, update open tabs to match */
  const handleFileRenamed = (oldPath: string, newPath: string) => {
    const sepIdx = Math.max(newPath.lastIndexOf('/'), newPath.lastIndexOf('\\'));
    const newName = newPath.substring(sepIdx + 1);
    const ext = newName.substring(newName.lastIndexOf('.') + 1).toLowerCase();
    const newLang = LANGUAGE_MAP[ext] || 'plaintext';

    setOpenFiles(prev => prev.map(f => {
      if (f.path === oldPath) {
        return { ...f, path: newPath, name: newName, language: newLang };
      }
      if (f.path.startsWith(`${oldPath}/`) || f.path.startsWith(`${oldPath}\\`)) {
        const updatedPath = `${newPath}${f.path.substring(oldPath.length)}`;
        return { ...f, path: updatedPath };
      }
      return f;
    }));

    if (activeFilePath === oldPath) {
      setActiveFilePath(newPath);
    } else if (activeFilePath?.startsWith(`${oldPath}/`) || activeFilePath?.startsWith(`${oldPath}\\`)) {
      setActiveFilePath(`${newPath}${activeFilePath.substring(oldPath.length)}`);
    }
  };

  const handleCloseFile = (filePath: string) => {
    const file = openFiles.find(f => f.path === filePath);
    if (file?.isDirty) {
      const ok = window.confirm(`"${file.name}" has unsaved changes. Close anyway?`);
      if (!ok) return;
    }
    setOpenFiles(prev => {
      const next = prev.filter(f => f.path !== filePath);
      if (activeFilePath === filePath) {
        setActiveFilePath(next.length > 0 ? next[next.length - 1].path : null);
      }
      return next;
    });
  };

  // Stable ref so the keydown handler (empty-dep effect) can always call the latest version
  const handleCloseFileRef = useRef(handleCloseFile);
  handleCloseFileRef.current = handleCloseFile;

  return {
    openFiles,
    setOpenFiles,
    activeFilePath,
    setActiveFilePath,
    activeFileRef,
    openFilesRef,
    handleOpenFile,
    handleFileChange,
    saveActiveFile,
    saveAllFiles,
    handleFileRenamed,
    handleCloseFile,
    handleCloseFileRef,
  };
}
