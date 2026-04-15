/**
 * Общие хелперы для htmlOrchestrator pipeline:
 *   - stripCodeFences: чистка HTML от markdown-обёрток + section markers
 *   - readUsage / readFinishReason: безопасное извлечение из streamText результата
 *   - SCOPE / HTML_STOP_SEQUENCES: общие константы
 */

import { repairTruncatedHtml } from "~/lib/utils/htmlRepair";
import { enrichSectionAnchors } from "~/lib/utils/sectionAnchors";

export const SCOPE = "htmlOrchestrator";

export const HTML_STOP_SEQUENCES = ["</html>", "```\n\n", "\n```"];

export function stripCodeFences(text: string): string {
  let working = text;
  if (!/<\/html>/i.test(working) && /<html[\s>]/i.test(working)) {
    working = `${working}\n</html>`;
  }

  const doctypeMatch = working.match(/<!DOCTYPE\s+html[\s\S]*?<\/html>/i);
  let extracted = doctypeMatch?.[0];

  if (!extracted) {
    const htmlMatch = working.match(/<html[\s\S]*?<\/html>/i);
    extracted = htmlMatch?.[0];
  }

  if (!extracted) {
    extracted = working
      .replace(/^```html\s*/im, "")
      .replace(/^```\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
  }

  const cleaned = extracted
    .replace(/\s*<!--\s*═══\s*SECTION:[^>]*-->\s*/g, "\n")
    .replace(/\s*<!--\s*═══\s*END\s+SECTION\s*═══\s*-->\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return enrichSectionAnchors(repairTruncatedHtml(cleaned));
}

export async function readUsage(
  result: { usage: Promise<unknown> | unknown },
): Promise<{ prompt: number; completion: number }> {
  try {
    const raw = (await result.usage) as
      | {
          promptTokens?: number;
          inputTokens?: number;
          completionTokens?: number;
          outputTokens?: number;
        }
      | undefined;
    if (!raw) return { prompt: 0, completion: 0 };
    return {
      prompt: raw.promptTokens ?? raw.inputTokens ?? 0,
      completion: raw.completionTokens ?? raw.outputTokens ?? 0,
    };
  } catch {
    return { prompt: 0, completion: 0 };
  }
}

export async function readFinishReason(
  result: { finishReason: Promise<unknown> | unknown },
): Promise<string> {
  try {
    return String((await result.finishReason) ?? "unknown");
  } catch {
    return "unknown";
  }
}
