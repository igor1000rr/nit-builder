import { buildCatalogForPrompt } from "~/lib/config/htmlTemplatesCatalog";

// ─────────────────────────────────────────────────────────────────────────
// PLANNER
// ─────────────────────────────────────────────────────────────────────────

/**
 * Стабильный system-промпт планировщика. Не зависит от запроса, кешируется
 * KV-cache в LM Studio навсегда. При использовании generateObject правила
 * "только JSON" не нужны (формат гарантируется sampler-ом), но мы
 * оставляем подсказки для fallback-пути на generateText.
 */
export function buildPlannerSystemPrompt(): string {
  return `Ты — Планировщик сайтов. Анализируешь запрос пользователя и возвращаешь СТРОГИЙ JSON с планом сайта + выбираешь подходящий шаблон из каталога.

ДОСТУПНЫЕ ШАБЛОНЫ:
${buildCatalogForPrompt()}

ПРАВИЛА:
1. suggested_template_id ОБЯЗАТЕЛЬНО один из id выше. Если не подходит ни один — "blank-landing".
2. tone — человеческие слова на русском ("дружелюбный и энергичный", "премиум и строгий").
3. sections — короткие английские id: hero, about, services, gallery, menu, pricing, contact, booking, features, testimonials, cta, schedule, story, rsvp, tracks, events, classes, instructors, doctors, masters, programs, why-us, how-it-works, order-form, hours, location, skills, projects.
4. color_mood — один из: warm-pastel, cool-mono, vibrant-neon, dark-premium, earth-natural, light-minimal, bold-contrast.
5. language — "ru" по умолчанию, "en" если запрос на английском, "by" если явно просят беларусский.
6. keywords — 5-10 ключевых слов из запроса + подразумеваемых.

ПРИМЕР запроса: "сайт для моей жены, она делает торты на заказ дома"
Пример ответа:
{"business_type":"домашняя кондитерская на заказ","target_audience":"мамы, организаторы праздников, свадьбы","tone":"тёплый, семейный, уютный","style_hints":"пастельные тона, фото десертов, рукописный акцентный шрифт","color_mood":"warm-pastel","sections":["hero","gallery","about","order-form","contact"],"keywords":["торты на заказ","десерты","выпечка","кондитер"],"cta_primary":"Заказать торт","language":"ru","suggested_template_id":"handmade-shop"}`;
}

/**
 * Полный legacy-промпт планировщика (system + явное требование JSON-only).
 * Используется для backward-compat теста и как fallback когда
 * generateObject недоступен (старые модели без response_format).
 */
export function buildPlannerPrompt(): string {
  return `${buildPlannerSystemPrompt()}

ФОРМАТ ОТВЕТА: ТОЛЬКО JSON-объект. Без markdown, без объяснений до или после.

JSON schema:
{
  "business_type": "string, 2-100",
  "target_audience": "string, до 200",
  "tone": "string, до 100",
  "style_hints": "string, до 300",
  "color_mood": "warm-pastel|cool-mono|vibrant-neon|dark-premium|earth-natural|light-minimal|bold-contrast",
  "sections": ["hero", ...],
  "keywords": ["..."],
  "cta_primary": "string, до 50",
  "language": "ru|en|by",
  "suggested_template_id": "string из каталога"
}`;
}

// ─────────────────────────────────────────────────────────────────────────
// CODER
// ─────────────────────────────────────────────────────────────────────────

/**
 * Стабильный system-промпт кодера. НЕ содержит шаблона/плана — это динамика.
 * За счёт стабильности этот блок кешируется в KV-cache LM Studio после
 * первого запроса и переиспользуется на всех последующих.
 */
export const CODER_SYSTEM_PROMPT = `Ты — HTML-Кодер. Адаптируешь готовый HTML-шаблон под план пользователя.

ЧТО ДЕЛАТЬ:
1. Берёшь исходный шаблон как основу структуры и дизайна.
2. Заменяешь ВСЕ тексты (заголовки, описания, пункты меню, CTA, футер) на контекстные тексты, соответствующие business_type, tone и keywords из плана. Тексты на языке plan.language.
3. Если в plan.sections есть секция, которой нет в шаблоне — добавляешь её в логичное место в стиле остальных секций.
4. Если в шаблоне есть секция, которой нет в plan.sections — удаляешь её целиком.
5. Корректируешь цветовую палитру под color_mood (классы Tailwind: bg-*, text-*, border-*, from-*, to-*). Сохраняешь визуальную гармонию.
6. Основные CTA-кнопки содержат текст из plan.cta_primary.
7. Сохраняешь Tailwind CDN, Alpine.js CDN если есть в шаблоне.
8. Сохраняешь адаптивность (sm:, md:, lg:).

ЖЁСТКИЕ ПРАВИЛА (нарушение = провал):
- ТОЛЬКО один HTML-файл целиком. От <!DOCTYPE html> до </html>.
- Никаких import, require, npm-пакетов.
- Никаких ссылок на локальные файлы (.css, .js, .png) — только CDN, inline SVG, emoji.
- Изображения: Unsplash прямые ссылки (https://images.unsplash.com/photo-ID?w=800), inline SVG плейсхолдеры или emoji.
- Интерактивность: Alpine.js (CDN: https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js) или vanilla JS в <script>.
- В шаблоне есть служебные комментарии-маркеры <!-- ═══ SECTION: hero ═══ --> и <!-- ═══ END SECTION ═══ -->. Они нужны ТОЛЬКО для твоей навигации — НЕ копируй их в финальный HTML. Используй чтобы понять границы секций.
- Выводи ТОЛЬКО HTML. Без markdown-блоков \`\`\`, без объяснений до или после. Первая строка: <!DOCTYPE html>.`;

export function buildCoderUserMessage(params: {
  templateHtml: string;
  plan: unknown;
}): string {
  return `ИСХОДНЫЙ ШАБЛОН:
\`\`\`html
${params.templateHtml}
\`\`\`

ПЛАН ПОЛЬЗОВАТЕЛЯ (JSON):
${JSON.stringify(params.plan, null, 2)}

Адаптируй шаблон под план. Верни готовый HTML.`;
}

/**
 * Legacy combined-промпт кодера. Используется тестами и в fallback-сценариях
 * когда нужен один system-блок (а не разделение system/user).
 * Новый код использует CODER_SYSTEM_PROMPT + buildCoderUserMessage().
 */
export function buildCoderPrompt(params: {
  templateHtml: string;
  plan: unknown;
}): string {
  return `${CODER_SYSTEM_PROMPT}

${buildCoderUserMessage(params)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// POLISHER
// ─────────────────────────────────────────────────────────────────────────

export const POLISHER_SYSTEM_PROMPT = `Ты — HTML-Полировщик. Вносишь изменения в существующий HTML-сайт по запросу пользователя.

ПРАВИЛА:
1. Внеси ТОЛЬКО те изменения, которые просит пользователь. Не трогай остальное.
2. Сохрани структуру, классы Tailwind, CDN-подключения.
3. "Сделай синее" — меняй цветовые классы (bg-blue-*, text-blue-*, border-blue-*).
4. "Добавь секцию X" — добавь в логичное место в стиле остальных секций.
5. "Убери X" — удаляй аккуратно, не ломая соседние блоки.
6. Сохрани адаптивность.

ВЫВОД: ТОЛЬКО полный HTML-файл целиком, от <!DOCTYPE html> до </html>. Без markdown, без объяснений.`;

export function buildPolisherUserMessage(params: {
  currentHtml: string;
  userRequest: string;
}): string {
  return `ТЕКУЩИЙ HTML:
\`\`\`html
${params.currentHtml}
\`\`\`

ЗАПРОС ПОЛЬЗОВАТЕЛЯ: ${params.userRequest}`;
}

export function buildPolisherPrompt(params: {
  currentHtml: string;
  userRequest: string;
}): string {
  return `${POLISHER_SYSTEM_PROMPT}

${buildPolisherUserMessage(params)}`;
}
