/**
 * Утилиты работы с секциями в HTML, помеченными атрибутом data-nit-section.
 *
 * После enrichSectionAnchors() каждая <section id="X"> имеет
 * data-nit-section="X". Эти утилиты позволяют вычленить конкретную секцию
 * для точечной работы (section-scoped CSS, section-level rewrite).
 */

export type ExtractedSection = {
  /** Значение data-nit-section */
  id: string;
  /** Полный HTML секции включая теги <section> и </section> */
  html: string;
  /** Индекс начала секции в исходном HTML */
  startIdx: number;
  /** Индекс после </section> */
  endIdx: number;
};

/**
 * Извлекает все помеченные секции из HTML.
 * Не поддерживает вложенные <section> внутри других <section>
 * (в наших шаблонах такого нет, все секции плоские на верхнем уровне).
 */
export function extractSections(html: string): ExtractedSection[] {
  if (!html) return [];

  const result: ExtractedSection[] = [];
  // Важно: non-greedy [\s\S]*? и соответствующий </section>
  const regex =
    /<section\b[^>]*\bdata-nit-section\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/section>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    result.push({
      id: match[1]!,
      html: match[0],
      startIdx: match.index,
      endIdx: match.index + match[0].length,
    });
  }
  return result;
}

/**
 * Возвращает список id всех помеченных секций в HTML (в порядке появления).
 */
export function listSectionIds(html: string): string[] {
  return extractSections(html).map((s) => s.id);
}

/**
 * Найти секцию по id. Null если нет.
 */
export function findSection(html: string, id: string): ExtractedSection | null {
  const all = extractSections(html);
  return all.find((s) => s.id === id) ?? null;
}

/**
 * Заменить секцию по id новым HTML. Если секция не найдена — возвращает html без
 * изменений. Новый HTML должен быть полной <section>...</section> строкой.
 */
export function replaceSection(
  html: string,
  id: string,
  newSectionHtml: string,
): string {
  const section = findSection(html, id);
  if (!section) return html;
  return html.slice(0, section.startIdx) + newSectionHtml + html.slice(section.endIdx);
}
