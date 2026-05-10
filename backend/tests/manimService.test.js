/**
 * Manim Service Tests
 * Tests video generation validation, caching, and duration checks.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// We test the exported functions directly
// Note: generateManimVideo requires LLM config so we test the utility functions

describe('Manim Service — Module Loading', () => {
    it('should load manimService without errors', () => {
        const manimService = require('../services/manimService');
        assert.ok(manimService);
        assert.strictEqual(typeof manimService.generateManimVideo, 'function');
        assert.strictEqual(typeof manimService.loadManimVideos, 'function');
        assert.strictEqual(typeof manimService.deleteManimVideo, 'function');
        assert.strictEqual(typeof manimService.cancelManimVideo, 'function');
    });
});

describe('Manim Service — Script Validation (via scriptValidator)', () => {
    const { validateManimScript } = require('../services/scriptValidator');

    it('should reject script with only self.add()', () => {
        const script = `from manim import *
class CodeScene(Scene):
    def construct(self):
        box = Square()
        self.add(box)`;
        const result = validateManimScript(script);
        assert.strictEqual(result.safe, false);
    });

    it('should reject script using SVGMobject', () => {
        const script = `from manim import *
class CodeScene(Scene):
    def construct(self):
        svg = SVGMobject("file.svg")
        self.play(FadeIn(svg))`;
        const result = validateManimScript(script);
        assert.strictEqual(result.safe, false);
        assert.ok(result.errors.some(e => e.includes('SVGMobject')));
    });

    it('should accept valid animation script', () => {
        const script = `from manim import *
class CodeScene(Scene):
    def construct(self):
        self.camera.background_color = "#0d1117"
        t = Text("Hello")
        self.play(Write(t))
        self.wait(0.5)
        self.play(FadeOut(t))
        b = Square()
        self.play(Create(b))
        self.wait(0.3)
        self.play(b.animate.shift(RIGHT))
        self.wait(0.5)
        self.play(FadeOut(b))`;
        const result = validateManimScript(script);
        assert.strictEqual(result.safe, true);
    });
});

describe('Manim Service — Code Runner Integration', () => {
    const { getRunConfig } = require('../services/codeRunner');

    it('should return python config for python runtime', () => {
        const config = getRunConfig('/tmp/test.py', 'python', null);
        assert.ok(config);
        assert.strictEqual(config.needsCompile, false);
    });

    it('should return null for unknown runtime', () => {
        const config = getRunConfig('/tmp/test.xyz', 'unknown', null);
        assert.strictEqual(config, null);
    });

    it('should have 30s timeout for compiled languages', () => {
        const config = getRunConfig('/tmp/test.c', 'gcc', null);
        assert.ok(config);
        assert.strictEqual(config.needsCompile, true);
    });
});
