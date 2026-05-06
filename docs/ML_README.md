# 🤖 ML/AI README — LLM & Manim Script Generation

---

## Overview

The ML/AI module is responsible for:
1. Receiving a user's code snippet
2. Sending it to an LLM (Gemini / GPT) with a carefully crafted prompt
3. Receiving a Manim Python script back
4. Validating the script for security (no dangerous imports/functions)
5. Handling failures with retry + error feedback

---

## Files

```
backend/services/
├── llmClient.js           # Calls Gemini/GPT API
└── scriptValidator.js     # AST-based security validation

manim-service/
├── templates/             # Pre-built Manim templates
│   ├── sorting.py
│   ├── recursion.py
│   ├── array_ops.py
│   └── ...
├── validator.py           # Python version of validator
└── requirements.txt       # manim, google-generativeai, openai
```

---

## Prompt Engineering Summary

### Key Rules in System Prompt

1. **Imports**: Only `manim` and `math` allowed
2. **Layout**: Explanations LEFT, animations RIGHT — never overlap
3. **Text management**: FadeOut + self.remove + FadeIn (never Transform)
4. **Pacing**: self.wait(2.0) minimum after text
5. **Font size**: 18-32 range only
6. **One class**: Exactly one class extending Scene

### Known Gotchas (From Our Testing)

| Bug | Cause | Prompt Fix |
|---|---|---|
| Overlapping text | Transform() reuse | "Always FadeOut → remove → FadeIn" |
| Text too fast | Small wait() | "self.wait(2.0) minimum" |
| Script crashes | Wrong Manim API | Retry with error message feedback |
| Unsafe code | LLM adds `import os` | Validator blocks it before execution |

---

## Cost Estimate (Gemini Flash)

| Per Request | Cost |
|---|---|
| Input tokens (~1300) | ~$0.00013 |
| Output tokens (~2000) | ~$0.0008 |
| **Total** | **~$0.001/request** |

1000 requests/day = ~$1/day = ~$30/month

---

## Template System

Skip the LLM for detected patterns:

| Pattern | Keywords | Template |
|---|---|---|
| Bubble Sort | `bubble`, `swap`, `arr[j]` | `sorting.py` |
| Binary Search | `binary`, `mid`, `left`, `right` | `binary_search.py` |
| Fibonacci | `fibonacci`, `fib(`, `dp[i-1]` | `fibonacci.py` |
| Factorial | `factorial`, `fact(`, `n!` | `factorial.py` |

Templates are **free** (no LLM call) and **guaranteed to render** correctly.
