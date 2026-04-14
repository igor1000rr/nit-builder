/**
 * Прунинг HTML-шаблона по списку нужных секций (из plan.sections).
 *
 * Проблема: loadTemplateHtmlForLlm отдаёт полный шаблон со всеми секциями даже если
 * план запрашивает подмножество. Coder по правилу 4 удалит лишние но всё равно
 * потратит входные токены на их чтение + может случайно скопировать фрагменты.
 *
 * Решение: вырезаем секции не упомянутые в plan.sections дО подачи Coder-у.
 * Маркеры <!-- ═══ SECTION: X ═══ --> ... <!-- ═══ END SECTION ═══ -->
 * добавляет loadTemplateHtmlForLlm на каждый <section id="..."> — их и парсим.
 *
 * Безопасность: если после pruning осталось бы < 2 секций — НЕ prune (шаблон
 * станет калечный). Первая секция (обычно hero) всегда кепится.
 */

const SECTION_BLOCK_RE =
  /<!--\s*═══\s*SECTION:\s*([^═\s]+?)\s*═══\s*-->\s*\n?<section[\s\S]*?<\/section>\s*\n?<!--\s*═══\s*END\s+SECTION\s*═══\s*-->/g;

export type PruneResult = {
  html: string;
  removed: string[];
  kept: string[];
  sectionsFound: number;
};

export function pruneTemplateForPlan(
  annotatedHtml: string,
  wantedSections: string[],
): PruneResult {
  const want = new Set(wantedSections.map((s) => s.toLowerCase().trim()));

  type Section = { id: string; start: number; end: number };
  const sections: Section[] = [];
  const re = new RegExp(SECTION_BLOCK_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(annotatedHtml)) !== null) {
    sections.push({
      id: (m[1] ?? "").toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  if (sections.length === 0) {
    return { html: annotatedHtml, removed: [], kept: [], sectionsFound: 0 };
  }

  const decisions = sections.map((s, i) => ({
    ...s,
    keep: i === 0 || want.has(s.id) || want.size === 0,
  }));

  const keepCount = decisions.filter((d) => d.keep).length;
  if (keepCount < 2 && sections.length >= 2) {
    return {
      html: annotatedHtml,
      removed: [],
      kept: sections.map((s) => s.id),
      sectionsFound: sections.length,
    };
  }

  let result = annotatedHtml;
  const removed: string[] = [];
  const kept: string[] = [];
  for (let i = decisions.length - 1; i >= 0; i--) {
    const d = decisions[i]!;
    if (d.keep) {
      kept.unshift(d.id);
    } else {
      result = result.slice(0, d.start) + result.slice(d.end);
      removed.unshift(d.id);
    }
  }

  return {
    html: result.replace(/\n{3,}/g, "\n\n"),
    removed,
    kept,
    sectionsFound: sections.length,
  };
}
