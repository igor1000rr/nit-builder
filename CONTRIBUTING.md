# Contributing to NIT Builder

Thanks for wanting to contribute. The most valuable contribution is **adding new HTML templates** — they directly improve results for users.

## Adding a new template (most impactful)

Templates are plain HTML files. You don't need to understand the AI pipeline — just write good HTML.

### Steps

1. **Pick a category that's missing.** Check [existing templates](./app/templates/html/) and [issues tagged `template`](https://github.com/igor1000rr/nit-builder/issues?q=label%3Atemplate). Good candidates: tattoo studio, flower shop, language school, bar/pub, real estate agent, psychologist, dog groomer, event photographer, ceramics studio, game developer portfolio, newsletter landing.

2. **Write the HTML** in `app/templates/html/your-template-id.html`. Rules:
   - **Single file only.** From `<!DOCTYPE html>` to `</html>`.
   - **Tailwind via CDN:** `<script src="https://cdn.tailwindcss.com"></script>`.
   - **Alpine.js via CDN** for interactivity (dropdown menus, tabs): `<script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>`.
   - **Images from Unsplash only:** `https://images.unsplash.com/photo-ID?w=800` (get IDs from [unsplash.com](https://unsplash.com)).
   - **No local files** — no `.css`, no `.js`, no `.png`, no `npm` packages.
   - **Responsive:** use `sm:`, `md:`, `lg:` classes. Test at mobile width (375px) in browser devtools.
   - **Semantic HTML:** proper `<nav>`, `<main>`, `<section>`, `<footer>`, heading hierarchy.
   - **One distinct color mood:** warm, cool, dark, bold, pastel — pick one and commit to it. Don't mix.
   - **Realistic placeholder content** in Russian by default (NIT Builder targets CIS small business). English is fine for dev/IT portfolios.
   - **Size target:** 5-15 KB. Too small = not enough structure for LLM to adapt. Too big = wastes context window on 7B models.

3. **Add metadata** in [`app/lib/config/htmlTemplatesCatalog.ts`](./app/lib/config/htmlTemplatesCatalog.ts):
   ```ts
   {
     id: "your-template-id",           // must match filename
     name: "Display Name",              // shown in UI grid
     category: "service",               // see enum in TemplateMeta
     description: "What this template is for. Used by Planner LLM to match user requests.",
     bestFor: ["keyword1", "keyword2"], // Russian keywords the Planner should trigger on
     sections: ["hero", "services"],    // what sections the template contains
     style: "clean-medical",
     colorMood: "light-minimal",        // one of the 7 moods from PlanSchema
     emoji: "🦷",                        // displayed in TemplateGrid
   }
   ```

4. **Add a quick prompt example** in [`app/components/simple/TemplateGrid.tsx`](./app/components/simple/TemplateGrid.tsx):
   ```ts
   "your-template-id": "Сайт для [business] с [key features]",
   ```

5. **Test locally:**
   ```bash
   npm run dev
   # Open http://localhost:5173
   # Click your template in the grid
   # Verify generation works on Qwen-7B (or Groq fallback)
   ```

6. **Open a PR** with:
   - Screenshot of the template at 1280×800
   - Screenshot at mobile width (375×812)
   - One real-world test prompt that should match it
   - Confirmation that `npm run typecheck` and `npm run test` pass

### What makes a great template

- **Distinctive style** — not generic. A coffee shop template should feel like a coffee shop, not a SaaS landing repainted brown.
- **Strong hero section** — this is where the user first looks. Big headline, clear value prop, prominent CTA.
- **3-5 content sections** — enough to feel complete, few enough to not overwhelm.
- **Clean typography** — use Google Fonts via `<link>`. 1-2 font families max.
- **Realistic copy** — not "Lorem ipsum". Write as if you were opening this business. It helps the LLM understand tone.

Look at [`coffee-shop.html`](./app/templates/html/coffee-shop.html), [`portfolio-dev.html`](./app/templates/html/portfolio-dev.html), and [`barbershop.html`](./app/templates/html/barbershop.html) as reference quality.

---

## Reporting bugs

Open an issue with:
- What you did (exact prompt used if applicable)
- Which LLM provider and model
- What you expected
- What happened instead
- Browser console errors (if any)
- Server logs from `npm run dev`

---

## Code contributions

For code changes (pipeline, auth, UI):

1. **Open an issue first** describing the problem or proposed feature — avoids wasted work if the direction doesn't fit.
2. **Fork + branch:** `git checkout -b feat/your-feature`.
3. **Add tests** for anything non-trivial. Current test files in `tests/` are good examples.
4. **Run checks locally:**
   ```bash
   npm run typecheck
   npm run test
   npm run build
   ```
5. **Keep PRs small.** One feature or fix per PR. Refactors go in separate PRs from features.

### Project structure

```
app/
├── routes/              # React Router v7 file-based routes
├── components/simple/   # UI components for the main flow
├── lib/
│   ├── config/          # Templates catalog + prompts
│   ├── llm/             # Provider client (LM Studio, Groq, OpenRouter)
│   ├── server/          # Auth, CSRF, guest limit
│   ├── services/        # Orchestrator, session memory
│   └── utils/           # Logger, rate limit, sanitizer, SSE parser
└── templates/html/      # HTML template files
```

### Coding conventions

- **TypeScript strict mode** — no `any`, no `@ts-ignore`
- **Functional React** — no classes, hooks only
- **Async generators** for streaming pipelines
- **Zod** for runtime validation of LLM outputs and API inputs
- **No external state libraries** — `useState` and `useRef` are enough for current scope

---

## License

By contributing you agree your code is released under the [MIT License](./LICENSE).

---

Questions? Open a discussion or ping [@igor1000rr](https://t.me/igor1000rr) on Telegram.
