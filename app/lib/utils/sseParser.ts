/**
 * SSE stream parser. Правильно обрабатывает:
 * - Разбиение событий по двойному \n\n
 * - Split events (событие разорвано между двумя chunks)
 * - Keep-alive ping-строки (`:ping`)
 * - [DONE] маркер
 * - Ошибки парсинга JSON (игнорируем только эти, не другие)
 */

export type SseHandler = (event: Record<string, unknown>) => void;

export async function parseSseStream(
  response: Response,
  onEvent: SseHandler,
): Promise<void> {
  if (!response.body) throw new Error("Нет ответа от сервера");
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // финальный flush
        if (buffer.trim()) processBlock(buffer, onEvent);
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // SSE события разделены `\n\n`
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        processBlock(block, onEvent);
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

function processBlock(block: string, onEvent: SseHandler): void {
  // Один блок может содержать несколько data: строк (по спеке SSE),
  // но мы всегда шлём одно data: на блок, поэтому просто ищем первое.
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue; // keep-alive ping
    if (!line.startsWith("data: ")) continue;

    const data = line.slice(6).trim();
    if (!data) continue;
    if (data === "[DONE]") continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Битый JSON — пропускаем конкретное событие, но стрим не рвём
      continue;
    }

    // Критично: пропускаем только parse errors, а ошибки из handler —
    // прокидываем наверх (например, throw при event.type === 'error')
    onEvent(parsed);
  }
}
