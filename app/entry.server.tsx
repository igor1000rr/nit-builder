import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import type { EntryContext } from "react-router";

const ABORT_DELAY = 5_000;

/**
 * Security headers добавляются ко всем HTTP ответам.
 * Защита от XSS, clickjacking, MIME sniffing, и прочего.
 */
function applySecurityHeaders(headers: Headers): void {
  // Запретить встраивание сайта в iframe сторонними доменами (clickjacking)
  headers.set("X-Frame-Options", "SAMEORIGIN");

  // Браузер не должен догадываться о MIME-типе
  headers.set("X-Content-Type-Options", "nosniff");

  // Referer политика — не утекает при переходах на http
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // HSTS — принудительный HTTPS (год). Только в production.
  if (process.env.NODE_ENV === "production") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  // Permissions Policy — запрещаем ненужные API
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );

  // Content Security Policy.
  //
  // 'unsafe-eval' УБРАН — в parent документе он не нужен. Tailwind v4 у нас
  // через Vite plugin (build-time, без runtime eval), Alpine.js используется
  // только внутри iframe preview сгенерированных сайтов (sandbox изолирован
  // от parent CSP). Раньше eval разрешался "на всякий случай" — атакующий
  // через XSS получал полный JS execution. Теперь нет.
  //
  // 'unsafe-inline' для script ОСТАЁТСЯ временно — React Router 7 SSR
  // serializes hydration data в inline <script>__remixContext={...}</script>
  // без nonce-механизма. Переход на strict-dynamic с per-request nonce
  // требует patch в @react-router/dev (issue открыт upstream). До тех пор
  // 'unsafe-inline' для script — известный риск, но защита X-Frame-Options +
  // SameSite cookies + CSRF делает XSS-эксплуатацию ограниченной.
  //
  // 'unsafe-inline' для style остаётся — Tailwind v4 + React style={{...}}
  // props генерируют inline styles. Это меньшая угроза (style injection
  // сложно превратить в RCE).
  //
  // connect-src добавляет ws://localhost:* для dev (HMR + WS tunnel).
  // В production только same-origin wss://.
  const isDev = process.env.NODE_ENV !== "production";
  const wsConnectSrc = isDev
    ? "ws: wss: http://localhost:* ws://localhost:*"
    : "wss:";

  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // 'unsafe-eval' исключён намеренно — см. блок-комментарий выше.
      "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https:",
      `connect-src 'self' ${wsConnectSrc}`,
      // frame-src 'self' blob: — для preview iframe (srcDoc генерирует blob)
      "frame-src 'self' blob:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  );
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");
    const callbackName =
      userAgent && isbot(userAgent) ? "onAllReady" : "onShellReady";

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [callbackName]: () => {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          applySecurityHeaders(responseHeaders);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
