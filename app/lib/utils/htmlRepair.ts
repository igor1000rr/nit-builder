/**
 * Auto-repair for truncated HTML from LLM output.
 *
 * Common issues when model hits max_tokens:
 * - Missing </html>, </body>, </section>, </div>
 * - Unclosed attribute quotes
 * - Cut off in the middle of a tag
 *
 * This is a best-effort heuristic — not a full HTML parser.
 * For production-grade repair, use htmlparser2/cheerio, but that's
 * too heavy for this project's minimal dependency philosophy.
 */

export function repairTruncatedHtml(html: string): string {
  if (!html || html.includes("</html>")) return html;

  let fixed = html;

  // If cut mid-tag (e.g. `<div class="foo`), close the tag
  const lastOpenBracket = fixed.lastIndexOf("<");
  const lastCloseBracket = fixed.lastIndexOf(">");
  if (lastOpenBracket > lastCloseBracket) {
    // We're inside an unclosed tag — remove the incomplete tag
    fixed = fixed.slice(0, lastOpenBracket);
  }

  // Count unclosed elements and close them in reverse order
  const openTags: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*\/?>/g;
  const voidElements = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
  ]);

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(fixed)) !== null) {
    const fullTag = match[0]!;
    const tagName = match[1]!.toLowerCase();

    // Skip void elements and self-closing tags
    if (voidElements.has(tagName) || fullTag.endsWith("/>")) continue;

    if (fullTag.startsWith("</")) {
      // Closing tag — pop matching open tag
      const idx = openTags.lastIndexOf(tagName);
      if (idx !== -1) openTags.splice(idx, 1);
    } else {
      // Opening tag
      openTags.push(tagName);
    }
  }

  // Close unclosed tags in reverse order
  if (openTags.length > 0) {
    const closingTags = openTags
      .reverse()
      .map((tag) => `</${tag}>`)
      .join("\n");
    fixed = `${fixed.trimEnd()}\n${closingTags}`;
  }

  // Ensure we have </body> and </html>
  if (!fixed.includes("</body>")) {
    fixed = `${fixed.trimEnd()}\n</body>`;
  }
  if (!fixed.includes("</html>")) {
    fixed = `${fixed.trimEnd()}\n</html>`;
  }

  return fixed;
}
