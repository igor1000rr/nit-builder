/**
 * Обогащает HTML data-атрибутами data-nit-section="<id>" на каждый
 * тег <section id="...">. Это готовит почву для будущих фич:
 *
 * - section-level CSS-patch ("сделай только героя синим")
 * - точечная регенерация одной секции вместо всего HTML
 * - telemetry: какую секцию юзер выделил/правил в каком шаблоне
 *
 * Атрибут невидимый и не ломает стили. Idempotent: если атрибут уже есть —
 * не дублируется. Работает только с тегами <section> (не трогает div/article).
 */

export function enrichSectionAnchors(html: string): string {
  if (!html || !/<section\b/i.test(html)) return html;

  return html.replace(
    /<section\b([^>]*)>/gi,
    (match, attrs: string) => {
      // Уже есть data-nit-section — оставляем как есть (idempotent)
      if (/\bdata-nit-section\s*=/i.test(attrs)) return match;

      // Извлекаем id="X" или id='X'
      const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
      if (!idMatch) return match;
      const id = idMatch[1];
      return `<section${attrs} data-nit-section="${id}">`;
    },
  );
}
