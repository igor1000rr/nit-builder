/**
 * HTTP fallback для генерации сайтов (legacy v1 path).
 *
 * Используется когда WebSocket-туннель недоступен:
 *   - Юзер не залогинен
 *   - Залогинен, но его tunnel offline
 *   - Сетевая проблема с /api/control
 *
 * Раньше эта логика была inline'ом в `app/routes/home.tsx` — два почти
 * идентичных блока (createSite + polishSite, ~150 LOC дубля). Вынесено
 * сюда чтобы home.tsx остался про UI/state, а HTTP-флоу про передачу
 * данных и парсинг событий.
 *
 * Через WebSocket события идут через `useControlSocket.onEvent` → handler
 * в home.tsx. Здесь же — через SSE стрим напрямую в callback.
 *
 * API сознательно простой: callback на каждый событие пайплайна
 * + signal для отмены. Сам hook ничего про React не знает — это чистая
 * функция, легко покрыть тестами.
 */

import { parseSseStream } from "~/lib/utils/sseParser";

/** Событие пайплайна, унифицированное для create/polish HTTP-fallback. */
export type HttpPipelineEvent =
  | { type: "session_init"; sessionId: string }
  | { type: "plan_ready" }
  | { type: "template_selected"; templateId: string; templateName: string }
  | { type: "step_start"; roleName: string }
  | { type: "text_delta"; text: string; accumulated: string }
  | { type: "step_complete"; html?: string }
  | { type: "error"; message: string };

export type HttpFallbackParams = {
  mode: "create" | "polish";
  projectId: string;
  prompt: string;
  /** sessionId возвращается сервером в первом событии и должен быть переиспользован для polish. */
  sessionId?: string;
  providerId?: string;
  signal: AbortSignal;
  /** Вызывается на каждое событие. Возврат false — прервать обработку (не используется сейчас, на будущее). */
  onEvent: (event: HttpPipelineEvent) => void;
};

export type HttpFallbackResult = {
  finalHtml: string;
  templateId: string;
  templateName: string;
  /** Был ли новый sessionId назначен сервером — caller должен сохранить для последующих запросов. */
  newSessionId: string | undefined;
};

/**
 * Запустить HTTP-pipeline и стримить события через onEvent.
 *
 * Бросает Error при сетевой ошибке или при `error` событии от сервера.
 * AbortError каллер должен ловить отдельно — это юзер нажал Cancel.
 */
export async function runHttpPipeline(
  params: HttpFallbackParams,
): Promise<HttpFallbackResult> {
  const res = await fetch("/api/pipeline/simple", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: params.mode,
      projectId: params.projectId,
      sessionId: params.sessionId,
      message: params.prompt,
      providerId: params.providerId,
    }),
    signal: params.signal,
  });

  let accumulated = "";
  let templateId = "";
  let templateName = "";
  let newSessionId: string | undefined;

  await parseSseStream(res, (event) => {
    switch (event.type) {
      case "session_init":
        newSessionId = event.sessionId as string;
        params.onEvent({ type: "session_init", sessionId: newSessionId });
        break;

      case "plan_ready":
        params.onEvent({ type: "plan_ready" });
        break;

      case "template_selected":
        templateId = event.templateId as string;
        templateName = event.templateName as string;
        params.onEvent({
          type: "template_selected",
          templateId,
          templateName,
        });
        break;

      case "step_start":
        params.onEvent({
          type: "step_start",
          roleName: (event.roleName as string) ?? "",
        });
        break;

      case "text":
        accumulated += event.text as string;
        params.onEvent({
          type: "text_delta",
          text: event.text as string,
          accumulated,
        });
        break;

      case "step_complete":
        if (event.html) accumulated = event.html as string;
        params.onEvent({ type: "step_complete", html: event.html as string | undefined });
        break;

      case "error": {
        const message = (event.message as string) || "Неизвестная ошибка";
        params.onEvent({ type: "error", message });
        // Серверная ошибка — прерываем pipeline. parseSseStream сам не бросит.
        throw new Error(message);
      }
    }
  });

  return {
    finalHtml: accumulated,
    templateId,
    templateName,
    newSessionId,
  };
}
