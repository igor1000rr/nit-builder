/**
 * Централизованная версия для сервера и CLI. Раньше хардкод был в двух
 * местах (server.ts, wsHandlers.server.ts) и расходился с package.json —
 * теперь одна точка правды.
 *
 * При bump'е version в корневом package.json нужно вручную обновить эту
 * константу. Автоматический sync через импорт package.json в ESM модуле
 * требует assertion syntax и ломает тесты — лучше явно.
 */

export const NIT_SERVER_VERSION = "2.0.0-beta.1" as const;
export const NIT_TUNNEL_CLIENT_VERSION = "0.1.0-alpha" as const;
