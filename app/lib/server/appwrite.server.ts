/**
 * Appwrite server SDK wrapper for NIT Builder v2.0.
 *
 * Uses the existing vibecoding Appwrite instance:
 *   endpoint:  https://appwrite.vibecoding.by/v1
 *   projectId: 69aa2114000211b48e63
 *
 * Collections (in database `nit_builder`):
 * - nit_users       → extends Appwrite users with tunnelTokenHash, preferences
 * - nit_sites       → generated sites (replaces localStorage history)
 * - nit_generations → audit log of each generation attempt
 *
 * Database + collections must be created manually via:
 *   scripts/appwrite-migrate.ts
 *
 * Required environment variables:
 *   APPWRITE_ENDPOINT      (default: https://appwrite.vibecoding.by/v1)
 *   APPWRITE_PROJECT_ID    (default: 69aa2114000211b48e63)
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

// ─── Config ──────────────────────────────────────────────────────

export const APPWRITE_CONFIG = {
  endpoint: process.env.APPWRITE_ENDPOINT ?? "https://appwrite.vibecoding.by/v1",
  projectId: process.env.APPWRITE_PROJECT_ID ?? "69aa2114000211b48e63",
  databaseId: process.env.APPWRITE_DATABASE_ID ?? "nit_builder",
  collections: {
    users: "nit_users",
    sites: "nit_sites",
    generations: "nit_generations",
  },
} as const;

export function isAppwriteConfigured(): boolean {
  return !!process.env.APPWRITE_API_KEY;
}

// ─── Clients ─────────────────────────────────────────────────────

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

// ─── Types for NIT Builder documents ─────────────────────────────

export type NitUser = Models.Document & {
  /** Appwrite user $id — we use the same ID */
  email: string;
  /** Deterministic HMAC-SHA256 for DB index lookup */
  tunnelTokenLookup: string;
  /** Argon2id hash with random salt for final verification */
  tunnelTokenHash: string;
  /** When the tunnel token was last generated */
  tunnelTokenCreatedAt: string;
  /** Preferred LLM provider: "tunnel" | "groq" | "openrouter" */
  preferredProvider: "tunnel" | "groq" | "openrouter";
  /** Encrypted user-provided API keys (JSON string) */
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
  provider: "tunnel" | "groq" | "openrouter";
  durationMs: number;
  success: boolean;
  errorReason?: string;
  templateId?: string;
};

// ─── Session operations ─────────────────────────────────────────

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
  // NOTE: Appwrite server SDK can't directly verify passwords. The standard pattern
  // for server-side email+password login is to use account.createEmailPasswordSession
  // on a client with no auth, then capture the response cookies/secret.
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

// ─── User operations ─────────────────────────────────────────────

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

  // 3. Create nit_users document
  const userDoc: Omit<NitUser, keyof Models.Document> = {
    email: params.email,
    tunnelTokenLookup,
    tunnelTokenHash,
    tunnelTokenCreatedAt: new Date().toISOString(),
    preferredProvider: "tunnel",
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

// ─── Site operations ─────────────────────────────────────────────

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

// ─── Metric logging ──────────────────────────────────────────────

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
