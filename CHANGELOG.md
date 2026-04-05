# Changelog

All notable changes to NIT Builder are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
