/**
 * Remote history store — Appwrite-backed "Мои сайты" for authenticated users.
 *
 * Parallel to historyStore.ts (localStorage, guest-only).
 * HistoryPanel picks which one to use based on useAuth() status.
 *
 * API contract:
 *   GET    /api/sites            → list user's sites (without HTML)
 *   POST   /api/sites            → save a new site
 *   GET    /api/sites/:id        → fetch one site with full HTML
 *   DELETE /api/sites/:id        → delete a site
 */

import type { HistoryEntry } from "./historyStore";

/** Site summary returned by GET /api/sites (no HTML) */
export type RemoteSiteSummary = {
  id: string;
  createdAt: string; // ISO
  updatedAt: string;
  prompt: string;
  templateId: string;
  templateName: string;
  thumbnail: string | null;
};

export async function listRemoteSites(): Promise<RemoteSiteSummary[]> {
  const res = await fetch("/api/sites", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to load sites: ${res.status}`);
  }
  const data = (await res.json()) as { sites: RemoteSiteSummary[] };
  return data.sites;
}

export async function getRemoteSite(id: string): Promise<HistoryEntry | null> {
  const res = await fetch(`/api/sites/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    id: string;
    createdAt: string;
    prompt: string;
    html: string;
    templateId: string;
    templateName: string;
    thumbnail: string | null;
  };
  return {
    id: data.id,
    createdAt: new Date(data.createdAt).getTime(),
    prompt: data.prompt,
    html: data.html,
    templateId: data.templateId,
    templateName: data.templateName,
    thumbnail: data.thumbnail ?? undefined,
  };
}

export async function saveRemoteSite(params: {
  prompt: string;
  html: string;
  templateId: string;
  templateName: string;
  thumbnail?: string;
}): Promise<string | null> {
  const res = await fetch("/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function deleteRemoteSite(id: string): Promise<boolean> {
  const res = await fetch(`/api/sites/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return res.ok;
}

// ─── Migration helper ────────────────────────────────────────────

const MIGRATION_FLAG_KEY = "nit:history-migrated";

/**
 * Migrate localStorage history → Appwrite once per user.
 * Called by HistoryPanel when user logs in for the first time.
 * Sets a flag to prevent re-migration.
 */
export async function migrateLocalHistoryIfNeeded(): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (localStorage.getItem(MIGRATION_FLAG_KEY)) return 0;

  const { loadHistory } = await import("./historyStore");
  const local = loadHistory();
  if (local.length === 0) {
    localStorage.setItem(MIGRATION_FLAG_KEY, "1");
    return 0;
  }

  let migrated = 0;
  for (const entry of local) {
    const id = await saveRemoteSite({
      prompt: entry.prompt,
      html: entry.html,
      templateId: entry.templateId,
      templateName: entry.templateName,
      thumbnail: entry.thumbnail,
    });
    if (id) migrated++;
  }

  localStorage.setItem(MIGRATION_FLAG_KEY, "1");
  return migrated;
}
