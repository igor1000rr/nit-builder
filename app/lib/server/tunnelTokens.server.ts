/**
 * Tunnel token utilities.
 *
 * Token format: 32 bytes random → 64-char hex string, prefixed with "nit_"
 * Example: "nit_a3f8b9c2..."
 *
 * Storage: TWO fields per user:
 * 1. tunnelTokenLookup — deterministic HMAC-SHA256(token, SERVER_SECRET)
 *    Used as a database index for fast lookup via Query.equal
 * 2. tunnelTokenHash — argon2id hash with random salt
 *    Used for final verification after lookup
 *
 * Why both?
 * - argon2 has random salt → same token gives different hashes → can't Query.equal
 * - HMAC alone would be vulnerable if DB is dumped (attacker can brute-force offline)
 * - HMAC lookup + argon2 verify gives O(1) lookup AND strong hash
 *
 * The plaintext token is ONLY shown to the user once (at registration
 * or after regeneration). They must save it themselves.
 */

import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import * as argon2 from "argon2";

const TOKEN_PREFIX = "nit_" as const;
const TOKEN_BYTE_LENGTH = 32;

function getTokenLookupSecret(): string {
  const secret = process.env.NIT_TOKEN_LOOKUP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "NIT_TOKEN_LOOKUP_SECRET env variable must be set to a random string " +
        "of at least 32 characters. Generate one with: openssl rand -hex 32",
    );
  }
  return secret;
}

/**
 * Generate a fresh tunnel token. Uses crypto.randomBytes for CSPRNG output.
 */
export function generateTunnelToken(): string {
  const raw = randomBytes(TOKEN_BYTE_LENGTH).toString("hex");
  return `${TOKEN_PREFIX}${raw}`;
}

/**
 * Deterministic HMAC-SHA256 of the token — used as a DB lookup key.
 * Same token always produces the same lookup value.
 */
export function computeTokenLookup(token: string): string {
  const secret = getTokenLookupSecret();
  return createHmac("sha256", secret).update(token).digest("hex");
}

/**
 * Argon2id hash with random salt — used for final verification.
 * Different every call for the same token, even with same secret.
 */
export async function hashTunnelToken(token: string): Promise<string> {
  return argon2.hash(token, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a plaintext token against a stored argon2id hash.
 * Uses the argon2 library's built-in timing-safe comparison.
 */
export async function verifyTunnelTokenHash(token: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, token);
  } catch {
    return false;
  }
}

/**
 * Timing-safe string comparison helper (for lookup value comparison).
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Quick sanity check — is this string shaped like a NIT tunnel token?
 */
export function isTunnelTokenFormat(token: string): boolean {
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  const hex = token.slice(TOKEN_PREFIX.length);
  return hex.length === TOKEN_BYTE_LENGTH * 2 && /^[0-9a-f]+$/i.test(hex);
}
