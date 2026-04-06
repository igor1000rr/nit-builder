# Changelog

All notable changes to NIT Builder are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1-beta] — 2026-04-06

### Fixed

- **Security**: upgraded `ai` from `^4.0.0` to `^5.0.167` and `@ai-sdk/openai` from `^1.0.0` to `^2.0.102` to patch 2 moderate CVEs:
  - GHSA-rwvc-j5jr-mgvh — filetype whitelist bypass in `ai` ≤5.0.51
  - GHSA-33vc-wfww-vjfv — XSS in transitive `jsondiffpatch` <0.7.2
  - `npm audit --omit=dev` now reports **0 vulnerabilities**
- **404 page**: `$.tsx` splat route now returns HTTP 404 status via `loader` throwing `Response(null, { status: 404 })`. Previously all unknown paths returned HTTP 200
- **API breaking change migration**: `maxTokens` → `maxOutputTokens` in `streamText`/`generateText` calls (3 call sites in orchestrator)

## [1.3.0-beta] — 2026-04-05

### Added

- **Settings drawer** (`SettingsDrawer.tsx`) — provider selector with health status (pings LM Studio, checks Groq/OpenRouter keys), keyboard shortcuts reference, version info. Accessible via ⚙️ button or `⌘,`
- **`/api/providers` endpoint** — returns available providers with health check status, latency, detected model name. LM Studio pinged in real-time
- **404 catch-all page** (`$.tsx`) — custom not-found with CTA back to home
- **HTML auto-repair** (`htmlRepair.ts`) — heuristic repair for truncated LLM output: closes unclosed tags in reverse order, removes broken mid-tag content, ensures `</body></html>` present. Integrated into `stripCodeFences` pipeline
- **GitHub Actions release automation** (`.github/workflows/release.yml`) — on tag push: runs full CI, extracts changelog section, creates GitHub Release with proper body. Pre-release auto-detected from `beta`/`alpha` in tag name
- **Provider selection from UI** — `selectedProvider` state in `home.tsx`, passed as `providerId` to pipeline API. Users can switch between LM Studio / Groq / OpenRouter without restarting server

### Changed

- **Keyboard shortcuts expanded** — added `⌘,` / `Ctrl+,` for Settings, `Esc` now closes Settings drawer too (priority: settings > history > cancel)
- **Welcome nav** — added ⚙️ settings button, "О проекте" hidden on mobile for space

### Tests

- `tests/htmlRepair.test.ts` — 10 tests for truncated HTML repair (mid-tag cut, void elements, self-closing, nested unclosed, real-world template truncation)

---

## [1.2.0-beta] — 2026-04-05

### Added

- **22 HTML templates** — 6 new categories: tattoo studio, flower shop, language school, legal firm, game studio, real estate. Catalog grows from 16 to 22
- **Pipeline progress bar** (`PipelineProgress.tsx`) — visual 4-step indicator with gradient fill, animated icons, streaming character counter
- **Toast notification system** — `toastStore.ts` + `ToastContainer.tsx`, 4 types (success/error/info/warning), auto-dismiss, slide-in CSS animation
- **LocalStorage site history** — saves last 20 generations in browser, survives page reload. `HistoryPanel.tsx` with relative timestamps, delete support, open-in-editor action
- **Keyboard shortcuts** — `⌘H/Ctrl+H` history, `⌘D/Ctrl+D` download, `Esc` cancel/close, with hint display in footer
- **`/api/metrics` Prometheus endpoint** — counters (generations total/completed/failed, template selections, rate limits), histograms (generation latency), process uptime and heap memory
- **AbortController** for generation cancellation — Esc key or Cancel button stops the LLM stream mid-generation

### Changed

- **`home.tsx` rewritten** — integrates progress bar, toast notifications, history panel, keyboard shortcuts, abort support. Generation results auto-saved to localStorage
- **`htmlOrchestrator.ts` instrumented** — metrics collected at generation start, template selection, completion, and failure points with latency tracking
- **`TemplateGrid.tsx`** — 6 new quick prompts for new template categories

---

## [1.1.0-beta] — 2026-04-05

### Added

- **LLM-facing section markers** — templates are annotated with `<!-- ═══ SECTION: id ═══ -->` / `<!-- ═══ END SECTION ═══ -->` comments before being sent to the Coder. Helps small local models (7B) navigate structure on long contexts, especially with YaRN RoPE scaling. Markers are stripped from the final output automatically
- **Context budget guard** (`checkContextBudget` in `llm/client.ts`) — detects when input + desired output exceed the model's context window. Returns a warning at 80% usage and errors out at 100% with actionable guidance mentioning YaRN
- **SEO endpoints**: `/sitemap.xml` and `/robots.txt` generated dynamically based on request origin
- **Security headers** via custom `entry.server.tsx`: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **LM Studio optimization guide** (`docs/lm-studio-guide.md`) — comprehensive setup for 8 GB GPUs: Flash Attention, Q8 KV cache quantization, memory budget math, performance benchmarks, troubleshooting, and when YaRN is actually needed
- **`docs/launch-post.md`** — ready-to-publish announcement for VibeCoding blog, Habr, r/LocalLLaMA, Show HN
- **40 additional tests** (total: 106/106 passing)
  - `tests/llmClient.test.ts` — 22 tests for provider selection, context budget, user key overrides
  - `tests/htmlPrompts.test.ts` — 14 tests for planner/coder/polisher prompts
  - `tests/htmlTemplatesCatalog.test.ts` — +5 tests for annotated loader

### Changed

- **Coder prompt** updated with explicit instructions about section markers (navigational only, don't copy to output)
- **`stripCodeFences`** now robustly extracts `<!DOCTYPE html>...</html>` even when the LLM adds a prefix like "Вот HTML:". Also strips any stray section markers as a safety net
- **CI workflow** now runs `npm ci` + typecheck + **test** + build (test step was missing in 1.0)

### Fixed

- Build was broken when `TemplateGrid` (client) imported from catalog file with `node:fs` — split into `.ts` (client-safe) and `.server.ts`
- SSE streaming parser split by `\n` instead of `\n\n`, causing some events to be lost
- Stale `sessionId` closure in `home.tsx` — switched to `useRef`
- Dead links `/my-sites` and `/login` in home nav (planned for v1.2) — replaced with GitHub link
- Planner JSON parse errors crashed the pipeline — now falls back to default plan silently
- Iframe thrashing on every streamed token → throttled via `requestAnimationFrame`
- Mixed content on HTTPS for `LocalModelStatus` — now detects `https:` protocol and shows fallback message
- Security: `sandbox="allow-same-origin"` removed from preview iframes — generated HTML no longer has access to site cookies
- Dead "Правка" button in LivePreview with empty `onEdit` handler — removed
- `stripCodeFences` broke on LLM output with prefix text — replaced with robust DOCTYPE/HTML boundary extraction

---

## [1.0.0-beta] — 2026-04-05

### Initial release

First public beta of NIT Builder — an HTML-first AI site generator optimized for local LLMs.

### Added

- **2-step LLM pipeline**: Planner (JSON plan + template selection) → Coder (template adaptation)
- **16 built-in HTML templates** covering common small-business categories: coffee shop, barbershop, photographer, developer portfolio, wedding invitation, fitness trainer, restaurant, tutor, beauty master, car service, handmade shop, DJ/musician, SaaS landing, medical clinic, yoga studio, universal fallback
- **Polisher mode** for iterative edits via chat interface
- **3 LLM providers** with auto-priority: LM Studio (local, free), Groq (cloud, free tier), OpenRouter (cloud, paid)
- **Client-side LM Studio detection** via `fetch(localhost:1234/v1/models)` with HTTPS mixed-content awareness
- **Live preview** with mobile/tablet/desktop viewport switching
- **SSE streaming** with rAF-throttled iframe updates to prevent browser freeze
- **Download as single HTML file** — no build step required, host anywhere
- **Landing page** at `/about` explaining project positioning and hardware requirements
- **Security**: CSRF protection (Origin/Referer check), rate limiting (sliding window per IP), guest daily limit, prompt injection filter, sandboxed iframe without `allow-same-origin`
- **Health endpoint** at `/api/health` reporting provider status and template count
- **Test suite** with 65 unit tests covering plan schema, SSE parser, prompt sanitizer, templates catalog, CSRF, rate limit

### Tech stack

- React Router v7 (SSR) + React 19 + TypeScript strict
- Tailwind CSS v4 via Vite plugin
- Vercel AI SDK (`ai` + `@ai-sdk/openai`) for LLM streaming
- Zod for runtime validation
- ~5,000 LOC, 0 vulnerabilities, 0 dependencies on the old multi-agent NIT codebase

### Deployment

- Dockerfile (multi-stage Alpine, ~150 MB image)
- nixpacks.toml for Coolify auto-deploy
- docker-compose.yml for local self-hosting
- GitHub Actions CI (typecheck + test + build)

---

## [Unreleased] — Roadmap

### v1.1 — Multi-user (planned)
- User registration and login
- "My Sites" page with saved generations
- Per-user API key storage (Groq/OpenRouter)
- Appwrite integration for persistence

### v1.2 — Community templates (planned)
- "Save as template" button on successful generations
- Public template gallery with previews
- Template voting and usage stats

### v1.3 — Image generation (planned)
- Stable Diffusion integration for hero images
- Inline image generation during pipeline

### v1.4 — Code export (planned)
- Export to React + Vite
- Export to Vue 3
- Export to Astro
- Export to plain WordPress theme

### v2.0 — Desktop app (planned)
- Tauri-based desktop bundle
- Built-in LLM runtime (no LM Studio required)
- Offline-first with local project storage
