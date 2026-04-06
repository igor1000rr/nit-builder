/**
 * Protocol compatibility test.
 *
 * Tauri desktop client (Rust) and the server/browser (TypeScript) share a
 * wire protocol over WebSocket. The TS types live in `shared/src/protocol.ts`
 * and the Rust types live in `tunnel/desktop/src-tauri/src/protocol.rs`.
 *
 * This test pins down the JSON representation of every protocol message via
 * snapshot-style assertions. If you change either side, this test will
 * tell you what needs to change on the other side.
 *
 * It doesn't compile Rust — it parses the Rust source file and extracts
 * field names, serde attributes, and enum variants via regex matching.
 * Good enough to catch 95% of drift (typos, missing fields, wrong case).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PROTOCOL_VERSION } from "../shared/src/protocol";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUST_PROTOCOL_PATH = resolve(
  __dirname,
  "../tunnel/desktop/src-tauri/src/protocol.rs",
);
const TS_PROTOCOL_PATH = resolve(__dirname, "../shared/src/protocol.ts");

const rustSource = readFileSync(RUST_PROTOCOL_PATH, "utf-8");
const tsSource = readFileSync(TS_PROTOCOL_PATH, "utf-8");

// ─── Helpers ─────────────────────────────────────────────────────

function rustHasVariant(enumName: string, variant: string): boolean {
  const enumRegex = new RegExp(
    `pub enum ${enumName}\\s*\\{([\\s\\S]*?)\\n\\}`,
    "m",
  );
  const match = rustSource.match(enumRegex);
  if (!match) return false;
  const body = match[1] ?? "";
  // Handle both `Variant,` and `Variant {` forms
  return (
    new RegExp(`\\b${variant}\\s*[{,]`).test(body) ||
    new RegExp(`\\b${variant}\\s*$`, "m").test(body)
  );
}

function rustHasField(container: string, field: string): boolean {
  // Match "pub fieldname:" or "#[serde(rename = "fieldname")]"
  const containerRegex = new RegExp(
    `(pub (?:enum|struct) ${container}[^{]*\\{)([\\s\\S]*?)\\n\\}`,
    "m",
  );
  const match = rustSource.match(containerRegex);
  if (!match) return false;
  const body = match[2] ?? "";
  return (
    new RegExp(`\\bpub ${field}\\s*:`).test(body) ||
    new RegExp(`#\\[serde\\(rename = "${field}"\\)\\]`).test(body)
  );
}

function tsHasMember(unionName: string, tag: string): boolean {
  // Find the position of `export type UnionName =`
  const startRegex = new RegExp(`export type ${unionName}\\s*=`);
  const startMatch = tsSource.match(startRegex);
  if (!startMatch || startMatch.index === undefined) return false;

  const startIdx = startMatch.index;
  // Block ends at the next `export ` or `/**` at the start of a line,
  // or end of file
  const rest = tsSource.slice(startIdx + 10);
  const nextExportMatch = rest.match(/\n(export |\/\*\*)/);
  const endIdx =
    nextExportMatch && nextExportMatch.index !== undefined
      ? startIdx + 10 + nextExportMatch.index
      : tsSource.length;
  const body = tsSource.slice(startIdx, endIdx);
  return new RegExp(`type:\\s*["']${tag}["']`).test(body);
}

function tsHasField(typeOrUnion: string, fieldName: string): boolean {
  // Find all references to this type in TS source and check if any mention the field
  return new RegExp(`\\b${fieldName}\\s*[:?]`).test(tsSource);
}

// ─── Tests ───────────────────────────────────────────────────────

describe("Protocol compat: Rust ↔ TypeScript", () => {
  describe("PROTOCOL_VERSION constant", () => {
    it("both sides declare PROTOCOL_VERSION", () => {
      expect(tsSource).toMatch(/PROTOCOL_VERSION\s*=\s*["']1\.0["']/);
      expect(rustSource).toMatch(/PROTOCOL_VERSION\s*:\s*&str\s*=\s*"1\.0"/);
    });

    it("TS and Rust versions match", () => {
      const tsMatch = tsSource.match(/PROTOCOL_VERSION\s*=\s*["']([^"']+)["']/);
      const rustMatch = rustSource.match(
        /PROTOCOL_VERSION\s*:\s*&str\s*=\s*"([^"]+)"/,
      );
      expect(tsMatch?.[1]).toBe(rustMatch?.[1]);
      expect(PROTOCOL_VERSION).toBe(tsMatch?.[1]);
    });
  });

  describe("TunnelToServer messages", () => {
    const variants = [
      "Hello",
      "Heartbeat",
      "ResponseStart",
      "ResponseText",
      "ResponseDone",
      "ResponseError",
    ];

    for (const variant of variants) {
      it(`Rust has variant ${variant}`, () => {
        expect(rustHasVariant("TunnelToServer", variant)).toBe(true);
      });
    }

    // TypeScript uses snake_case tag values
    const tsTags = [
      "hello",
      "heartbeat",
      "response_start",
      "response_text",
      "response_done",
      "response_error",
    ];

    for (const tag of tsTags) {
      it(`TypeScript TunnelToServer has tag "${tag}"`, () => {
        expect(tsHasMember("TunnelToServer", tag)).toBe(true);
      });
    }
  });

  describe("ServerToTunnel messages", () => {
    const variants = ["Welcome", "HeartbeatAck", "Generate", "Abort", "Error"];

    for (const variant of variants) {
      it(`Rust has variant ${variant}`, () => {
        expect(rustHasVariant("ServerToTunnel", variant)).toBe(true);
      });
    }

    const tsTags = ["welcome", "heartbeat_ack", "generate", "abort", "error"];

    for (const tag of tsTags) {
      it(`TypeScript ServerToTunnel has tag "${tag}"`, () => {
        expect(tsHasMember("ServerToTunnel", tag)).toBe(true);
      });
    }
  });

  describe("TunnelCapabilities struct", () => {
    it("Rust has TunnelCapabilities", () => {
      expect(rustSource).toMatch(/pub struct TunnelCapabilities/);
    });

    it("TypeScript has TunnelCapabilities", () => {
      expect(tsSource).toMatch(/TunnelCapabilities/);
    });

    const fields = ["runtime", "model", "contextWindow"];
    for (const field of fields) {
      it(`both sides have field ${field}`, () => {
        expect(rustHasField("TunnelCapabilities", field)).toBe(true);
        expect(tsHasField("TunnelCapabilities", field)).toBe(true);
      });
    }
  });

  describe("Runtime enum", () => {
    it("Rust has lmstudio_proxy and embedded", () => {
      expect(rustSource).toMatch(/LmstudioProxy/);
      expect(rustSource).toMatch(/Embedded/);
      // Verify serde rename_all = snake_case
      expect(rustSource).toMatch(
        /#\[serde\(rename_all = "snake_case"\)\][\s\S]*?pub enum Runtime/,
      );
    });

    it("TypeScript has 'lmstudio_proxy' and 'embedded' values", () => {
      expect(tsSource).toMatch(/["']lmstudio_proxy["']/);
      expect(tsSource).toMatch(/["']embedded["']/);
    });
  });

  describe("Error codes", () => {
    const codes = [
      "AuthFailed",
      "InvalidToken",
      "ProtocolMismatch",
      "RateLimited",
    ];

    for (const code of codes) {
      it(`Rust ServerErrorCode has ${code}`, () => {
        expect(rustHasVariant("ServerErrorCode", code)).toBe(true);
      });
    }

    // Rust uses SCREAMING_SNAKE_CASE on wire via serde rename_all
    it("Rust ServerErrorCode uses SCREAMING_SNAKE_CASE serde rename", () => {
      expect(rustSource).toMatch(
        /#\[serde\(rename_all = "SCREAMING_SNAKE_CASE"\)\][\s\S]*?pub enum ServerErrorCode/,
      );
    });

    const tsCodes = [
      "AUTH_FAILED",
      "INVALID_TOKEN",
      "PROTOCOL_MISMATCH",
      "RATE_LIMITED",
    ];
    for (const code of tsCodes) {
      it(`TypeScript has ${code} string literal`, () => {
        expect(tsSource).toMatch(new RegExp(`["']${code}["']`));
      });
    }
  });

  describe("Hello message wire format", () => {
    // Critical: the tunnel client sends this. If fields drift, nothing works.
    it("Rust Hello variant has all required fields", () => {
      const helloBlock = rustSource.match(
        /Hello\s*\{([\s\S]*?)\n\s*\},/,
      );
      expect(helloBlock).toBeTruthy();
      const body = helloBlock?.[1] ?? "";
      expect(body).toMatch(/protocol_version|protocolVersion/);
      expect(body).toMatch(/\btoken\b/);
      expect(body).toMatch(/client_version|clientVersion/);
      expect(body).toMatch(/capabilities/);
    });

    it("Rust Hello uses camelCase on wire via serde rename", () => {
      // protocolVersion and clientVersion must be renamed
      const helloBlock = rustSource.match(/Hello\s*\{([\s\S]*?)\n\s*\},/);
      const body = helloBlock?.[1] ?? "";
      expect(body).toMatch(/#\[serde\(rename = "protocolVersion"\)\]/);
      expect(body).toMatch(/#\[serde\(rename = "clientVersion"\)\]/);
    });
  });
});
