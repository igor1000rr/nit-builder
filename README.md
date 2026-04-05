# NIT Builder

> **Create websites on your own computer. With AI. For free.**
> AI HTML site builder that runs locally through LM Studio. No cloud, no subscription, no internet required.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-green)
![Status](https://img.shields.io/badge/status-beta-orange)

[🇷🇺 Русская версия](./README.ru.md)

---

## What is this?

NIT Builder is an open-source AI website generator designed to run on your own computer using **local LLMs** via LM Studio. You describe a website in plain language — it generates a complete, production-ready HTML file in 30-60 seconds.

**Key difference from Tilda/Wix/v0/Bolt:** everything runs locally. No cloud. No subscriptions. No data sent to third parties. Works offline after setup.

### Who it's for

- Small business owners who need a landing page without paying 1500₽/month forever
- Freelancers creating quick sites for clients
- Students with an RTX 3060 and no budget
- Anyone who wants a website and owns the data

### What you can create

16 built-in templates covering the most common use cases:

☕ Coffee shops · 💈 Barbershops · 📸 Photographers · 💻 Developer portfolios · 💒 Wedding invitations · 💪 Fitness trainers · 🍽️ Restaurants · 📚 Tutors · 💅 Beauty services · 🔧 Auto shops · 🎨 Handmade businesses · 🎧 DJs/Musicians · 🚀 SaaS landings · 🦷 Medical clinics · 🧘 Yoga studios · 📄 Universal fallback

---

## How it works

```
Your prompt ("site for a coffee shop in Minsk")
        ↓
[Planner LLM] → JSON plan: {business_type, tone, sections, colors, template_id}
        ↓
[Template selected from catalog]
        ↓
[Coder LLM] → adapts template to your plan → streams HTML
        ↓
Live preview in iframe · Download as single HTML file
```

**Why template-adaptation instead of from-scratch generation:**
Small local models (7B parameters) struggle to write a complete React project with imports, components, and config files. They do great at *adapting existing HTML*. This is the key insight that makes NIT Builder work on an RTX 3060.

---

## Quick Start

### Prerequisites

- **Node.js 20+**
- **One LLM provider** (choose one):
  - **LM Studio** (recommended, free, local) — [lmstudio.ai](https://lmstudio.ai)
  - **Groq** (free tier, cloud) — [console.groq.com](https://console.groq.com/keys)
  - **OpenRouter** (paid, cloud) — [openrouter.ai](https://openrouter.ai/keys)

### Install

```bash
git clone https://github.com/igor1000rr/nit-builder.git
cd nit-builder
npm install
cp .env.example .env
# Edit .env — set LMSTUDIO_BASE_URL or GROQ_API_KEY
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### For local mode (LM Studio)

1. Download [LM Studio](https://lmstudio.ai)
2. Download model: **Qwen2.5-Coder-7B-Instruct** (Q4_K_M, ~4.5 GB)
3. Start the local server in LM Studio (Developer → Start Server)
4. Ensure `LMSTUDIO_BASE_URL=http://localhost:1234` in `.env`
5. `npm run dev` → describe your site → done in ~60 seconds

### For cloud mode (no GPU)

1. Get a free Groq API key
2. Set `GROQ_API_KEY=gsk_...` in `.env`
3. `npm run dev`

---

## Hardware requirements

| Your GPU | Recommended model | Speed | Quality |
|---|---|---|---|
| 4 GB VRAM | Qwen2.5-Coder-3B-Q4 | Slow | OK |
| **8 GB VRAM (RTX 3060/4060)** | **Qwen2.5-Coder-7B-Q4** | **Good** | **Great** ⭐ |
| 12+ GB VRAM | Qwen2.5-Coder-14B-Q4 | Fast | Excellent |
| No GPU | Groq (cloud) | Very fast | Great |

---

## Tech stack

- **React Router v7** (SSR) + **React 19** + **TypeScript**
- **Tailwind CSS v4** via Vite plugin
- **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) for LLM streaming
- **Zod** for plan schema validation
- Generated sites use **Tailwind CDN** + **Alpine.js CDN** — no build step required

Total codebase: ~5000 LOC. Small, readable, hackable.

---

## Contributing

### Add a new template

Templates are plain HTML files in `app/templates/html/`. To add yours:

1. Create `app/templates/html/your-template-id.html`
2. Rules:
   - Single file, `<!DOCTYPE html>` to `</html>`
   - Tailwind via CDN (`<script src="https://cdn.tailwindcss.com"></script>`)
   - Alpine via CDN for interactivity (optional)
   - All images from Unsplash (`https://images.unsplash.com/photo-ID?w=800`) or inline SVG
   - No local assets, no npm packages
   - Responsive (use `sm:`, `md:`, `lg:` classes)
3. Add metadata entry in `app/lib/config/htmlTemplatesCatalog.ts`:
   ```ts
   {
     id: "your-template-id",
     name: "Display Name",
     category: "business",
     description: "Brief description for the Planner to match",
     bestFor: ["keyword1", "keyword2", "keyword3"],
     sections: ["hero", "features", "contact"],
     style: "modern-minimal",
     colorMood: "light-minimal",
     emoji: "✨",
   }
   ```
4. Open a PR with a screenshot

See existing templates (`coffee-shop.html`, `portfolio-dev.html`) as examples.

### Bug reports & features

Open an issue — use the templates in `.github/ISSUE_TEMPLATE/`.

---

## Roadmap

- [x] v1.0 — HTML-first pipeline, 16 templates, LM Studio + Groq support
- [ ] v1.1 — Multi-user auth, "My Sites" page with Appwrite
- [ ] v1.2 — Save your own templates, community template gallery
- [ ] v1.3 — Image generation via Stable Diffusion (local)
- [ ] v1.4 — Export to React/Vue/Astro (for advanced users)
- [ ] v2.0 — Desktop app (Tauri) with bundled LLM runtime

---

## License

MIT © [Igor](https://t.me/igor1000rr) · Built in Belarus 🇧🇾

Part of the [VibeCoding](https://vibecoding.by) ecosystem.
