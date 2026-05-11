# 🤖 ML/AI README — LLM & Manim Script Generation

---

## Overview

The ML/AI module is responsible for:
1. Receiving a user's source code file
2. Sending it to the Gemini API (via Cloudflare Worker proxy) with a carefully crafted system prompt
3. Receiving a Manim Python script back
4. Validating the script for security using AST-level analysis (`scriptValidator.js`)
5. Executing the script locally to generate an MP4 video
6. Post-render validation (file size, duration checks)

---

## Files

```
backend/services/
├── llmService.js              # Multi-provider LLM integration (Gemini proxy, Groq, Anthropic, OpenAI)
├── manimService.js            # LLM prompt → Manim script → validation → render → MP4
├── scriptValidator.js         # AST-level import allowlist/blocklist + dangerous pattern detection
├── animationGenerator.js      # Block-level animation generation
└── blockDetectorUniversal.js  # Universal syntax block detection across languages

colon-proxy/
└── src/index.js               # Cloudflare Worker — keeps Gemini API key server-side
```

---

## LLM Provider Architecture

The `llmService.js` supports multiple LLM providers through a unified `chatCompletion()` interface:

| Provider | Routing | Auth |
|---|---|---|
| **Gemini** (default) | Via Cloudflare Worker proxy | API key stored as Wrangler secret |
| **Groq** | Direct HTTPS | API key in `.env` |
| **Anthropic** | Direct HTTPS | API key in `.env` |
| **OpenAI** | Direct HTTPS | API key in `.env` |

For production deployments, Gemini is the recommended provider because the API key is protected server-side via the Cloudflare Worker proxy.

---

## Prompt Engineering Summary

### Key Rules in System Prompt

1. **Imports**: Only `manim`, `math`, `numpy`, and safe stdlib modules allowed
2. **Layout**: Explanations LEFT, animations RIGHT — never overlap
3. **Text management**: FadeOut + self.remove + FadeIn (never Transform)
4. **Pacing**: `self.wait(2.0)` minimum after text changes
5. **Font size**: 18-32 range only
6. **One class**: Exactly one class extending `Scene`
7. **Minimum animations**: At least 5 `self.play()` calls required

### Known Gotchas (From Testing)

| Bug | Cause | Fix |
|---|---|---|
| Overlapping text | Transform() reuse | "Always FadeOut → remove → FadeIn" in prompt |
| Text too fast | Small wait() | "self.wait(2.0) minimum" in prompt |
| Script crashes | Wrong Manim API | Retry with error message feedback |
| Unsafe code | LLM adds `import os` | scriptValidator blocks before execution |
| Zero-duration video | No self.play() calls | Validator rejects scripts without animations |
| Empty video file | Manim rendering fails silently | Post-render file size/duration check |

---

## Security Validation Pipeline

Every LLM-generated script passes through `scriptValidator.js` before execution:

```
1. Import Allowlist Check
   ✅ manim, math, numpy, random, collections, itertools, functools, etc.
   ❌ os, sys, subprocess, socket, pickle, importlib, etc.

2. Dangerous Pattern Detection
   ❌ eval(), exec(), compile(), __import__()
   ❌ open() in write mode
   ❌ subprocess.*, os.system, os.popen

3. Banned Manim Object Detection
   ❌ MathTex, Tex (require LaTeX)
   ❌ Code (requires Pygments fonts)
   ❌ SVGMobject, ImageMobject (require external files)
   ❌ NumberPlane, Axes (often fail)
   ❌ Table, Brace (LaTeX dependencies)

4. Animation Structure Validation
   ✅ Must have construct(self) method
   ✅ Must have self.play() or self.wait() calls
   ❌ Reject scripts with only self.add() (no timeline)
```

---

## Cost Estimate (Gemini Flash via Proxy)

| Per Request | Cost |
|---|---|
| Input tokens (~1300) | ~$0.00013 |
| Output tokens (~2000) | ~$0.0008 |
| **Total** | **~$0.001/request** |

1000 requests/day ≈ $1/day ≈ $30/month
