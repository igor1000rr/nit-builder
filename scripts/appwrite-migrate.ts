#!/usr/bin/env tsx
/**
 * Appwrite migration script for NIT Builder v2.0
 *
 * Creates the `nit_builder` database and its collections in the existing
 * vibecoding Appwrite project. Idempotent — safe to re-run.
 *
 * Usage:
 *   APPWRITE_API_KEY=... npm run migrate:appwrite
 *
 * Or directly:
 *   APPWRITE_API_KEY=... tsx scripts/appwrite-migrate.ts
 *
 * Required env:
 *   APPWRITE_API_KEY       — server API key with databases.write scope
 *   APPWRITE_ENDPOINT      — default: https://appwrite.vibecoding.by/v1
 *   APPWRITE_PROJECT_ID    — default: 69ab07130011752aae12
 *   APPWRITE_DATABASE_ID   — default: nit_builder
 */

import { Client, Databases, IndexType } from "node-appwrite";

const config = {
  endpoint: process.env.APPWRITE_ENDPOINT ?? "https://appwrite.vibecoding.by/v1",
  projectId: process.env.APPWRITE_PROJECT_ID ?? "69ab07130011752aae12",
  databaseId: process.env.APPWRITE_DATABASE_ID ?? "nit_builder",
  apiKey: process.env.APPWRITE_API_KEY,
};

if (!config.apiKey) {
  console.error("✗ APPWRITE_API_KEY env variable is required");
  process.exit(1);
}

const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey);

const db = new Databases(client);

// ─── Helpers ─────────────────────────────────────────────────────

async function ensureDatabase(): Promise<void> {
  try {
    await db.get(config.databaseId);
    console.log(`✓ Database '${config.databaseId}' exists`);
  } catch {
    await db.create(config.databaseId, "NIT Builder v2.0");
    console.log(`✓ Created database '${config.databaseId}'`);
  }
}

async function ensureCollection(
  collectionId: string,
  name: string,
): Promise<void> {
  try {
    await db.getCollection(config.databaseId, collectionId);
    console.log(`  ✓ Collection '${collectionId}' exists`);
  } catch {
    await db.createCollection(
      config.databaseId,
      collectionId,
      name,
      [
        // Server-only access by default — we'll add document-level permissions per-user
        'read("users")',
        'create("users")',
        'update("users")',
        'delete("users")',
      ],
      true, // documentSecurity enabled
    );
    console.log(`  ✓ Created collection '${collectionId}'`);
  }
}

type AttrType =
  | { kind: "string"; size: number; required: boolean; default?: string }
  | { kind: "email"; required: boolean }
  | { kind: "boolean"; required: boolean; default?: boolean }
  | { kind: "integer"; required: boolean; default?: number; min?: number; max?: number }
  | { kind: "datetime"; required: boolean; default?: string };

async function ensureAttribute(
  collectionId: string,
  key: string,
  attr: AttrType,
): Promise<void> {
  try {
    await db.getAttribute(config.databaseId, collectionId, key);
    console.log(`    ✓ Attribute '${key}' exists`);
    return;
  } catch {
    // Attribute doesn't exist — create it
  }

  switch (attr.kind) {
    case "string":
      await db.createStringAttribute(
        config.databaseId,
        collectionId,
        key,
        attr.size,
        attr.required,
        attr.default,
      );
      break;
    case "email":
      await db.createEmailAttribute(config.databaseId, collectionId, key, attr.required);
      break;
    case "boolean":
      await db.createBooleanAttribute(
        config.databaseId,
        collectionId,
        key,
        attr.required,
        attr.default,
      );
      break;
    case "integer":
      await db.createIntegerAttribute(
        config.databaseId,
        collectionId,
        key,
        attr.required,
        attr.min,
        attr.max,
        attr.default,
      );
      break;
    case "datetime":
      await db.createDatetimeAttribute(
        config.databaseId,
        collectionId,
        key,
        attr.required,
        attr.default,
      );
      break;
  }
  console.log(`    + Created attribute '${key}' (${attr.kind})`);
}

async function ensureIndex(
  collectionId: string,
  indexKey: string,
  type: "key" | "unique" | "fulltext",
  attributes: string[],
): Promise<void> {
  try {
    await db.getIndex(config.databaseId, collectionId, indexKey);
    console.log(`    ✓ Index '${indexKey}' exists`);
    return;
  } catch {
    // doesn't exist
  }

  const indexType =
    type === "unique"
      ? IndexType.Unique
      : type === "fulltext"
        ? IndexType.Fulltext
        : IndexType.Key;

  await db.createIndex(
    config.databaseId,
    collectionId,
    indexKey,
    indexType,
    attributes,
  );
  console.log(`    + Created index '${indexKey}'`);
}

// ─── Schema definitions ──────────────────────────────────────────

async function migrate(): Promise<void> {
  console.log("NIT Builder v2.0 — Appwrite migration");
  console.log(`  Endpoint:   ${config.endpoint}`);
  console.log(`  Project:    ${config.projectId}`);
  console.log(`  Database:   ${config.databaseId}`);
  console.log("");

  await ensureDatabase();
  console.log("");

  // ── nit_users ──
  console.log("Collection: nit_users");
  await ensureCollection("nit_users", "NIT Users");
  await ensureAttribute("nit_users", "email", { kind: "email", required: true });
  await ensureAttribute("nit_users", "tunnelTokenLookup", {
    kind: "string",
    size: 64,
    required: true,
  });
  await ensureAttribute("nit_users", "tunnelTokenHash", {
    kind: "string",
    size: 500,
    required: true,
  });
  await ensureAttribute("nit_users", "tunnelTokenCreatedAt", {
    kind: "datetime",
    required: true,
  });
  await ensureAttribute("nit_users", "preferredProvider", {
    kind: "string",
    size: 32,
    required: true,
    default: "tunnel",
  });
  await ensureAttribute("nit_users", "apiKeysJson", {
    kind: "string",
    size: 4000,
    required: false,
  });
  // Wait a moment for attributes to become available
  await sleep(2000);
  await ensureIndex("nit_users", "email_unique", "unique", ["email"]);
  await ensureIndex("nit_users", "tunnelTokenLookup_idx", "key", ["tunnelTokenLookup"]);
  console.log("");

  // ── nit_sites ──
  console.log("Collection: nit_sites");
  await ensureCollection("nit_sites", "NIT Sites");
  await ensureAttribute("nit_sites", "userId", {
    kind: "string",
    size: 64,
    required: true,
  });
  await ensureAttribute("nit_sites", "prompt", {
    kind: "string",
    size: 5000,
    required: true,
  });
  await ensureAttribute("nit_sites", "html", {
    kind: "string",
    size: 1_000_000, // 1 MB max per site
    required: true,
  });
  await ensureAttribute("nit_sites", "templateId", {
    kind: "string",
    size: 64,
    required: true,
  });
  await ensureAttribute("nit_sites", "templateName", {
    kind: "string",
    size: 128,
    required: true,
  });
  await ensureAttribute("nit_sites", "thumbnail", {
    kind: "string",
    size: 100_000,
    required: false,
  });
  await sleep(2000);
  await ensureIndex("nit_sites", "userId_idx", "key", ["userId"]);
  await ensureIndex("nit_sites", "userId_createdAt_idx", "key", ["userId"]);
  console.log("");

  // ── nit_generations ──
  console.log("Collection: nit_generations");
  await ensureCollection("nit_generations", "NIT Generations (audit log)");
  await ensureAttribute("nit_generations", "userId", {
    kind: "string",
    size: 64,
    required: true,
  });
  await ensureAttribute("nit_generations", "mode", {
    kind: "string",
    size: 16,
    required: true,
  });
  await ensureAttribute("nit_generations", "provider", {
    kind: "string",
    size: 32,
    required: true,
  });
  await ensureAttribute("nit_generations", "durationMs", {
    kind: "integer",
    required: true,
    min: 0,
  });
  await ensureAttribute("nit_generations", "success", {
    kind: "boolean",
    required: true,
  });
  await ensureAttribute("nit_generations", "errorReason", {
    kind: "string",
    size: 500,
    required: false,
  });
  await ensureAttribute("nit_generations", "templateId", {
    kind: "string",
    size: 64,
    required: false,
  });
  await sleep(2000);
  await ensureIndex("nit_generations", "userId_idx", "key", ["userId"]);
  console.log("");

  console.log("✓ Migration complete");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

migrate().catch((err) => {
  console.error("✗ Migration failed:", err);
  process.exit(1);
});
