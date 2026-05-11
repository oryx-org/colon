# 🚀 Optimization Guide — Colon Desktop

---

## Advantages of Desktop (vs Web)

| Factor | Web App | Desktop App (Ours) |
|---|---|---|
| Manim rendering | Server-side → $$$, slow | Local → FREE, fast |
| Server needed | Yes (backend + workers) | No (only LLM proxy) |
| Server cost | $150+/month | ~$0 (Cloudflare Workers free tier) |
| Offline support | ❌ | ✅ (except LLM calls) |
| File system access | ❌ | ✅ Full filesystem |
| Terminal | ❌ | ✅ Real PTY terminal |

---

## 1. Reducing Animation Render Time

### Use Low Quality First

| Manim Flag | Resolution | FPS | Render Time (simple) |
|---|---|---|---|
| `-ql` | 480p | 15 | ~3-5 sec ← **Default** |
| `-qm` | 720p | 30 | ~15 sec |
| `-qh` | 1080p | 60 | ~45 sec |

The app uses `-ql` (low quality) by default for instant feedback.

### Constrain Animation Complexity

In the LLM system prompt:
- Use `run_time=0.3` for simple transitions
- Minimum 5 `self.play()` calls for meaningful content
- Font size restricted to 18-32 range

---

## 2. Caching Strategy

Desktop caching is **even better** than web caching — files persist on disk:

```
<workspace>/.colon/manim/<hash>/
├── animation.py        ← Generated Manim script
└── media/videos/       ← Rendered MP4 output

Policy:
- Cache key: SHA-256(code + language)
- Same code = instant playback (0 sec)
- Cache persists in workspace .colon/ directory
```

---

## 3. Perceived Speed Optimization

While Manim renders (5-15 sec), the UI shows progress:

```
0 sec:     "Generating animation..."    ← User sees spinner
1-2 sec:   LLM returns Manim script    ← Script validated
5-10 sec:  Manim finishes rendering    ← Video auto-plays in AnimationTab
```

---

## 4. App Size Optimization

| Strategy | Impact |
|---|---|
| Don't bundle runtimes — detect from PATH + one-click install | No binary bloat |
| Exclude test files via electron-builder `files` config | Smaller package |
| Use `asar` archive (default in electron-builder) | Faster load time |
| Monaco editor lazy-loaded language modules | Reduced initial JS |

---

## 5. LLM Cost Reduction

| Strategy | Savings |
|---|---|
| Cache → same code = skip LLM call | ~50% calls eliminated |
| Use Gemini Flash (cheapest) as default | ~80% cheaper vs Pro |
| Cloudflare Workers free tier (100k req/day) | $0 hosting cost |
| Proxy keeps API key server-side | No key exposure risk |
