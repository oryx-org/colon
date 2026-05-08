export function setupHtmlAutoClose(editor: any, monaco: any) {
    let timeout: number | null = null;

    editor.onDidChangeModelContent((event: any) => {
        const { changes } = event;
        if (!changes || changes.length === 0) return;

        const [change] = changes;

        // Only react when the user types a closing bracket for a tag
        if (change.text === '>' && change.rangeLength === 0) {

            // Debounce slightly to ensure it's a manual human keystroke
            if (timeout) clearTimeout(timeout);

            timeout = window.setTimeout(() => {
                const model = editor.getModel();
                const position = editor.getPosition();

                // Ensure we are inside HTML/XML or a language that uses tags
                const languageStr = model.getLanguageId();
                if (!['html', 'xml', 'php', 'javascript', 'typescript'].includes(languageStr)) {
                    return; // React/JSX tags might also benefit, so js/ts is included.
                }

                const textUntilPosition = model.getValueInRange({
                    startLineNumber: position.lineNumber,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                });

                // Match <tagName> without attributes for simple auto-close
                // Or <tagName attr="value"> 
                const match = textUntilPosition.match(/<([a-zA-Z0-9-]+)[^>]*>$/);
                if (!match) return;

                const [, tag] = match;

                // List of HTML void elements that shouldn't be auto-closed
                const voidElements = [
                    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
                    'link', 'meta', 'param', 'source', 'track', 'wbr'
                ];

                if (voidElements.includes(tag.toLowerCase())) return;

                const closeTag = `</${tag}>`;

                // Read what's right after the cursor to see if user already closed it
                const textAfterPosition = model.getValueInRange({
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column + closeTag.length
                });

                // Proceed if the closing tag isn't already there
                if (textAfterPosition !== closeTag) {
                    // Create an undo-able edit
                    editor.executeEdits("auto-close-tag", [{
                        range: new monaco.Range(
                            position.lineNumber, position.column,
                            position.lineNumber, position.column
                        ),
                        text: closeTag,
                        forceMoveMarkers: true
                    }]);

                    // Move cursor back inside the tags
                    editor.setPosition(position);
                }
            }, 10);
        }
    });
}
