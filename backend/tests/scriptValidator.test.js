/**
 * Script Validator Tests
 * Tests AST security sandboxing for Manim scripts and code execution.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    validateManimScript,
    validateImports,
    quickSafetyCheck,
    extractImports,
    stripCommentsAndStrings,
} = require('../services/scriptValidator');

describe('stripCommentsAndStrings', () => {
    it('should remove single-line comments', () => {
        const result = stripCommentsAndStrings('x = 1 # self.play()');
        assert.ok(!result.includes('self.play'));
    });

    it('should remove triple-quoted strings', () => {
        const result = stripCommentsAndStrings('x = """self.play()"""');
        assert.ok(!result.includes('self.play'));
    });

    it('should preserve actual code', () => {
        const result = stripCommentsAndStrings('self.play(FadeIn(box))');
        assert.ok(result.includes('self.play'));
    });
});

describe('extractImports', () => {
    it('should extract import statements', () => {
        const imports = extractImports('import os\nfrom manim import *\nimport math');
        assert.deepStrictEqual(imports, ['os', 'manim', 'math']);
    });

    it('should ignore commented imports', () => {
        const imports = extractImports('# import os\nfrom manim import *');
        assert.deepStrictEqual(imports, ['manim']);
    });
});

describe('validateImports', () => {
    it('should allow manim and math', () => {
        const result = validateImports('from manim import *\nimport math');
        assert.strictEqual(result.safe, true);
        assert.strictEqual(result.violations.length, 0);
    });

    it('should block os and subprocess', () => {
        const result = validateImports('import os\nimport subprocess');
        assert.strictEqual(result.safe, false);
        assert.ok(result.violations.length >= 2);
    });

    it('should block sys', () => {
        const result = validateImports('import sys');
        assert.strictEqual(result.safe, false);
    });
});

describe('validateManimScript', () => {
    it('should accept a valid Manim script', () => {
        const script = `from manim import *
class CodeScene(Scene):
    def construct(self):
        self.camera.background_color = "#0d1117"
        title = Text("Hello", font_size=36)
        self.play(Write(title))
        self.wait(0.5)
        self.play(FadeOut(title))
        box = Square()
        self.play(FadeIn(box))
        self.wait(0.5)
        self.play(box.animate.set_color(RED))
        self.wait(0.5)
        self.play(FadeOut(box))
`;
        const result = validateManimScript(script);
        assert.strictEqual(result.safe, true);
        assert.strictEqual(result.errors.length, 0);
    });

    it('should reject scripts with blocked imports', () => {
        const script = `import os\nfrom manim import *\nclass CodeScene(Scene):\n    def construct(self):\n        os.system("rm -rf /")`;
        const result = validateManimScript(script);
        assert.strictEqual(result.safe, false);
    });

    it('should reject scripts with MathTex', () => {
        const script = `from manim import *\nclass CodeScene(Scene):\n    def construct(self):\n        t = MathTex("x^2")\n        self.play(Write(t))`;
        const result = validateManimScript(script);
        assert.strictEqual(result.safe, false);
        assert.ok(result.errors.some(e => e.includes('MathTex')));
    });

    it('should reject scripts missing construct()', () => {
        const script = `from manim import *\nclass CodeScene(Scene):\n    pass`;
        const result = validateManimScript(script);
        assert.strictEqual(result.safe, false);
    });

    it('should reject scripts with no animations', () => {
        const script = `from manim import *\nclass CodeScene(Scene):\n    def construct(self):\n        box = Square()\n        self.add(box)`;
        const result = validateManimScript(script);
        assert.strictEqual(result.safe, false);
    });

    it('should reject scripts using eval()', () => {
        const script = `from manim import *\nclass CodeScene(Scene):\n    def construct(self):\n        eval("print(1)")\n        self.play(Write(Text("x")))`;
        const result = validateManimScript(script);
        assert.strictEqual(result.safe, false);
    });
});

describe('quickSafetyCheck', () => {
    it('should pass safe Python code', () => {
        const result = quickSafetyCheck('import math\nprint(math.sqrt(2))', 'python');
        assert.strictEqual(result.safe, true);
    });

    it('should fail Python code with blocked imports', () => {
        const result = quickSafetyCheck('import subprocess\nsubprocess.run(["ls"])', 'python');
        assert.strictEqual(result.safe, false);
    });

    it('should pass non-Python code without validation', () => {
        const result = quickSafetyCheck('console.log("hello")', 'javascript');
        assert.strictEqual(result.safe, true);
    });
});
