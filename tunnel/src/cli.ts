#!/usr/bin/env node
/**
 * NIT Tunnel CLI — v0.1.0-alpha (Phase A)
 *
 * Usage:
 *   nit-tunnel --server wss://nit.vibecoding.by/api/tunnel --token YOUR_TOKEN
 *   nit-tunnel --server ws://localhost:3000/api/tunnel --token dev-token --verbose
 *
 * Environment variables:
 *   NIT_SERVER       — WebSocket server URL (default: wss://nit.vibecoding.by/api/tunnel)
 *   NIT_TOKEN        — Tunnel auth token (required)
 *   LMSTUDIO_URL     — LM Studio base URL (default: http://localhost:1234/v1)
 *   NIT_VERBOSE      — Enable debug logging (default: false)
 */

import { runTunnel } from "./tunnelClient.js";

type Flags = {
  server: string;
  token: string;
  lmStudio: string;
  verbose: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    server: process.env.NIT_SERVER ?? "wss://nit.vibecoding.by/api/tunnel",
    token: process.env.NIT_TOKEN ?? "",
    lmStudio: process.env.LMSTUDIO_URL ?? "http://localhost:1234/v1",
    verbose: process.env.NIT_VERBOSE === "true",
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

function printHelp(): void {
  console.log(`
NIT Tunnel — peer-to-peer LLM proxy for NIT Builder

USAGE:
  nit-tunnel [OPTIONS]

OPTIONS:
  -s, --server <url>      WebSocket server URL
                          default: wss://nit.vibecoding.by/api/tunnel
                          env:     NIT_SERVER

  -t, --token <token>     Your tunnel auth token (required)
                          env:     NIT_TOKEN

      --lm-studio <url>   LM Studio OpenAI-compatible endpoint
                          default: http://localhost:1234/v1
                          env:     LMSTUDIO_URL

  -v, --verbose           Enable debug logging
                          env:     NIT_VERBOSE=true

  -h, --help              Show this help message

EXAMPLES:
  # Connect to production with token from env
  NIT_TOKEN=xxx nit-tunnel

  # Connect to local dev server for testing
  nit-tunnel --server ws://localhost:3000/api/tunnel --token dev-token --verbose

  # Use non-standard LM Studio port
  nit-tunnel --token xxx --lm-studio http://localhost:11434/v1

MORE INFO:
  https://github.com/igor1000rr/nit-builder
`);
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  if (!flags.token) {
    console.error("✗ Error: --token is required (or set NIT_TOKEN env variable)");
    console.error("  Run `nit-tunnel --help` for usage info.");
    process.exit(1);
  }

  console.log("┌───────────────────────────────────────────────┐");
  console.log("│  NIT Tunnel v0.1.0-alpha                      │");
  console.log("│  peer-to-peer LLM proxy for NIT Builder       │");
  console.log("└───────────────────────────────────────────────┘");
  console.log(`  Server:    ${flags.server}`);
  console.log(`  LM Studio: ${flags.lmStudio}`);
  console.log(`  Token:     ${flags.token.slice(0, 8)}...${flags.token.slice(-4)}`);
  console.log("");

  try {
    await runTunnel({
      serverUrl: flags.server,
      token: flags.token,
      lmStudioUrl: flags.lmStudio,
      verbose: flags.verbose,
    });
  } catch (err) {
    console.error(`Fatal: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
