import { MonacoLanguageClient } from 'monaco-languageclient';
import { CloseAction, ErrorAction } from 'vscode-languageclient/browser.js';
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';

/** Languages that have an LSP server on our WebSocket bridge */
const LSP_LANGUAGES = new Set([
    'python',
    'javascript', 'typescript',
    'javascriptreact', 'typescriptreact',
    'go',
    'rust',
]);

export async function connectLsp(language: string) {
    if (!LSP_LANGUAGES.has(language)) return null;

    const electron = (window as any).electronAPI;
    const token = electron?.lsp ? await electron.lsp.getToken().catch(() => '') : '';
    if (!token) return null;

    const url = `ws://127.0.0.1:3001/${language}?token=${token}`;
    const webSocket = new WebSocket(url);

    webSocket.onopen = () => {
        const socket = toSocket(webSocket);
        const reader = new WebSocketMessageReader(socket);
        const writer = new WebSocketMessageWriter(socket);

        const languageClient = new MonacoLanguageClient({
            name: `${language.toUpperCase()} Language Client`,
            clientOptions: {
                documentSelector: [language],
                errorHandler: {
                    error: () => ({ action: ErrorAction.Continue }),
                    closed: () => ({ action: CloseAction.DoNotRestart }),
                },
            },
            messageTransports: { reader, writer }
        });

        languageClient.start();

        webSocket.onclose = () => {
            languageClient.stop();
        };
    };

    webSocket.onerror = () => {
        // LSP server not available for this language — silent fail, editor still works
    };

    return webSocket;
}
