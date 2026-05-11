import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/global.css'

// ── Monaco Editor Setup ──
// Configure MonacoEnvironment BEFORE importing monaco-editor.
// In production (Electron asar), Monaco's default worker resolution fails
// because Web Workers can't load scripts from inside an asar archive.
// This setup uses Vite's built-in worker URL handling to create proper
// blob-URL workers that work in both dev and production.
self.MonacoEnvironment = {
  getWorker: function (_workerId: string, label: string) {
    const getWorkerModule = (moduleUrl: string) => {
      return new Worker(new URL(moduleUrl, import.meta.url), { type: 'module' });
    };

    switch (label) {
      case 'json':
        return getWorkerModule('monaco-editor/esm/vs/language/json/json.worker?worker');
      case 'css':
      case 'scss':
      case 'less':
        return getWorkerModule('monaco-editor/esm/vs/language/css/css.worker?worker');
      case 'html':
      case 'handlebars':
      case 'razor':
        return getWorkerModule('monaco-editor/esm/vs/language/html/html.worker?worker');
      case 'typescript':
      case 'javascript':
        return getWorkerModule('monaco-editor/esm/vs/language/typescript/ts.worker?worker');
      default:
        return getWorkerModule('monaco-editor/esm/vs/editor/editor.worker?worker');
    }
  },
};

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
loader.config({ monaco });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
