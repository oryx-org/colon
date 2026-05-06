# 🤖 Phase 6 — LLM & AI Integration

> **Timeline**: Week 6–8  
> **Team**: ML/Manim Engineer  
> **Goal**: LLM reliably converts any user code snippet into working Manim animation scripts

---

## 6.1 Objectives

- [ ] Design and refine the master prompt template
- [ ] Build the LLM client with retry logic and provider fallback
- [ ] Handle partial/incomplete code snippets
- [ ] Create Manim templates for common algorithm patterns
- [ ] Implement the retry-with-error-feedback loop
- [ ] Test with 20+ code snippets across 4 languages

---

## 6.2 LLM Client

```javascript
// backend/services/llmClient.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Store = require('electron-store');

const store = new Store();

const SYSTEM_PROMPT = `You are a Manim animation script generator.
You receive a code snippet and generate a Python Manim script that
visually explains how the code works, step by step.

RULES (CRITICAL):
1. Import ONLY from 'manim' and 'math'. No other imports.
2. Create exactly ONE class extending Scene with a construct(self) method.
3. DO NOT use os, sys, subprocess, open(), eval(), exec().
4. DO NOT use Transform() for text updates — use FadeOut + self.remove + FadeIn.
5. ALL text must use font_size between 18-32.
6. Use self.wait(2.0) minimum after each explanation text.

LAYOUT:
1. TOP-LEFT: Algorithm explanation panel (RoundedRectangle + text)
2. BOTTOM-LEFT: Current step details panel
3. RIGHT: Visual animation (arrays, variables, arrows)
4. Remove old text with self.remove() before adding new text — NO OVERLAPPING.

STYLE:
- Color-coded blocks: blue=default, yellow=comparing, red=swapping, green=sorted
- Show variable trackers for loop counters
- Use arrows to point at current elements
- Add GrowArrow, FadeIn, Circumscribe for emphasis

OUTPUT: Return ONLY Python code. No markdown, no backticks, no explanation.`;

const USER_PROMPT = (code, language, errorFeedback) => {
  let prompt = `Analyze this ${language} code and create a Manim animation:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
  prompt += 'Use a small example input. Show each step clearly with pauses.\n';
  prompt += 'If the code is incomplete, animate only what is visible.\n';

  if (errorFeedback) {
    prompt += `\n\nYour previous script had this error:\n${errorFeedback}\nPlease fix it and try again.`;
  }
  return prompt;
};

async function callLLM(code, language, errorFeedback = null) {
  const apiKey = store.get('llm.apiKey');
  if (!apiKey) throw new Error('No API key configured. Go to Settings → API Key.');

  const provider = store.get('llm.provider', 'gemini');

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let script;

      if (provider === 'gemini') {
        script = await callGemini(apiKey, code, language, errorFeedback);
      } else {
        script = await callOpenAI(apiKey, code, language, errorFeedback);
      }

      // Clean response
      script = cleanScript(script);

      // Quick syntax check — compile the Python to catch obvious errors
      // (can't run full Python compile from Node, so just basic checks)
      if (!script.includes('class ') || !script.includes('Scene')) {
        throw new Error('Generated script missing Scene class');
      }

      return script;

    } catch (err) {
      if (attempt === 0) {
        errorFeedback = err.message;
        continue; // Retry once
      }
      throw err;
    }
  }
}

async function callGemini(apiKey, code, language, errorFeedback) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: SYSTEM_PROMPT },
        { text: USER_PROMPT(code, language, errorFeedback) },
      ],
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
    },
  });

  return result.response.text();
}

function cleanScript(script) {
  // Remove markdown code fences
  if (script.includes('```python')) {
    script = script.split('```python')[1];
  }
  if (script.includes('```')) {
    script = script.split('```')[0];
  }
  return script.trim();
}

module.exports = { callLLM };
```

---

## 6.3 Prompt Engineering Lessons (From Our Testing)

These are real bugs we discovered and fixed in our proof-of-concept:

| Problem | Root Cause | Fix in Prompt |
|---|---|---|
| Text overlapping | Using `Transform()` to update text | "Use FadeOut + self.remove + FadeIn" |
| Text unreadable | Font too small or too fast | "font_size 18-32, self.wait(2.0) minimum" |
| Explanation collides with animation | Both placed in same area | "Explanations LEFT, animations RIGHT" |
| Script uses `import os` | LLM adds unsafe imports | "Import ONLY from manim and math" |
| Script has syntax errors | LLM hallucinated wrong Manim API | Retry loop sends error back to LLM |

---

## 6.4 Template System

For common patterns, skip the LLM entirely and use pre-built templates:

```javascript
// backend/services/templateMatcher.js

const PATTERNS = {
  bubble_sort: {
    keywords: ['bubble', 'sort', 'swap', 'arr[j]', 'arr[j+1]'],
    minMatches: 2,
    template: 'sorting_template.py',
  },
  binary_search: {
    keywords: ['binary', 'search', 'mid', 'left', 'right', 'low', 'high'],
    minMatches: 3,
    template: 'binary_search_template.py',
  },
  fibonacci: {
    keywords: ['fibonacci', 'fib(', 'fib[', 'dp[i-1] + dp[i-2]'],
    minMatches: 1,
    template: 'fibonacci_template.py',
  },
  factorial: {
    keywords: ['factorial', 'fact(', 'n * fact', 'n!'],
    minMatches: 1,
    template: 'factorial_template.py',
  },
};

function matchTemplate(code) {
  const lower = code.toLowerCase();
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    const matches = pattern.keywords.filter(kw => lower.includes(kw)).length;
    if (matches >= pattern.minMatches) {
      return { matched: true, name, template: pattern.template };
    }
  }
  return { matched: false };
}

module.exports = { matchTemplate };
```

---

## 6.5 API Key Configuration UI

```
┌─────────────────────────────────────────┐
│  ⚙️ Settings → API Key                  │
│                                          │
│  LLM Provider: [Gemini ▼]               │
│                                          │
│  API Key: [••••••••••••••sk-abc]  [👁]   │
│                                          │
│  [Test Connection]     Status: ✅ Valid   │
│                                          │
│  💡 Get a free API key:                  │
│     https://aistudio.google.com          │
│                                          │
│                           [Save]         │
└─────────────────────────────────────────┘
```

API key stored securely via `electron-store` (encrypted at rest on the system).

---

## 6.6 Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | Gemini API integration working | ⬜ |
| 2 | Retry with error feedback loop | ⬜ |
| 3 | Prompt template finalized | ⬜ |
| 4 | Template matcher for common patterns | ⬜ |
| 5 | Partial code handling | ⬜ |
| 6 | API key config UI | ⬜ |
| 7 | 20+ test cases verified | ⬜ |
| 8 | Clean script parser (remove markdown) | ⬜ |
