/**
 * Защита от prompt injection. Удаляет/экранирует попытки управления моделью
 * через user input: "ignore previous instructions", fake system tags, и т.д.
 */

const INJECTION_PATTERNS = [
  /\bignore\s+(previous|all|above)\s+(instructions|prompts)\b/gi,
  /\bforget\s+(everything|all)\b/gi,
  /\bsystem\s*:\s*/gi,
  /<\|system\|>/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /###\s*(system|instruction)/gi,
];

export function sanitizeUserMessage(input: string): string {
  let cleaned = input.trim();

  // Лимит длины
  if (cleaned.length > 10_000) cleaned = cleaned.slice(0, 10_000);

  // Удаляем паттерны инъекций
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "[filtered]");
  }

  // Нормализуем переводы строк
  cleaned = cleaned.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");

  return cleaned;
}
