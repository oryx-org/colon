// Guard: Monaco completions are global singletons — register once per session
let _registered = false;

export function registerAllCompletions(monaco: any) {
    if (_registered) return;
    _registered = true;

    // ─── JavaScript / TypeScript ────────────────────────────────────────────
    const jsSnippets = [
        { label: 'console.log', insert: 'console.log(${1:value});', doc: 'Log to console' },
        { label: 'arrow function', insert: 'const ${1:fn} = (${2:args}) => {\n\t${3}\n};', doc: 'Arrow function' },
        { label: 'async arrow', insert: 'const ${1:fn} = async (${2:args}) => {\n\t${3}\n};', doc: 'Async arrow function' },
        { label: 'for...of', insert: 'for (const ${1:item} of ${2:items}) {\n\t${3}\n}', doc: 'for...of loop' },
        { label: 'Promise', insert: 'new Promise((resolve, reject) => {\n\t${1}\n})', doc: 'New Promise' },
        { label: 'try/catch', insert: 'try {\n\t${1}\n} catch (${2:err}) {\n\t${3}\n}', doc: 'try/catch' },
        { label: 'class', insert: 'class ${1:ClassName} {\n\tconstructor(${2}) {\n\t\t${3}\n\t}\n}', doc: 'Class definition' },
        { label: 'import', insert: "import { ${2} } from '${1:module}';", doc: 'Import statement' },
        { label: 'export default', insert: 'export default ${1};', doc: 'Default export' },
        { label: 'forEach', insert: '${1:arr}.forEach((${2:item}) => {\n\t${3}\n});', doc: 'Array forEach' },
        { label: 'map', insert: '${1:arr}.map((${2:item}) => ${3})', doc: 'Array map' },
        { label: 'filter', insert: '${1:arr}.filter((${2:item}) => ${3})', doc: 'Array filter' },
        { label: 'reduce', insert: '${1:arr}.reduce((${2:acc}, ${3:item}) => ${4}, ${5:initial})', doc: 'Array reduce' },
        { label: 'setTimeout', insert: 'setTimeout(() => {\n\t${1}\n}, ${2:1000});', doc: 'setTimeout' },
    ];
    for (const lang of ['javascript', 'typescript']) {
        monaco.languages.registerCompletionItemProvider(lang, {
            provideCompletionItems: (model: any, position: any) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                    startColumn: word.startColumn, endColumn: word.endColumn,
                };
                return {
                    suggestions: jsSnippets.map(s => ({
                        label: s.label,
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: s.insert,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: s.doc,
                        range,
                    }))
                };
            }
        });
    }

    // ─── Java ────────────────────────────────────────────────────────────────
    monaco.languages.registerCompletionItemProvider('java', {
        provideCompletionItems: (model: any, position: any) => {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                startColumn: word.startColumn, endColumn: word.endColumn,
            };
            const snippets = [
                { label: 'sout', insert: 'System.out.println(${1});', doc: 'Print to stdout' },
                { label: 'main', insert: 'public static void main(String[] args) {\n\t${1}\n}', doc: 'Main method' },
                { label: 'class', insert: 'public class ${1:ClassName} {\n\t${2}\n}', doc: 'Class' },
                { label: 'for', insert: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', doc: 'for loop' },
                { label: 'foreach', insert: 'for (${1:Type} ${2:item} : ${3:collection}) {\n\t${4}\n}', doc: 'enhanced for' },
                { label: 'try/catch', insert: 'try {\n\t${1}\n} catch (${2:Exception} ${3:e}) {\n\t${4}\n}', doc: 'try/catch' },
                { label: 'interface', insert: 'public interface ${1:Name} {\n\t${2}\n}', doc: 'Interface' },
                { label: 'ArrayList', insert: 'ArrayList<${1:Type}> ${2:list} = new ArrayList<>();', doc: 'ArrayList' },
                { label: 'HashMap', insert: 'HashMap<${1:K}, ${2:V}> ${3:map} = new HashMap<>();', doc: 'HashMap' },
                { label: 'StringBuilder', insert: 'StringBuilder ${1:sb} = new StringBuilder();\n${1:sb}.append(${2});', doc: 'StringBuilder' },
            ];
            const keywords = ['public', 'private', 'protected', 'static', 'final', 'void', 'int', 'double',
                'float', 'boolean', 'char', 'long', 'byte', 'short', 'String', 'return', 'new', 'this',
                'super', 'extends', 'implements', 'import', 'package', 'abstract', 'interface', 'enum'];
            return {
                suggestions: [
                    ...snippets.map(s => ({
                        label: s.label,
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: s.insert,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: s.doc,
                        range,
                    })),
                    ...keywords.map(kw => ({
                        label: kw,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: kw,
                        range,
                    })),
                ]
            };
        }
    });

    // ─── C / C++ ─────────────────────────────────────────────────────────────
    for (const lang of ['c', 'cpp']) {
        monaco.languages.registerCompletionItemProvider(lang, {
            provideCompletionItems: (model: any, position: any) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                    startColumn: word.startColumn, endColumn: word.endColumn,
                };
                const snippets = [
                    { label: 'printf', insert: 'printf("${1:%s}\\n"${2});', doc: 'printf' },
                    { label: 'scanf', insert: 'scanf("${1:%d}", &${2:var});', doc: 'scanf' },
                    { label: 'for', insert: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', doc: 'for loop' },
                    { label: 'while', insert: 'while (${1:cond}) {\n\t${2}\n}', doc: 'while loop' },
                    { label: 'main', insert: 'int main() {\n\t${1}\n\treturn 0;\n}', doc: 'main function' },
                    { label: 'struct', insert: 'struct ${1:Name} {\n\t${2}\n};', doc: 'struct definition' },
                    { label: 'malloc', insert: '${1:Type} *${2:ptr} = (${1:Type}*)malloc(${3:size} * sizeof(${1:Type}));', doc: 'malloc' },
                    { label: '#include', insert: '#include <${1:stdio.h}>', doc: 'include header' },
                    ...(lang === 'cpp' ? [
                        { label: 'cout', insert: 'std::cout << ${1} << std::endl;', doc: 'cout' },
                        { label: 'cin', insert: 'std::cin >> ${1};', doc: 'cin' },
                        { label: 'class', insert: 'class ${1:Name} {\npublic:\n\t${2}\n};', doc: 'class' },
                        { label: 'vector', insert: 'std::vector<${1:int}> ${2:v};', doc: 'vector' },
                        { label: 'map', insert: 'std::map<${1:K}, ${2:V}> ${3:m};', doc: 'map' },
                        { label: 'auto', insert: 'auto ${1:var} = ${2};', doc: 'auto type' },
                    ] : []),
                ];
                return {
                    suggestions: snippets.map(s => ({
                        label: s.label,
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: s.insert,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: s.doc,
                        range,
                    }))
                };
            }
        });
    }

    // ─── Go ──────────────────────────────────────────────────────────────────
    monaco.languages.registerCompletionItemProvider('go', {
        provideCompletionItems: (model: any, position: any) => {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                startColumn: word.startColumn, endColumn: word.endColumn,
            };
            const snippets = [
                { label: 'fmt.Println', insert: 'fmt.Println(${1})', doc: 'Print line' },
                { label: 'fmt.Printf', insert: 'fmt.Printf("${1:%s}\\n", ${2})', doc: 'Formatted print' },
                { label: 'func', insert: 'func ${1:name}(${2}) ${3:error} {\n\t${4}\n}', doc: 'Function' },
                { label: 'for', insert: 'for ${1:i} := 0; ${1:i} < ${2:n}; ${1:i}++ {\n\t${3}\n}', doc: 'for loop' },
                { label: 'for range', insert: 'for ${1:i}, ${2:v} := range ${3:slice} {\n\t${4}\n}', doc: 'range loop' },
                { label: 'if err', insert: 'if err != nil {\n\treturn ${1:nil, }err\n}', doc: 'Error check' },
                { label: 'goroutine', insert: 'go func() {\n\t${1}\n}()', doc: 'Goroutine' },
                { label: 'channel', insert: '${1:ch} := make(chan ${2:int})', doc: 'Channel' },
                { label: 'struct', insert: 'type ${1:Name} struct {\n\t${2:Field} ${3:Type}\n}', doc: 'Struct' },
                { label: 'interface', insert: 'type ${1:Name} interface {\n\t${2:Method}()\n}', doc: 'Interface' },
                { label: 'map', insert: '${1:m} := make(map[${2:string}]${3:int})', doc: 'Map' },
                { label: 'slice', insert: '${1:s} := []${2:int}{${3}}', doc: 'Slice literal' },
                { label: 'package main', insert: 'package main\n\nimport "fmt"\n\nfunc main() {\n\t${1}\n}', doc: 'Main package boilerplate' },
            ];
            const keywords = ['package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface',
                'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'return', 'break', 'continue',
                'go', 'chan', 'select', 'defer', 'make', 'new', 'len', 'cap', 'append', 'error', 'nil'];
            return {
                suggestions: [
                    ...snippets.map(s => ({
                        label: s.label,
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: s.insert,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: s.doc,
                        range,
                    })),
                    ...keywords.map(kw => ({
                        label: kw,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: kw,
                        range,
                    })),
                ]
            };
        }
    });

    // ─── Rust ────────────────────────────────────────────────────────────────
    monaco.languages.registerCompletionItemProvider('rust', {
        provideCompletionItems: (model: any, position: any) => {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                startColumn: word.startColumn, endColumn: word.endColumn,
            };
            const snippets = [
                { label: 'println!', insert: 'println!("${1}", ${2});', doc: 'Print line' },
                { label: 'fn main', insert: 'fn main() {\n\t${1}\n}', doc: 'Main function' },
                { label: 'fn', insert: 'fn ${1:name}(${2}) -> ${3:()}{} {\n\t${4}\n}', doc: 'Function' },
                { label: 'struct', insert: 'struct ${1:Name} {\n\t${2:field}: ${3:Type},\n}', doc: 'Struct' },
                { label: 'impl', insert: 'impl ${1:Type} {\n\t${2}\n}', doc: 'impl block' },
                { label: 'enum', insert: 'enum ${1:Name} {\n\t${2:Variant},\n}', doc: 'Enum' },
                { label: 'match', insert: 'match ${1:expr} {\n\t${2:pattern} => ${3},\n\t_ => ${4},\n}', doc: 'Match expression' },
                { label: 'if let', insert: 'if let ${1:Some(val)} = ${2:expr} {\n\t${3}\n}', doc: 'if let' },
                { label: 'while let', insert: 'while let ${1:Some(val)} = ${2:iter}.next() {\n\t${3}\n}', doc: 'while let' },
                { label: 'for', insert: 'for ${1:item} in ${2:iter} {\n\t${3}\n}', doc: 'for loop' },
                { label: 'vec!', insert: 'vec![${1}]', doc: 'Vec macro' },
                { label: 'use', insert: 'use ${1:std::collections::HashMap};', doc: 'use statement' },
                { label: 'Result', insert: 'Result<${1:T}, ${2:E}>', doc: 'Result type' },
                { label: 'Option', insert: 'Option<${1:T}>', doc: 'Option type' },
            ];
            const keywords = ['fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'impl', 'trait',
                'use', 'mod', 'pub', 'self', 'super', 'crate', 'return', 'if', 'else', 'match', 'loop',
                'while', 'for', 'break', 'continue', 'move', 'async', 'await', 'dyn', 'where', 'type'];
            return {
                suggestions: [
                    ...snippets.map(s => ({
                        label: s.label,
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: s.insert,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: s.doc,
                        range,
                    })),
                    ...keywords.map(kw => ({
                        label: kw,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: kw,
                        range,
                    })),
                ]
            };
        }
    });
}
