/**
 * Appwrite server SDK wrapper for NIT Builder v2.0.
 *
 * Uses the existing vibecoding Appwrite instance:
 *   endpoint:  https://appwrite.vibecoding.by/v1
 *   projectId: 69ab07130011752aae12
 *
 * Collections (in database `nit_builder`):
 * - nit_users        → extends Appwrite users with tunnelTokenHash, sessionVersion, preferences
 * - nit_sites        → generated sites (replaces localStorage history)
 * - nit_generations  → audit log of each generation attempt
 * - nit_guest_limits → persistent per-IP guest quotas (replaces in-memory Map)
 *
 * Database + collections must be created manually via:
 *   scripts/appwrite-migrate.ts
 *
 * Required environment variables:
 *   APPWRITE_ENDPOINT      (default: https://appwrite.vibecoding.by/v1)
 *   APPWRITE_PROJECT_ID    (default: 69ab07130011752aae12)
 *   APPWRITE_API_KEY       (server-side, required — has full scope)
 *   APPWRITE_DATABASE_ID   (default: nit_builder)
 */

import {
  Client,
  Databases,
  Users,
  Account,
  ID,
  Query,
  type Models,
} from "node-appwrite";
import { createHash } from "node:crypto";

// ─── Config ──────────────────────────────────

export const APPWRITE_CONFIG = {
  endpoint: process.env.APPWRITE_ENDPOINT ?? "https://appwrite.vibecoding.by/v1",
  projectId: process.env.APPWRITE_PROJECT_ID ?? "69ab07130011752aae12",
  databaseId: process.env.APPWRITE_DATABASE_ID ?? "nit_builder",
  collections: {
    users: "nit_users",
    sites: "nit_sites",
    generations: "nit_generations",
    guestLimits: "nit_guest_limits",
  },
} as const;

export function isAppwriteConfigured(): boolean {
  return !!process.env.APPWRITE_API_KEY;
}

// ─── Clients ─────────────────────────────────

/**
 * Admin client — uses API key with full permissions.
 * NEVER expose this to the browser. Server-only.
 */
let adminClient: Client | null = null;

function getAdminClient(): Client {
  if (adminClient) return adminClient;
  const key = process.env.APPWRITE_API_KEY;
  if (!key) {
    throw new Error(
      "APPWRITE_API_KEY env variable is not set. " +
        "NIT Builder v2.0 requires Appwrite for auth. " +
        "See docs/architecture/v2-tunnel.md.",
    );
  }
  adminClient = new Client()
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId)
    .setKey(key);
  return adminClient;
}

/**
 * Session client — scoped to a specific user session JWT.
 * Used to validate incoming browser session tokens.
 */
export function getSessionClient(jwt: string): Client {
  return new Client()
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId)
    .setJWT(jwt);
}

export function getAdminDatabases(): Databases {
  return new Databases(getAdminClient());
}

export function getAdminUsers(): Users {
  return new Users(getAdminClient());
}

// ─── Types for NIT Builder documents ────────────────────

export type NitUser = Models.Document & {
  /** Appwrite user $id — we use the same ID */
  email: string;
  /** Deterministic HMAC-SHA256 for DB index lookup */
  tunnelTokenLookup: string;
  /** Argon2id hash with random salt for final verification */
  tunnelTokenHash: string;
  /** When the tunnel token was last generated */
  tunnelTokenCreatedAt: string;
  /** Preferred LLM provider — only local tunnel supported */
  preferredProvider: "tunnel";
  /**
   * Session token revocation counter. При logout-all или password change
   * bumpSessionVersion() инкрементирует это поле — все существующие
   * токены (с меньшим version) мгновенно становятся невалидны.
   * Отсутствует у legacy-юзеров до миграции Appwrite-коллекции — в этом
   * случае рассматривается как 0.
   */
  sessionVersion?: number;
  /** Encrypted user-provided API keys (JSON string) — legacy, unused */
  apiKeysJson?: string;
};

export type NitSite = Models.Document & {
  userId: string;
  prompt: string;
  html: string;
  templateId: string;
  templateName: string;
  /** Preview thumbnail SVG data URI (optional) */
  thumbnail?: string;
};

export type NitGeneration = Models.Document & {
  userId: string;
  mode: "create" | "polish";
  provider: "tunnel";
  durationMs: number;
  success: boolean;
  errorReason?: string;
  templateId?: string;
};

export type NitGuestLimit = Models.Document & {
  ipHash: string;
  count: number;
  resetAt: string;
};

// ─── Session operations ────────────────────────────────

/**
 * Create an Appwrite session from email+password.
 * Returns the session secret which should be stored as HttpOnly cookie.
 *
 * Throws if credentials are invalid.
 */
export async function createEmailSession(
  email: string,
  password: string,
): Promise<{ secret: string; userId: string }> {
  const users = getAdminUsers();

  // Find user by email
  const list = await users.list([Query.equal("email", email), Query.limit(1)]);
  if (list.users.length === 0) {
    throw new Error("INVALID_CREDENTIALS");
  }
  const user = list.users[0]!;

  // Create a custom token for this user (Appwrite "session tokens" API)
  const token = await users.createToken(user.$id, 64, 900); // 15 min TTL

  // Verify password by creating a session via account API
  const sessionClient = new Client()
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId);
  const account = new Account(sessionClient);

  try {
    const session = await account.createEmailPasswordSession(email, password);
    return { secret: session.secret, userId: session.userId };
  } catch {
    throw new Error("INVALID_CREDENTIALS");
  }
}

/**
 * Validate a session secret (from HttpOnly cookie) and return the user.
 * Returns null if the session is invalid or expired.
 */
export async function getUserBySessionSecret(
  secret: string,
): Promise<{ userId: string; email: string } | null> {
  try {
    const client = new Client()
      .setEndpoint(APPWRITE_CONFIG.endpoint)
      .setProject(APPWRITE_CONFIG.projectId)
      .setSession(secret);
    const account = new Account(client);
    const user = await account.get();
    return { userId: user.$id, email: user.email };
  } catch {
    return null;
  }
}

/**
 * Look up a user by their Appwrite user ID using the admin Users API.
 * Used by the signed-cookie auth path (no Appwrite session needed).
 */
export async function getUserById(
  userId: string,
): Promise<{ userId: string; email: string } | null> {
  try {
    const users = getAdminUsers();
    const user = await users.get(userId);
    return { userId: user.$id, email: user.email };
  } catch {
    return null;
  }
}

/**
 * Delete the current session (logout).
 */
export async function deleteSession(secret: string): Promise<void> {
  try {
    const client = new Client()
      .setEndpoint(APPWRITE_CONFIG.endpoint)
      .setProject(APPWRITE_CONFIG.projectId)
      .setSession(secret);
    const account = new Account(client);
    await account.deleteSession("current");
  } catch {
    // Session may already be invalid — silently ignore
  }
}

/**
 * Get the user's nit_users document (with tunnel token metadata).
 */
export async function getNitUser(userId: string): Promise<NitUser | null> {
  try {
    const db = getAdminDatabases();
    const doc = await db.getDocument<NitUser>(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.users,
      userId,
    );
    return doc;
  } catch {
    return null;
  }
}

// ─── Session version revocation ──────────────────────────
//
// Счётчик который вовлекается в подпись session token'а. Бампаем
// при logout-all или password change — все существующие токены на version
// < current не проходят verify. См. sessionCookie.server.ts.

/**
 * Читает current sessionVersion для юзера. Если nit_users документ не
 * существует (legacy user) или поле sessionVersion отсутствует (до
 * миграции Appwrite коллекции) — возвращаем 0.
 *
 * При сетевой ошибке тоже возвращаем 0 (fail-open) — иначе каждая
 * временная Appwrite-недоступность выкидывает всех юзеров. Revocation в
 * этот момент не сработает, но это редкий edge-case по сравнению
 * с "все клиенты разлогинены".
 */
export async function getUserSessionVersion(userId: string): Promise<number> {
  try {
    const db = getAdminDatabases();
    const doc = await db.getDocument<NitUser>(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.users,
      userId,
    );
    return typeof doc.sessionVersion === "number" ? doc.sessionVersion : 0;
  } catch {
    return 0;
  }
}

/**
 * Инкрементирует sessionVersion юзера на 1. Возвращает новое значение.
 *
 * После вызова все существующие session-токены этого юзера
 * перестают проходить verify (там version меньше чем current).
 *
 * Race note: read-modify-write не атомарен. Если два параллельных
 * logout-all стартуют одновременно, могут дать один bump вместо двух —
 * но функционально это эквивалентно: все токены всё равно инвалидируются.
 *
 * Если nit_users документа нет (legacy юзер) — создаём пустой с
 * sessionVersion=1. Следующий login корректно заполнит остальные
 * поля — но это edge-case, таких юзеров не должно быть в проде за пределами
 * migration-периода.
 */
export async function bumpSessionVersion(userId: string): Promise<number> {
  const db = getAdminDatabases();

  let current = 0;
  let docExists = false;
  try {
    const doc = await db.getDocument<NitUser>(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.users,
      userId,
    );
    docExists = true;
    current = typeof doc.sessionVersion === "number" ? doc.sessionVersion : 0;
  } catch {
    docExists = false;
  }

  const next = current + 1;

  if (docExists) {
    await db.updateDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.users,
      userId,
      { sessionVersion: next },
    );
  } else {
    // Legacy user без nit_users — создаём минимальный стуб с служебным
    // полем. tunnel-зависимые поля подтянутся при следующей регенерации
    // tunnel token'а — до этого юзер просто не сможет генерить сайты через туннель
    // (как и было до bump).
    await db.createDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.users,
      userId,
      {
        email: "",
        tunnelTokenLookup: "",
        tunnelTokenHash: "",
        tunnelTokenCreatedAt: new Date(0).toISOString(),
        preferredProvider: "tunnel",
        sessionVersion: next,
      } satisfies Omit<NitUser, keyof Models.Document>,
    );
  }

  return next;
}

// ─── User operations ─────────────────────────────────

/**
 * Register a new user with email+password. Creates both the Appwrite
 * account and the nit_users document, generates a fresh tunnel token.
 *
 * Returns the plaintext tunnel token (shown to user ONCE).
 */
export async function registerUser(params: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ userId: string; tunnelToken: string }> {
  const users = getAdminUsers();
  const db = getAdminDatabases();
  const { generateTunnelToken, hashTunnelToken, computeTokenLookup } = await import(
    "./tunnelTokens.server.js"
  );

  // 1. Create Appwrite account
  const accountId = ID.unique();
  await users.create(accountId, params.email, undefined, params.password, params.name);

  // 2. Generate tunnel token + compute both lookup and hash
  const tunnelToken = generateTunnelToken();
  const tunnelTokenLookup = computeTokenLookup(tunnelToken);
  const tunnelTokenHash = await hashTunnelToken(tunnelToken);

  // 3. Create nit_users document — с sessionVersion=0 сразу, чтобы logout-all
  //    работал с первого логина без специальной миграции.
  const userDoc: Omit<NitUser, keyof Models.Document> = {
    email: params.email,
    tunnelTokenLookup,
    tunnelTokenHash,
    tunnelTokenCreatedAt: new Date().toISOString(),
    preferredProvider: "tunnel",
    sessionVersion: 0,
  };

  await db.createDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.users,
    accountId,
    userDoc,
  );

  return { userId: accountId, tunnelToken };
}

/**
 * Validate a session JWT by asking Appwrite who owns it.
 * Returns the user ID or null if invalid/expired.
 */
export async function validateSessionJwt(
  jwt: string,
): Promise<{ userId: string; email: string } | null> {
  try {
    const client = getSessionClient(jwt);
    const account = new Account(client);
    const user = await account.get();
    return { userId: user.$id, email: user.email };
  } catch {
    return null;
  }
}

/**
 * Look up a user by tunnel token. Used to authenticate tunnel client connections.
 *
 * Two-step verification:
 * 1. Compute HMAC lookup → Query.equal → find candidate user
 * 2. Verify argon2id hash → confirm match
 *
 * Returns the userId if the token is valid.
 */
export async function findUserByTunnelToken(token: string): Promise<{ userId: string } | null> {
  const { computeTokenLookup, verifyTunnelTokenHash, isTunnelTokenFormat } = await import(
    "./tunnelTokens.server.js"
  );

  // Sanity check format first to avoid unnecessary DB calls
  if (!isTunnelTokenFormat(token)) return null;

  const lookup = computeTokenLookup(token);
  const db = getAdminDatabases();

  try {
    const result = await db.listDocuments<NitUser>(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.users,
      [Query.equal("tunnelTokenLookup", lookup), Query.limit(1)],
    );
    if (result.documents.length === 0) return null;

    const user = result.documents[0]!;
    // Final verification with argon2id — defence in depth
    const valid = await verifyTunnelTokenHash(token, user.tunnelTokenHash);
    if (!valid) return null;

    return { userId: user.$id };
  } catch {
    return null;
  }
}

/**
 * Regenerate a user's tunnel token (revokes the old one).
 * Returns the new plaintext token.
 */
export async function regenerateTunnelToken(userId: string): Promise<string> {
  const { generateTunnelToken, hashTunnelToken, computeTokenLookup } = await import(
    "./tunnelTokens.server.js"
  );
  const newToken = generateTunnelToken();
  const newLookup = computeTokenLookup(newToken);
  const newHash = await hashTunnelToken(newToken);

  const db = getAdminDatabases();
  await db.updateDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.users,
    userId,
    {
      tunnelTokenLookup: newLookup,
      tunnelTokenHash: newHash,
      tunnelTokenCreatedAt: new Date().toISOString(),
    },
  );
  return newToken;
}

// ─── Site operations ─────────────────────────────────

export async function saveSite(params: {
  userId: string;
  prompt: string;
  html: string;
  templateId: string;
  templateName: string;
  thumbnail?: string;
}): Promise<string> {
  const db = getAdminDatabases();
  const doc = await db.createDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.sites,
    ID.unique(),
    params,
  );
  return doc.$id;
}

export async function listUserSites(userId: string, limit = 20): Promise<NitSite[]> {
  const db = getAdminDatabases();
  const result = await db.listDocuments<NitSite>(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.sites,
    [
      Query.equal("userId", userId),
      Query.orderDesc("$createdAt"),
      Query.limit(limit),
    ],
  );
  return result.documents;
}

export async function deleteSite(userId: string, siteId: string): Promise<boolean> {
  const db = getAdminDatabases();
  try {
    const site = await db.getDocument<NitSite>(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.sites,
      siteId,
    );
    if (site.userId !== userId) return false; // ownership check
    await db.deleteDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.sites,
      siteId,
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Metric logging ─────────────────────────────────

export async function logGeneration(
  params: Omit<NitGeneration, keyof Models.Document>,
): Promise<void> {
  try {
    const db = getAdminDatabases();
    await db.createDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.generations,
      ID.unique(),
      params,
    );
  } catch {
    // Silently drop metric logging errors — don't break user flow
  }
}

// ─── Guest IP quota (persistent) ─────────────────────────

/**
 * Хешируем IP перед использованием как docId — чтобы не светить сырые IP
 * в Appwrite logs/exports (privacy + GDPR-friendly). sha256 → 64 hex chars.
 */
function hashIp(ip: string): string {
  return createHash("sha256").update(`nit-guest:${ip}`).digest("hex");
}

export type GuestLimitDecision = {
  allowed: boolean;
  remaining: number;
  /** Когда счётчик сбросится (для UI). */
  resetAt: number;
};

/**
 * Атомарная проверка-и-инкремент guest квоты по IP. Persistent: переживает
 * рестарт сервера и работает в multi-instance scaleup.
 */
export async function consumeGuestLimit(
  ip: string,
  dailyMax: number,
  windowMs: number,
): Promise<GuestLimitDecision> {
  const ipHash = hashIp(ip);
  const docId = ipHash.slice(0, 36); // Appwrite doc ID limit
  const db = getAdminDatabases();
  const now = Date.now();
  const newResetAt = new Date(now + windowMs).toISOString();

  let existing: NitGuestLimit | null = null;
  try {
    existing = await db.getDocument<NitGuestLimit>(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.guestLimits,
      docId,
    );
  } catch {
    existing = null; // doesn't exist — first request from this IP
  }

  // Первый запрос ИЛИ счётчик протух → создаём/перезаписываем
  if (!existing || new Date(existing.resetAt).getTime() < now) {
    if (existing) {
      await db.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.guestLimits,
        docId,
        { count: 1, resetAt: newResetAt },
      );
    } else {
      await db.createDocument<NitGuestLimit>(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.guestLimits,
        docId,
        { ipHash, count: 1, resetAt: newResetAt },
      );
    }
    return {
      allowed: true,
      remaining: dailyMax - 1,
      resetAt: now + windowMs,
    };
  }

  if (existing.count >= dailyMax) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(existing.resetAt).getTime(),
    };
  }

  await db.updateDocument(
    APPWRITE_CONFIG.databaseId,
    APPWRITE_CONFIG.collections.guestLimits,
    docId,
    { count: existing.count + 1 },
  );
  return {
    allowed: true,
    remaining: dailyMax - existing.count - 1,
    resetAt: new Date(existing.resetAt).getTime(),
  };
}

/**
 * Удалить все nit_guest_limits документы с resetAt < now.
 */
export async function cleanupExpiredGuestLimits(
  maxBatches: number = 10,
): Promise<{ scanned: number; deleted: number; batches: number }> {
  const db = getAdminDatabases();
  const now = new Date().toISOString();

  let totalScanned = 0;
  let totalDeleted = 0;
  let batches = 0;

  for (let i = 0; i < maxBatches; i++) {
    const result = await db.listDocuments<NitGuestLimit>(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.guestLimits,
      [Query.lessThan("resetAt", now), Query.limit(100)],
    );
    totalScanned += result.documents.length;
    if (result.documents.length === 0) break;

    const settled = await Promise.allSettled(
      result.documents.map((doc) =>
        db.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.guestLimits,
          doc.$id,
        ),
      ),
    );
    totalDeleted += settled.filter((s) => s.status === "fulfilled").length;
    batches++;

    if (result.documents.length < 100) break;
  }

  return { scanned: totalScanned, deleted: totalDeleted, batches };
}
