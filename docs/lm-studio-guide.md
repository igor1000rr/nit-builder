# LM Studio Optimization Guide for NIT Builder

How to squeeze maximum quality out of a local LLM on a modest GPU (8 GB VRAM target).

## TL;DR for 8 GB GPUs

1. **Model**: Qwen2.5-Coder-7B-Instruct, Q4_K_M quantization (~4.5 GB)
2. **Context length**: 16384 tokens (enough for any NIT Builder template + response)
3. **KV cache quantization**: Q8_0 (saves ~40% VRAM on context, minimal quality loss)
4. **GPU offload layers**: Max (all layers on GPU)
5. **Flash Attention**: ON
6. **RoPE scaling**: leave as "none" — Qwen2.5 has native 32K, you don't need YaRN for NIT Builder

With these settings, generation is fast and stable for all 16 templates.

---

## Why not YaRN by default?

YaRN is a technique that extends a model's context window beyond its native training length by rescaling positional embeddings (RoPE). It's impressive but **you don't need it for NIT Builder** because:

| What NIT Builder feeds the model | Typical size |
|---|---|
| Coder system prompt | ~1500 tokens |
| Template HTML (annotated for LLM) | ~3500-5500 tokens |
| Plan JSON | ~500 tokens |
| User message | ~100 tokens |
| **Total input** | **~6-8K tokens** |
| Generated output | ~4-8K tokens |
| **Grand total** | **~10-16K tokens** |

Qwen2.5-Coder-7B has **32K native context**. You use 30-50% of it. YaRN would be needed only if you went beyond 32K, which is never the case for a single-page HTML landing.

### When YaRN actually helps

- You're editing a very large generated site (20K+ tokens) through multiple polish iterations
- You're using a smaller model (e.g. Qwen2.5-Coder-3B with 8K native context)
- You're doing multi-page site generation (future v1.4 feature)

If NIT Builder shows you the warning `Контекст занят на 85%. Рассмотри YaRN scaling`, that's when to turn it on.

---

## Full LM Studio setup (step by step)

### 1. Download the model

LM Studio → **Discover** tab → search `Qwen2.5-Coder-7B-Instruct` → pick the **Q4_K_M** variant from `lmstudio-community` or `bartowski` uploader → Download. Wait ~5 min, file is ~4.5 GB.

### 2. Load with optimized settings

Click the model to load it. In the right panel (**Advanced Configuration**), set:

| Setting | Value | Why |
|---|---|---|
| **Context Length** (n_ctx) | `16384` | Fits everything NIT Builder sends with room to spare. Higher eats more VRAM with no benefit. |
| **GPU Offload** | Max (`-1` or all layers) | Entire model on GPU for max speed. On 8 GB you can fit all 28 layers of Qwen-7B-Q4. |
| **CPU Thread Pool Size** | # of physical cores | Helps with the few CPU-side ops. Usually 8 on modern CPUs. |
| **Evaluation Batch Size** | `512` | Default is fine. |
| **Flash Attention** | ON ✅ | Much faster attention, less VRAM. Critical on 8 GB. |
| **K Cache Quantization** | `q8_0` | KV cache is a huge VRAM eater for long contexts. Q8_0 halves it with ~0% quality loss on coding tasks. |
| **V Cache Quantization** | `q8_0` | Same reasoning. |
| **RoPE Frequency Base** | `0` (auto) | Qwen2.5 handles this in its GGUF metadata. Don't touch. |
| **RoPE Frequency Scale** | `0` (auto) | Same. |
| **Temperature** | controlled by NIT Builder | Leave LM Studio default. NIT Builder overrides per step. |

### 3. Start the server

Bottom status bar → **Local Server** tab → **Start Server** → default port `1234`. Leave it running.

### 4. Verify from NIT Builder

```bash
curl http://localhost:1234/v1/models
```

You should see your loaded model. Open NIT Builder at `http://localhost:5173` — the LocalModelStatus badge should turn green.

---

## When you actually need YaRN (advanced)

If you see the warning `Контекст занят на 85%` in NIT Builder logs, or you're running a 3B model with only 8K native context:

1. In LM Studio Advanced Configuration, find **RoPE Scaling Type** (or **RoPE Frequency Scale** depending on version)
2. Change from `none`/`linear` to `yarn`
3. Set the scale factor:
   - **2.0** = doubles context (8K → 16K, 32K → 64K)
   - **4.0** = quadruples (8K → 32K, 32K → 128K)
4. Reload the model
5. Increase **Context Length** to match the new effective context

**Trade-off:** YaRN loses some precision on short tasks. If you turn it on, you may notice slightly worse quality on simple prompts. That's why it's OFF by default for NIT Builder.

---

## Memory math for 8 GB GPU

Rough budget (Qwen2.5-Coder-7B Q4_K_M, Flash Attention ON, KV Q8):

```
Model weights:        ~4.5 GB
KV cache (16K ctx):   ~1.5 GB   ← Q8 quantization cuts this in half
Compute overhead:     ~0.8 GB
---
Total:                ~6.8 GB   ← leaves ~1.2 GB for display/other GPU usage
```

Without KV cache quantization: +1.5 GB → OOM likely on 8 GB cards.
Without Flash Attention: +1 GB and 2x slower.

**If you have 6 GB VRAM**: drop to Q3_K_S model (~3.5 GB) or use Qwen2.5-Coder-3B.
**If you have 12+ GB VRAM**: use Qwen2.5-Coder-14B Q4_K_M for better output quality.

---

## Performance benchmarks (approximate)

On RTX 3060 8GB with settings above:

| Task | Time |
|---|---|
| Planner step (plan JSON) | 3-8 s |
| Coder step (full HTML ~8K tokens) | 25-60 s |
| Polisher (single edit) | 15-40 s |
| **Total: create a site from scratch** | **30-70 s** |

Groq cloud for comparison: 5-15 seconds total (but requires internet).

---

## Troubleshooting

**"LM Studio не найден" in NIT Builder**
→ Server not started in LM Studio. Developer tab → Start Server.
→ Mixed content on HTTPS. Use `http://localhost:5173` for local dev, NOT a deployed HTTPS version.

**Out of memory on model load**
→ Lower context to 8192 or 12288.
→ Ensure Flash Attention is ON.
→ Close other GPU apps (Chrome with hardware accel eats 1+ GB).

**Generation is very slow (< 10 tokens/sec)**
→ Check GPU offload — make sure all layers are on GPU, not partially CPU.
→ Flash Attention not enabled.

**Model generates garbage / repeats itself**
→ Quality issue with Q4 on edge cases. Try Q5_K_M (needs ~5.5 GB).
→ Temperature too high. NIT Builder uses 0.3-0.4 by default, which should be fine.

**Generated HTML is incomplete (cut off)**
→ Context overflow. Increase context length in LM Studio or reduce template size.
→ Check NIT Builder logs for `checkContextBudget` warnings.

---

## References

- [Qwen2.5-Coder technical report](https://qwenlm.github.io/blog/qwen2.5-coder-family/) — native 32K context, specialized for code
- [YaRN paper](https://arxiv.org/abs/2309.00071) — original RoPE rescaling algorithm
- [LM Studio docs](https://lmstudio.ai/docs) — official settings reference
