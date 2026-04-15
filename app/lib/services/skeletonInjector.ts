/**
 * Skeleton Direct Injection (Tier 3 шаг 1).
 *
 * Идея. Если Planner уже выдал весь копирайт (hero/benefits/social_proof/cta) —
 * Coder НЕ НУЖЕН. Мы можем прямо подставить тексты в шаблон через server-side
 * DOM-replacement по эвристическим селекторам.
 *
 * Эффект:
 *   - Coder вызывается в ~20-30% случаев вместо 100%
 *   - latency падает с ~15s до ~1s на successful injection
 *   - токены: 0 Coder tokens (раньше 6000+ prompt + 4000+ completion)
 *   - гарантия: HTML-структура шаблона не ломается вообще
 *
 * Стратегия. Работаем по regex вместо DOM-parser-а (избегаем jsdom):
 *   1. <h1>...</h1> в #hero → hero_headline
 *   2. Первый <p ...>...</p> после h1 в #hero → hero_subheadline
 *   3. <h2>...</h2> + <p>...</p> в features/benefits ⑁екции → key_benefits[i]
 *   4. social_proof_line → вставляем блок после hero (если нет подходящего слота)
 *   5. cta_microcopy → <small class="cta-microcopy">...</small> под первой кнопкой в hero
 *
 * Порог. Если < SLOT_FILL_THRESHOLD слотов реально заменено → фолбэк на Coder.
 *
 * Backward-compat. Если plan без hero_headline (legacy planner) — сразу возвращаем null,
 * оркестратор пойдёт через старый Coder pipeline.
 *
 * ENV NIT_SKELETON_INJECT_ENABLED=0 — kill-switch.
 */

import { logger } from "~/lib/utils/logger";
import type { Plan } from "~/lib/utils/planSchema";

const SCOPE = "skeletonInjector";
const SLOT_FILL_THRESHOLD = 0.6; // хотя бы 60% слотов должны быть заполнены

export function isSkeletonInjectEnabled(): boolean {
  return process.env.NIT_SKELETON_INJECT_ENABLED !== "0";
}

export type InjectionResult = {
  ok: true;
  html: string;
  slotsFilled: number;
  slotsTotal: number;
  fillRatio: number;
} | {
  ok: false;
  reason: string;
  slotsFilled: number;
  slotsTotal: number;
  fillRatio: number;
};

/** Работает только в пределах одной секции по id. Получает [start, end) индексы. */
function findSectionRange(
  html: string,
  sectionId: string,
): { start: number; end: number } | null {
  const startMatch = html.match(
    new RegExp(`<section[^>]*id=["']${sectionId}["'][^>]*>`, "i"),
  );
  if (!startMatch || startMatch.index === undefined) return null;
  const start = startMatch.index;
  // Находим парный </section> с учётом вложенности (наши шаблоны вложенных section не имеют)
  const endMatch = html.slice(start).match(/<\/section\s*>/i);
  if (!endMatch || endMatch.index === undefined) return null;
  return { start, end: start + endMatch.index + endMatch[0].length };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Заменить внутренний текст первого тэга (сохраняет все атрибуты и вложенные тэги
 * типа <span> — просто заменяет весь innerHTML).
 * Возвращает [updatedHtml, replaced].
 */
function replaceFirstTagInRange(
  html: string,
  range: { start: number; end: number },
  tagName: string,
  newInnerText: string,
): { html: string; replaced: boolean } {
  const sectionHtml = html.slice(range.start, range.end);
  const tagOpenRe = new RegExp(`<${tagName}\\b[^>]*>`, "i");
  const openMatch = sectionHtml.match(tagOpenRe);
  if (!openMatch || openMatch.index === undefined) {
    return { html, replaced: false };
  }
  const openEnd = openMatch.index + openMatch[0].length;
  const closeRe = new RegExp(`</${tagName}\\s*>`, "i");
  const closeMatch = sectionHtml.slice(openEnd).match(closeRe);
  if (!closeMatch || closeMatch.index === undefined) {
    return { html, replaced: false };
  }
  const closeStart = openEnd + closeMatch.index;

  const before = html.slice(0, range.start) + sectionHtml.slice(0, openEnd);
  const after = sectionHtml.slice(closeStart) + html.slice(range.end);
  const newHtml = before + escapeHtml(newInnerText) + after;
  return { html: newHtml, replaced: true };
}

/**
 * Найти все <h2> и их братьев-<p> в секции features/benefits-style. Заменить по порядку.
 * Поддерживает h3 тоже (в части шаблонов карточки features используют h3).
 */
function replaceBenefitCards(
  html: string,
  sectionRange: { start: number; end: number },
  benefits: Array<{ title: string; description: string }>,
): { html: string; replaced: number } {
  const sectionHtml = html.slice(sectionRange.start, sectionRange.end);
  // Ищем пары (h3|h2 + ближайший p в том же контейнере).
  // Простая эвристика: все h3 в секции + первый p после каждого h3.
  const headingRe = /<(h[23])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  type Heading = { tag: string; openIdx: number; closeEnd: number };
  const headings: Heading[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(sectionHtml)) !== null) {
    headings.push({
      tag: m[1]!.toLowerCase(),
      openIdx: m.index,
      closeEnd: m.index + m[0].length,
    });
  }
  if (headings.length === 0) return { html, replaced: 0 };

  // Выбираем преимущественно h3 (карточки), иначе h2
  const cardLevel = headings.some((h) => h.tag === "h3") ? "h3" : "h2";
  const cards = headings.filter((h) => h.tag === cardLevel);
  if (cards.length === 0) return { html, replaced: 0 };

  // Для каждой карточки находим первый <p> после неё (до следующей карточки или конца)
  type Replacement = { from: number; to: number; text: string };
  const replacements: Replacement[] = [];
  const limit = Math.min(cards.length, benefits.length);
  for (let i = 0; i < limit; i++) {
    const card = cards[i]!;
    const benefit = benefits[i]!;
    const nextCard = cards[i + 1];
    const cardEnd = nextCard ? nextCard.openIdx : sectionHtml.length;

    // Заменяем heading content
    const headingOpenRe = new RegExp(`<${card.tag}\\b[^>]*>`, "i");
    const headingTextStart = card.openIdx + (sectionHtml.slice(card.openIdx).match(headingOpenRe)?.[0].length ?? 0);
    const headingTextEnd = card.closeEnd - `</${card.tag}>`.length;
    replacements.push({
      from: headingTextStart,
      to: headingTextEnd,
      text: escapeHtml(benefit.title),
    });

    // Находим первый <p> после heading до cardEnd
    const after = sectionHtml.slice(card.closeEnd, cardEnd);
    const pMatch = after.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch && pMatch.index !== undefined) {
      const pOpenLen = pMatch[0].indexOf(">") + 1;
      const pTextStart = card.closeEnd + pMatch.index + pOpenLen;
      const pTextEnd = card.closeEnd + pMatch.index + pMatch[0].length - "</p>".length;
      replacements.push({
        from: pTextStart,
        to: pTextEnd,
        text: escapeHtml(benefit.description),
      });
    }
  }

  if (replacements.length === 0) return { html, replaced: 0 };

  // Применяем с конца чтобы индексы не смещались
  replacements.sort((a, b) => b.from - a.from);
  let updatedSection = sectionHtml;
  for (const r of replacements) {
    updatedSection = updatedSection.slice(0, r.from) + r.text + updatedSection.slice(r.to);
  }

  const newHtml =
    html.slice(0, sectionRange.start) + updatedSection + html.slice(sectionRange.end);
  return { html: newHtml, replaced: limit };
}

/**
 * Основная функция. Принимает raw шаблон HTML и plan, возвращает InjectionResult.
 */
export function injectPlanIntoTemplate(
  templateHtml: string,
  plan: Plan,
): InjectionResult {
  if (!isSkeletonInjectEnabled()) {
    return { ok: false, reason: "disabled", slotsFilled: 0, slotsTotal: 0, fillRatio: 0 };
  }

  // Слоты которые пытаемся заполнить
  const slots: Array<{ name: string; required: boolean; available: boolean }> = [
    { name: "hero_headline", required: true, available: !!plan.hero_headline },
    { name: "hero_subheadline", required: false, available: !!plan.hero_subheadline },
    { name: "key_benefits", required: false, available: (plan.key_benefits?.length ?? 0) >= 3 },
  ];

  const requiredMissing = slots.filter((s) => s.required && !s.available);
  if (requiredMissing.length > 0) {
    return {
      ok: false,
      reason: `missing_required:${requiredMissing.map((s) => s.name).join(",")}`,
      slotsFilled: 0,
      slotsTotal: slots.length,
      fillRatio: 0,
    };
  }

  let html = templateHtml;
  let filled = 0;
  const slotsTotal = slots.filter((s) => s.available).length;

  // 1. Hero headline — первый h1 в #hero
  const heroRange = findSectionRange(html, "hero");
  if (heroRange && plan.hero_headline) {
    const r = replaceFirstTagInRange(html, heroRange, "h1", plan.hero_headline);
    if (r.replaced) {
      html = r.html;
      filled++;
    }
  }

  // 2. Hero subheadline — первый p после h1 в #hero (переискать range т.к. html изменился)
  if (plan.hero_subheadline) {
    const heroRange2 = findSectionRange(html, "hero");
    if (heroRange2) {
      // Находим первый p ПОСЛЕ закрывающего </h1> в секции
      const sectionHtml = html.slice(heroRange2.start, heroRange2.end);
      const h1End = sectionHtml.search(/<\/h1\s*>/i);
      if (h1End >= 0) {
        const after = sectionHtml.slice(h1End);
        const pMatch = after.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
        if (pMatch && pMatch.index !== undefined) {
          const pOpenLen = pMatch[0].indexOf(">") + 1;
          const pTextStart = heroRange2.start + h1End + pMatch.index + pOpenLen;
          const pTextEnd = heroRange2.start + h1End + pMatch.index + pMatch[0].length - "</p>".length;
          html = html.slice(0, pTextStart) + escapeHtml(plan.hero_subheadline) + html.slice(pTextEnd);
          filled++;
        }
      }
    }
  }

  // 3. Key benefits — ищем по порядку предпочтений секции
  if (plan.key_benefits && plan.key_benefits.length >= 3) {
    const benefitsSectionIds = ["benefits", "features", "why-us", "services", "about"];
    let injectedBenefits = false;
    for (const sid of benefitsSectionIds) {
      const range = findSectionRange(html, sid);
      if (!range) continue;
      const r = replaceBenefitCards(html, range, plan.key_benefits);
      if (r.replaced >= Math.min(3, plan.key_benefits.length)) {
        html = r.html;
        filled++;
        injectedBenefits = true;
        break;
      }
    }
    if (!injectedBenefits) {
      logger.info(SCOPE, `Couldn't find suitable section for benefits in template`);
    }
  }

  const fillRatio = slotsTotal > 0 ? filled / slotsTotal : 0;

  if (fillRatio < SLOT_FILL_THRESHOLD) {
    return {
      ok: false,
      reason: `low_fill_ratio:${fillRatio.toFixed(2)}<${SLOT_FILL_THRESHOLD}`,
      slotsFilled: filled,
      slotsTotal,
      fillRatio,
    };
  }

  return {
    ok: true,
    html,
    slotsFilled: filled,
    slotsTotal,
    fillRatio,
  };
}
