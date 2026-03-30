// Guard: Monaco is a singleton — register completions only once per session
let _registered = false;

export function registerPythonCompletions(monaco: any) {
    if (_registered) return;
    _registered = true;

    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: (model: any, position: any) => {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            const suggestions = [
                // Keywords
                ...['def', 'class', 'return', 'import', 'from', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'pass', 'try', 'except', 'finally', 'with', 'as', 'lambda', 'global', 'nonlocal', 'yield', 'async', 'await'].map(kw => ({
                    label: kw,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: kw,
                    range: range
                })),

                // Built-in functions
                ...['print', 'len', 'type', 'int', 'float', 'str', 'bool', 'list', 'dict', 'set', 'tuple', 'range', 'enumerate', 'zip', 'map', 'filter', 'sum', 'min', 'max', 'abs', 'round', 'open', 'input', 'dir', 'help', 'isinstance', 'issubclass', 'hasattr', 'getattr', 'setattr', 'delattr'].map(fn => ({
                    label: fn,
                    kind: monaco.languages.CompletionItemKind.Function,
                    insertText: `${fn}()`,
                    range: range
                })),

                // Core Modules / Snippets
                {
                    label: 'import typing',
                    kind: monaco.languages.CompletionItemKind.Module,
                    insertText: 'from typing import List, Dict, Tuple, Optional, Any',
                    documentation: 'Common typing imports.',
                    range: range
                },
                {
                    label: 'main',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: "if __name__ == '__main__':\n\t",
                    documentation: 'Main block snippet',
                    range: range
                },
                {
                    label: 'for i in range',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: 'for i in range(${1:count}):\n\t${2:pass}',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'For loop with range',
                    range: range
                },
                {
                    label: 'class',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: 'class ${1:ClassName}:\n\tdef __init__(self):\n\t\t${2:pass}',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'Class definition snippet',
                    range: range
                }
            ];

            return { suggestions: suggestions };
        }
    });
}
