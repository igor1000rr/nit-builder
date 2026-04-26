/**
 * Парсинг CLI аргументов для NIT Tunnel.
 *
 * Вынесен из cli.ts чтобы можно было тестировать без побочных эффектов
 * (cli.ts при загрузке вызывает main() который пытается реально подключиться).
 *
 * Поддерживается каждый flag в двух формах: --long и -short, плюс
 * env-fallback. Default'ы — production VPS (wss://nit.vibecoding.by) и
 * локальный LM Studio.
 */

export type Flags = {
  server: string;
  token: string;
  lmStudio: string;
  verbose: boolean;
  help: boolean;
};

/**
 * Минимальный shape env-переменных используемых здесь. Не используем
 * `NodeJS.ProcessEnv` чтобы тесты могли передать частичный объект без
 * необходимости заполнять все обязательные поля (NODE_ENV и т.п.).
 */
export type EnvVars = Readonly<Record<string, string | undefined>>;

export function parseArgs(argv: string[], env: EnvVars = process.env): Flags {
  const flags: Flags = {
    server: env.NIT_SERVER ?? "wss://nit.vibecoding.by/api/tunnel",
    token: env.NIT_TOKEN ?? "",
    lmStudio: env.LMSTUDIO_URL ?? "http://localhost:1234/v1",
    verbose: env.NIT_VERBOSE === "true",
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--server":
      case "-s":
        flags.server = argv[++i] ?? flags.server;
        break;
      case "--token":
      case "-t":
        flags.token = argv[++i] ?? flags.token;
        break;
      case "--lm-studio":
      case "--lmstudio":
        flags.lmStudio = argv[++i] ?? flags.lmStudio;
        break;
      case "--verbose":
      case "-v":
        flags.verbose = true;
        break;
      case "--help":
      case "-h":
        flags.help = true;
        break;
    }
  }

  return flags;
}
