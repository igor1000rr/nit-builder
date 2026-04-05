/**
 * Server-only HTML template loader.
 *
 * Имя файла `*.server.ts` гарантирует, что React Router/Vite
 * НЕ включат этот модуль в client bundle. Здесь можно безопасно
 * использовать node:fs, node:path, node:url.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// В dev: app/lib/config/htmlTemplates.server.ts → app/templates/html
// В prod build: тот же относительный путь сохраняется, плюс fallback через process.cwd()
const HTML_DIR_CANDIDATES = [
  path.resolve(__dirname, "../../templates/html"),
  path.resolve(process.cwd(), "app/templates/html"),
];

function resolveHtmlDir(): string {
  for (const candidate of HTML_DIR_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return HTML_DIR_CANDIDATES[0]!;
}

const HTML_DIR = resolveHtmlDir();
const htmlCache = new Map<string, string>();

export function loadTemplateHtml(id: string): string {
  if (htmlCache.has(id)) return htmlCache.get(id)!;

  const file = path.join(HTML_DIR, `${id}.html`);
  if (fs.existsSync(file)) {
    const html = fs.readFileSync(file, "utf-8");
    htmlCache.set(id, html);
    return html;
  }

  // Fallback на blank-landing
  const fallback = path.join(HTML_DIR, "blank-landing.html");
  if (fs.existsSync(fallback)) {
    const html = fs.readFileSync(fallback, "utf-8");
    htmlCache.set(id, html);
    return html;
  }

  // Последний fallback — встроенный минимальный HTML
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Template not found</title></head><body><h1>Шаблон ${id} не найден</h1></body></html>`;
}
