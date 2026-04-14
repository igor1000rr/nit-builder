/**
 * Компактный дайджест HTML для дачи CSS-патчеру контекста о текущем дизайне.
 *
 * Проблема: CSS-patcher работает без HTML на входе (чтобы сэкономить токены).
 * Но если сайт имеет hero с bg-gradient-to-br или body с bg-slate-900, то без
 * контекста модель пишет body { background: blue } — выглядит правильно,
 * но Tailwind-классы на секциях перебьют это и правка не сработает.
 *
 * Решение: выдёргиваем классы с body и <section data-nit-section="X">, оставляем
 * только визуальные (bg-*, text-*, from-*, to-*, gradient). Даём это модели как
 * контекст (~300-500 chars), модель сама выбирает правильный селектор.
 *
 * Генерация дайджеста — сугубо regex, 0ms и без парсера.
 */

export type SectionDigest = {
  id: string;
  /** Визуальные классы на самой <section> (bg-*, from-*, to-*, text-*) */
  rootClasses: string[];
  /** Есть ли gradient в классах (bg-gradient-*) */
  hasGradient: boolean;
};

export type HtmlDigest = {
  bodyClasses: string[];
  sections: SectionDigest[];
  /** Преобладающий оттенок: dark если body/hero используют slate/gray/zinc-900+ или black */
  theme: "dark" | "light" | "unknown";
};

// Релевантные для CSS-дизайна префиксы Tailwind. Всё остальное (padding, margin,
// flex, grid, responsive breakpoints) отбрасываем — патчеру не нужно.
const VISUAL_CLASS_PREFIXES = [
  "bg-",
  "text-",
  "from-",
  "via-",
  "to-",
  "border-",
  "ring-",
  "shadow-",
];

function filterVisualClasses(classList: string): string[] {
  return classList
    .split(/\s+/)
    .filter((c) => c.length > 0 && !c.startsWith("sm:") && !c.startsWith("md:") && !c.startsWith("lg:") && !c.startsWith("xl:"))
    .filter((c) => VISUAL_CLASS_PREFIXES.some((p) => c.startsWith(p)));
}

function detectTheme(bodyClasses: string[], sections: SectionDigest[]): "dark" | "light" | "unknown" {
  const allClasses = [
    ...bodyClasses,
    ...sections.flatMap((s) => s.rootClasses),
  ];
  if (allClasses.length === 0) return "unknown";

  const DARK_RE = /^bg-(slate|gray|zinc|neutral|stone)-(8\d\d|9\d\d)$|^bg-black$/;
  const LIGHT_RE = /^bg-(white|slate-50|gray-50|zinc-50|neutral-50|stone-50|\w+-(?:50|100|200))$/;

  let dark = 0;
  let light = 0;
  for (const c of allClasses) {
    if (DARK_RE.test(c)) dark++;
    else if (LIGHT_RE.test(c)) light++;
  }

  if (dark >= light * 2 && dark > 0) return "dark";
  if (light >= dark * 2 && light > 0) return "light";
  return "unknown";
}

export function buildHtmlDigest(html: string): HtmlDigest {
  if (!html) return { bodyClasses: [], sections: [], theme: "unknown" };

  // body classes
  const bodyMatch = html.match(/<body\b[^>]*\bclass\s*=\s*["']([^"']*)["']/i);
  const bodyClasses = bodyMatch ? filterVisualClasses(bodyMatch[1] ?? "") : [];

  // sections c data-nit-section
  const sections: SectionDigest[] = [];
  const sectionRe = /<section\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const idMatch = attrs.match(/\bdata-nit-section\s*=\s*["']([^"']+)["']/i);
    if (!idMatch) continue;

    const classMatch = attrs.match(/\bclass\s*=\s*["']([^"']*)["']/i);
    const rootClasses = classMatch ? filterVisualClasses(classMatch[1] ?? "") : [];
    const hasGradient = rootClasses.some((c) => c.includes("gradient"));

    sections.push({
      id: idMatch[1]!,
      rootClasses,
      hasGradient,
    });
  }

  const theme = detectTheme(bodyClasses, sections);
  return { bodyClasses, sections, theme };
}

/**
 * Сериализует дайджест в компактный текст для промпта. ~200-500 chars.
 * Если дайджест пустой — возвращает пустую строку (не добавляем в промпт).
 *
 * @param targetFilter — если передан, включает только эти секции (для scoped-правок)
 */
export function digestToPromptSnippet(
  digest: HtmlDigest,
  targetFilter?: string[],
): string {
  const parts: string[] = [];

  if (digest.bodyClasses.length > 0) {
    parts.push(`body: ${digest.bodyClasses.join(" ")}`);
  }

  const filterSet = targetFilter && targetFilter.length > 0 ? new Set(targetFilter) : null;
  const sectionsToShow = filterSet
    ? digest.sections.filter((s) => filterSet.has(s.id))
    : digest.sections;

  for (const s of sectionsToShow) {
    if (s.rootClasses.length === 0) continue;
    const marker = s.hasGradient ? " [градиент]" : "";
    parts.push(`${s.id}: ${s.rootClasses.join(" ")}${marker}`);
  }

  if (parts.length === 0) return "";

  const themeNote =
    digest.theme === "dark"
      ? " (тёмная тема)"
      : digest.theme === "light"
        ? " (светлая тема)"
        : "";

  return `Текущий дизайн${themeNote}:\n${parts.join("\n")}`;
}
