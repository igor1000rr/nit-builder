import { describe, it, expect } from "vitest";
import { parseArgs } from "../tunnel/src/cliArgs";

/**
 * Тесты для CLI args parsing of tunnel client.
 * Проверяют все формы flag'ов (--long, -short), env-fallback, дефолты,
 * ordering, edge-cases.
 */

const EMPTY_ENV: Readonly<Record<string, string | undefined>> = {};

describe("parseArgs", () => {
  it("дефолты при пустых argv + пустом env", () => {
    const flags = parseArgs([], EMPTY_ENV);
    expect(flags).toEqual({
      server: "wss://nit.vibecoding.by/api/tunnel",
      token: "",
      lmStudio: "http://localhost:1234/v1",
      verbose: false,
      help: false,
    });
  });

  it("env переопределяет дефолты", () => {
    const env = {
      NIT_SERVER: "ws://localhost:3030/api/tunnel",
      NIT_TOKEN: "nit_envtoken",
      LMSTUDIO_URL: "http://192.168.1.10:1234/v1",
      NIT_VERBOSE: "true",
    };
    const flags = parseArgs([], env);
    expect(flags.server).toBe("ws://localhost:3030/api/tunnel");
    expect(flags.token).toBe("nit_envtoken");
    expect(flags.lmStudio).toBe("http://192.168.1.10:1234/v1");
    expect(flags.verbose).toBe(true);
  });

  it("NIT_VERBOSE='1' НЕ триггерит verbose (только 'true' строго)", () => {
    expect(parseArgs([], { NIT_VERBOSE: "1" }).verbose).toBe(false);
    expect(parseArgs([], { NIT_VERBOSE: "yes" }).verbose).toBe(false);
    expect(parseArgs([], { NIT_VERBOSE: "true" }).verbose).toBe(true);
  });

  it("--server и -s одинаковы", () => {
    expect(parseArgs(["--server", "ws://x"], EMPTY_ENV).server).toBe("ws://x");
    expect(parseArgs(["-s", "ws://y"], EMPTY_ENV).server).toBe("ws://y");
  });

  it("--token и -t одинаковы", () => {
    expect(parseArgs(["--token", "nit_a"], EMPTY_ENV).token).toBe("nit_a");
    expect(parseArgs(["-t", "nit_b"], EMPTY_ENV).token).toBe("nit_b");
  });

  it("--lm-studio и --lmstudio одинаковы", () => {
    expect(parseArgs(["--lm-studio", "http://x"], EMPTY_ENV).lmStudio).toBe("http://x");
    expect(parseArgs(["--lmstudio", "http://y"], EMPTY_ENV).lmStudio).toBe("http://y");
  });

  it("--verbose и -v не требуют значения", () => {
    expect(parseArgs(["--verbose"], EMPTY_ENV).verbose).toBe(true);
    expect(parseArgs(["-v"], EMPTY_ENV).verbose).toBe(true);
  });

  it("--help и -h", () => {
    expect(parseArgs(["--help"], EMPTY_ENV).help).toBe(true);
    expect(parseArgs(["-h"], EMPTY_ENV).help).toBe(true);
  });

  it("CLI args перекрывают env (--token переопределяет NIT_TOKEN)", () => {
    const flags = parseArgs(
      ["--token", "from-cli"],
      { NIT_TOKEN: "from-env" },
    );
    expect(flags.token).toBe("from-cli");
  });

  it("несколько flag'ов в одном вызове", () => {
    const flags = parseArgs(
      [
        "--server", "ws://srv/api/tunnel",
        "--token", "nit_xyz",
        "--lm-studio", "http://lm:8080/v1",
        "--verbose",
      ],
      EMPTY_ENV,
    );
    expect(flags).toEqual({
      server: "ws://srv/api/tunnel",
      token: "nit_xyz",
      lmStudio: "http://lm:8080/v1",
      verbose: true,
      help: false,
    });
  });

  it("неизвестные флаги игнорируются (не валят)", () => {
    const flags = parseArgs(
      ["--unknown", "value", "--token", "x"],
      EMPTY_ENV,
    );
    expect(flags.token).toBe("x");
  });

  it("--token без значения — flags.token остаётся дефолт (env или '')", () => {
    // argv[++i] === undefined → fallback на flags.token (изначально "")
    expect(parseArgs(["--token"], EMPTY_ENV).token).toBe("");
    // С env-default
    expect(parseArgs(["--token"], { NIT_TOKEN: "env-default" }).token).toBe("env-default");
  });
});
