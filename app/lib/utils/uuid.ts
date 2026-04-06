/**
 * UUID v4 generator with fallback for non-secure contexts.
 *
 * Background: window.crypto.randomUUID() is only available on secure
 * contexts (HTTPS or localhost). On plain HTTP (e.g. dev deploy via IP),
 * calling it throws TypeError. This helper detects availability and
 * falls back to a Math.random-based UUID generator.
 *
 * Math.random fallback is NOT cryptographically secure — it's only used
 * for client-side request IDs and projectIds which don't need
 * cryptographic quality. For server-side token generation use the
 * Node.js crypto module directly.
 */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through to Math.random fallback
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
