# Changelog

All notable changes to NIT Builder are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.0] — 2026-04-06 (branch: `v2-tunnel`, work in progress)

Major architectural shift from single-instance cloud tool to peer-to-peer
distributed compute network. Users bring their own GPU via a tunnel client,
VPS only routes WebSocket messages between browsers and user tunnels.

### Added (Phase B — Appwrite auth + Мои сайты)

**B.1 — SDK wrapper + tunnel tokens (commit 8159e60):**
- `app/lib/server/tunnelTokens.server.ts` — two-field scheme: HMAC-SHA256 lookup + argon2id hash
- `app/lib/server/appwrite.server.ts` — typed wrapper for node-appwrite with NitUser/NitSite/NitGeneration types
- `scripts/appwrite-migrate.ts` — idempotent migration creating database, collections, attributes, indexes
- Env: `APPWRITE_API_KEY`, `APPWRITE_PROJECT_ID` (default 69aa2114000211b48e63), `NIT_TOKEN_LOOKUP_SECRET` (openssl rand -hex 32)
- 22 new tunnelTokens tests

**B.2 — Auth endpoints (commit 1d93712):**
- `POST /api/auth/register` — Zod validated, creates Appwrite user + nit_users doc + tunnel token, sets HttpOnly cookie
- `POST /api/auth/login` — rate limited (10/min/IP), sets session cookie
- `POST /api/auth/logout` — clears cookie, invalidates Appwrite session
- `GET /api/auth/me` — current user info + live tunnel status
- `POST /api/auth/regenerate-tunnel-token` — password re-verification, revokes all active tunnels
- `app/lib/server/sessionCookie.server.ts` — HttpOnly + SameSite=Lax cookie helpers
- `app/lib/server/requireAuth.server.ts` — middleware for protected routes

**B.3 — wsHandlers Appwrite integration (commit a5fd57b):**
- Replaced dev-stub auth with `findUserByTunnelToken` (HMAC lookup + argon2 verify)
- Browser WebSocket auto-auth via Cookie header on upgrade (no handshake message)
- Dev fallback preserved when `APPWRITE_API_KEY` unset (for CI and local E2E)
- Race condition protection in async auth IIFE

**B.4 — Login/register UI + settings (commit a8c3b4a):**
- `app/routes/login.tsx` — Russian form, POST /api/auth/login, redirect on success
- `app/routes/register.tsx` — two-step flow, tunnel token reveal screen with copy-to-clipboard
- `SettingsDrawer.tsx` — Account section (email, logout, tunnel status), Tunnel Token section with password-gated regenerate flow

**B.5 — home.tsx WebSocket integration (commit a617ed7):**
- `app/lib/hooks/useAuth.ts` — fetch /api/auth/me once on mount
- `app/lib/hooks/useControlSocket.ts` — WebSocket manager with exponential backoff reconnect (2s → 30s), heartbeat every 30s, typed events
- Dual-path createSite/polishSite: WebSocket if authed+tunnel online, HTTP fallback otherwise
- Tunnel status indicator in nav (green pulsing dot / grey offline)
- Amber 'Туннель не подключён' banner with Settings CTA
- Blue sign-up CTA for anonymous users
- WS-aware cancelGeneration sends abort messages

**B.6 — Мои сайты → Appwrite (this commit):**
- `app/routes/api.sites.ts` — GET list, POST save (Zod validated)
- `app/routes/api.sites.$id.ts` — GET one (with HTML), DELETE (ownership check)
- `app/lib/stores/remoteHistoryStore.ts` — Appwrite-backed client + migration helper
- `HistoryPanel.tsx` — dual-source: localStorage for guests, Appwrite for authed users
- Auto-migration from localStorage → Appwrite on first authed open (one-shot, idempotent)
- Fire-and-forget `saveRemoteSite` in both WS and HTTP paths
- Footer adapts: 'только в браузере · зарегистрируйся →' vs 'синхронизировано с аккаунтом'

### Added (Phase A — tunnel protocol MVP)

- **Monorepo structure** with npm workspaces: `shared/` (types) and `tunnel/` (Node CLI client)
- **`shared/src/protocol.ts`** — WebSocket protocol types (TunnelToServer, ServerToTunnel, BrowserToServer, ServerToBrowser) with PROTOCOL_VERSION constant
- **`app/lib/services/tunnelRegistry.server.ts`** — in-memory state manager: multi-tunnel per user, multi-tab browser sessions, request routing, abort propagation, status broadcasting, metric counters (340 lines)
- **`app/lib/server/wsHandlers.server.ts`** — WebSocket handlers for `/api/tunnel` and `/api/control` with protocol version check, auth, heartbeat, response forwarding
- **`server.ts`** — custom HTTP+WS server via tsx, replaces `react-router-serve`, single port, graceful shutdown
- **`tunnel/`** Node.js CLI client: LM Studio streaming proxy, WebSocket reconnect with exponential backoff (5s→60s), heartbeat, abort propagation, argument parsing
- **`docs/architecture/v2-tunnel.md`** — ADR with architecture diagram, protocol spec, phase breakdown (400 lines)
- **19 tests** in `tests/tunnelRegistry.test.ts`

### Added (Phase B — Appwrite auth integration)

**B.1 — SDK wrapper + tunnel tokens:**
- `app/lib/server/tunnelTokens.server.ts` — two-field scheme: HMAC-SHA256 lookup (deterministic, DB index) + argon2id hash (random salt, verification). Fixes design flaw where argon2 salt prevents lookup
- `app/lib/server/appwrite.server.ts` — SDK wrapper, types (NitUser, NitSite, NitGeneration), session operations
- `scripts/appwrite-migrate.ts` — standalone idempotent migration script (creates DB, 3 collections, indexes)
- 22 tests in `tests/tunnelTokens.test.ts`
- New env vars: `APPWRITE_API_KEY`, `NIT_TOKEN_LOOKUP_SECRET`

**B.2 — Auth endpoints:**
- `POST /api/auth/register` — Zod validation, creates Appwrite account + nit_users doc, shows tunnel token once
- `POST /api/auth/login` — rate limited (10/min/IP), sets HttpOnly session cookie
- `POST /api/auth/logout` — invalidates session + clears cookie
- `GET /api/auth/me` — returns auth state + tunnel status
- `POST /api/auth/regenerate-tunnel-token` — requires password re-entry for safety
- `sessionCookie.server.ts`, `requireAuth.server.ts` helpers
- HttpOnly, SameSite=Lax, Secure in prod, Max-Age 30 days

**B.3 — Real auth in wsHandlers:**
- Replaced dev-stub `validateTunnelToken` with `findUserByTunnelToken` (HMAC lookup + argon2 verify)
- Browser auto-auth via Cookie header during WebSocket upgrade (no handshake message needed)
- Dev fallback preserved when `APPWRITE_API_KEY` not set (for local testing)

**B.4 — Login/register UI:**
- `app/routes/login.tsx` — email+password form
- `app/routes/register.tsx` — two-step flow: form → token display screen with copy button
- Updated `SettingsDrawer.tsx` with Account section (email, tunnel status, logout) and Tunnel Token section (regenerate flow with password re-entry)

**B.5 — home.tsx WebSocket integration:**
- `app/lib/hooks/useAuth.ts` — fetches `/api/auth/me` on mount
- `app/lib/hooks/useControlSocket.ts` — WebSocket manager with auto-reconnect (2s→30s), heartbeat, typed events
- Dual-path `createSite` and `polishSite`: WebSocket if authed+tunnel online, HTTP fallback otherwise
- Tunnel status indicator in nav (green pulsing dot when online)
- Amber banner when tunnel offline, blue CTA for anonymous users
- `cancelGeneration` sends WS abort in addition to AbortController

**B.6 — Мои сайты → Appwrite:**
- `GET /api/sites` / `POST /api/sites` — list and save (Zod validated)
- `GET /api/sites/:id` / `DELETE /api/sites/:id` — individual site with ownership check
- `remoteHistoryStore.ts` — Appwrite clients + `migrateLocalHistoryIfNeeded()` helper
- `HistoryPanel.tsx` rewritten with dual-source: localStorage for guests, Appwrite for authenticated
- Auto-migration from localStorage on first authenticated history view
- Fire-and-forget remote save in both WS and HTTP paths

### Changed

- `package.json` version bump: `1.3.1-beta` → `2.0.0-alpha.0`
- npm workspaces: root is now a monorepo with `shared` and `tunnel` workspaces
- `tsconfig.json`: `allowImportingTsExtensions: true` for server.ts direct TS imports
- Dependencies added: `node-appwrite@14.2.0`, `argon2@0.44.0`, `tsx@^4.19.0`, `ws@^8.18.0`

### Deployment notes

Phase B requires manual Appwrite setup before deploy:
```bash
export APPWRITE_API_KEY=your-server-key
npm run migrate:appwrite     # creates DB schema (idempotent)
export NIT_TOKEN_LOOKUP_SECRET=$(openssl rand -hex 32)
```

### Known limitations

- Tauri desktop client not yet implemented (Phase C pending)
- Embedded llama.cpp runtime not yet implemented (Phase D pending)
- Auth endpoints lack unit tests (need Appwrite mocks)
- Container can't reach appwrite.vibecoding.by for live verification — code compiles and smoke-tested against mock LM Studio only

### Roadmap

- Phase C — Tauri GUI tunnel client (.dmg/.exe/.AppImage)
- Phase D — Embedded llama.cpp runtime in client
- v2.0.0 stable — production deploy on VPS 185.218.0.7

---

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
