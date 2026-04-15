/**
 * Feedback → RAG auto-ingest. Самообучающийся корпус plan_example на
 * реальных успешных генерациях (Tier 2 шаг 4).
 *
 * Идея. Имеющийся feedback.jsonl накапливает (query → plan → outcome) при
 * каждой генерации. Часть из них — золотые примеры для few-shot. Инжестор
 * периодически (cron daily или вручную через admin endpoint) отбирает хорошие
 * записи и добавляет их в RAG как plan_example с source="feedback".
 *
 * Фильтры qualifies():
 *   - mode="create" (polish не подходит — нет оригинального plan-блока)
 *   - outcome="success"
 *   - нет errorReason (truncated/continue_truncated/etc отбрасываются)
 *   - planCached=false (кэшированные — дубли уже имеющихся)
 *   - injectMethod НЕ равен 'skeleton' (Tier 3): skeleton-результаты используют plan как есть без
 *     применения Coder LLM — инжест таких в RAG не даёт новой информации (plan уже был
 *     в корпусе когда Planner его сгенерировал)
 *   - plan присутствует и проходит PlanSchema
 *   - userMessage >= MIN_QUERY_LEN (8 chars) и <= MAX_QUERY_LEN — отфильтровывает мусор
 *   - durationMs > 0 и < MAX_DURATION_MS (фильтруем выбросы)
 *   - план проходит quality-чеки (общие с eval-metrics):
 *       • hero_headline 3-120 chars
 *       • нет banned phrases (те же 16 штампов)
 *       • benefits 3-5 пунктов
 *       • в benefits есть хотя бы 1 числовой факт (иначе plan общий и не обучает)
 *
 * Дедупликация. ID формат `feedback:plan:{sha1(userMessage)}` — запросы
 * одинаковые по тексту индексируются раз (даже если plan потом подправятся).
 *
 * Idempotency. Индекс прогресса в файле NIT_FEEDBACK_INGEST_CURSOR_PATH:
 *   { lastTs: "2026-04-15T...", processed: 47 }
 *   При повторном запуске пропускаются записи старше lastTs.
 *
 * Contextual: при ingest извлекаем нишу/mood из plan (не из query!), применяем
 * тот же префикс [niche|mood] что и для seed-ов.
 *
 * Fail-safe. Ни одна стадия не блокирует всю операцию: плохой план пропускается,
 * вывод включает счётчики причин отказа.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { logger } from "~/lib/utils/logger";
import {
  readRecentFeedback,
  type FeedbackRecord,
} from "~/lib/services/feedbackStore";
import { addDocument, hasDocument } from "~/lib/services/ragStore";
import { buildContextualText } from "~/lib/services/contextualEmbed";
import { PlanSchema, type Plan } from "~/lib/utils/planSchema";

const SCOPE = "feedbackIngest";

const MIN_QUERY_LEN = 8;
const MAX_QUERY_LEN = 500;
const MAX_DURATION_MS = 120_000;
const DEFAULT_BATCH_LIMIT = 500;
const CURSOR_DEFAULT_PATH = "/tmp/nit-feedback-ingest-cursor.json";

const BANNED_PHRASES = [
  "качество", "профессионализм", "индивидуальный подход",
  "добро пожаловать", "наша миссия", "квалифицированные специалисты",
  "многолетний опыт", "всегда рады", "оптимальное соотношение",
  "гибкая система", "лучшие цены", "широкий спектр",
  "высококвалифицированные", "высочайший", "первоклассные", "безупречн",
] as const;

const NUMERIC_FACT_RE =
  /\d+\s*(\+|лет|год|месяц|дней|дня|час|минут|сек|раз|%|₽|руб|чел|шт|км|м²|м2)/i;

export type IngestRejectReason =
  | "not_create"
  | "not_success"
  | "has_error_reason"
  | "plan_cached"
  | "skeleton_inject"
  | "no_plan"
  | "plan_invalid_schema"
  | "query_too_short"
  | "query_too_long"
  | "duration_outlier"
  | "hero_invalid"
  | "banned_phrase"
  | "benefits_count_invalid"
  | "no_numeric_facts"
  | "already_ingested";

export type IngestDecision =
  | { ok: true; id: string }
  | { ok: false; reason: IngestRejectReason };

export type IngestCursor = {
  lastTs: string | null;
  totalProcessed: number;
  totalIngested: number;
  lastRunAt: string;
};

export function qualifies(
  record: FeedbackRecord,
): IngestDecision {
  if (record.mode !== "create") return { ok: false, reason: "not_create" };
  if (record.outcome !== "success") return { ok: false, reason: "not_success" };
  if (record.errorReason) return { ok: false, reason: "has_error_reason" };
  if (record.planCached) return { ok: false, reason: "plan_cached" };
  // Skeleton-injection использует plan напрямую без Coder — ingest этих записей не даёт
  // новой информации. Инжестим только Coder-проверенные генерации.
  if (record.injectMethod === "skeleton") return { ok: false, reason: "skeleton_inject" };
  if (!record.plan) return { ok: false, reason: "no_plan" };

  const planParsed = PlanSchema.safeParse(record.plan);
  if (!planParsed.success) return { ok: false, reason: "plan_invalid_schema" };
  const plan = planParsed.data;

  const query = record.userMessage.trim();
  if (query.length < MIN_QUERY_LEN) return { ok: false, reason: "query_too_short" };
  if (query.length > MAX_QUERY_LEN) return { ok: false, reason: "query_too_long" };

  if (record.durationMs <= 0 || record.durationMs > MAX_DURATION_MS) {
    return { ok: false, reason: "duration_outlier" };
  }

  const heroLen = plan.hero_headline?.length ?? 0;
  if (heroLen < 3 || heroLen > 120) return { ok: false, reason: "hero_invalid" };

  const allCopy = collectAllCopyText(plan);
  const lower = allCopy.toLowerCase();
  for (const banned of BANNED_PHRASES) {
    if (lower.includes(banned)) return { ok: false, reason: "banned_phrase" };
  }

  const benefitsCount = plan.key_benefits?.length ?? 0;
  if (benefitsCount < 3 || benefitsCount > 5) {
    return { ok: false, reason: "benefits_count_invalid" };
  }

  const benefitsText =
    plan.key_benefits?.map((b) => `${b.title} ${b.description}`).join(" ") ?? "";
  if (!NUMERIC_FACT_RE.test(benefitsText)) {
    return { ok: false, reason: "no_numeric_facts" };
  }

  return { ok: true, id: makeIngestId(query) };
}

function collectAllCopyText(plan: Plan): string {
  return [
    plan.hero_headline ?? "",
    plan.hero_subheadline ?? "",
    ...(plan.key_benefits?.flatMap((b) => [b.title, b.description]) ?? []),
    plan.social_proof_line ?? "",
    plan.cta_microcopy ?? "",
  ].join(" ");
}

function makeIngestId(query: string): string {
  const hash = crypto.createHash("sha1").update(query).digest("hex").slice(0, 16);
  return `feedback:plan:${hash}`;
}

function getCursorPath(): string {
  return process.env.NIT_FEEDBACK_INGEST_CURSOR_PATH ?? CURSOR_DEFAULT_PATH;
}

async function readCursor(): Promise<IngestCursor> {
  const p = getCursorPath();
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<IngestCursor>;
    return {
      lastTs: parsed.lastTs ?? null,
      totalProcessed: parsed.totalProcessed ?? 0,
      totalIngested: parsed.totalIngested ?? 0,
      lastRunAt: parsed.lastRunAt ?? new Date(0).toISOString(),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        lastTs: null,
        totalProcessed: 0,
        totalIngested: 0,
        lastRunAt: new Date(0).toISOString(),
      };
    }
    throw err;
  }
}

async function writeCursor(cursor: IngestCursor): Promise<void> {
  const p = getCursorPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(cursor, null, 2), "utf8");
}

export type IngestSummary = {
  scanned: number;
  newAfterCursor: number;
  ingested: number;
  skippedByReason: Record<IngestRejectReason, number>;
  cursor: IngestCursor;
  durationMs: number;
};

function emptyReasons(): Record<IngestRejectReason, number> {
  return {
    not_create: 0,
    not_success: 0,
    has_error_reason: 0,
    plan_cached: 0,
    skeleton_inject: 0,
    no_plan: 0,
    plan_invalid_schema: 0,
    query_too_short: 0,
    query_too_long: 0,
    duration_outlier: 0,
    hero_invalid: 0,
    banned_phrase: 0,
    benefits_count_invalid: 0,
    no_numeric_facts: 0,
    already_ingested: 0,
  };
}

export async function runFeedbackIngest(opts: {
  limit?: number;
  dryRun?: boolean;
  signal?: AbortSignal;
} = {}): Promise<IngestSummary> {
  const startMs = Date.now();
  const limit = opts.limit ?? DEFAULT_BATCH_LIMIT;

  const records = await readRecentFeedback(limit);
  const cursor = await readCursor();

  const reasons = emptyReasons();
  let newAfterCursor = 0;
  let ingested = 0;
  let maxTsSeen = cursor.lastTs;

  for (const rec of records) {
    if (opts.signal?.aborted) throw new Error("AbortError");

    if (cursor.lastTs && rec.ts <= cursor.lastTs) continue;
    newAfterCursor++;
    if (!maxTsSeen || rec.ts > maxTsSeen) maxTsSeen = rec.ts;

    const decision = qualifies(rec);
    if (!decision.ok) {
      reasons[decision.reason]++;
      continue;
    }

    if (await hasDocument(decision.id)) {
      reasons.already_ingested++;
      continue;
    }

    if (opts.dryRun) {
      ingested++;
      continue;
    }

    const plan = rec.plan as Plan;
    const contextualText = buildContextualText(rec.userMessage, {
      tone: plan.tone,
      mood: plan.color_mood,
    });
    const result = await addDocument({
      id: decision.id,
      text: rec.userMessage,
      contextualText,
      category: "plan_example",
      metadata: {
        query: rec.userMessage,
        plan,
        source: "feedback",
        ingestedAt: new Date().toISOString(),
        originalTs: rec.ts,
      },
    });
    if (result) ingested++;
  }

  let nextCursor: IngestCursor = cursor;
  if (!opts.dryRun) {
    nextCursor = {
      lastTs: maxTsSeen,
      totalProcessed: cursor.totalProcessed + newAfterCursor,
      totalIngested: cursor.totalIngested + ingested,
      lastRunAt: new Date().toISOString(),
    };
    await writeCursor(nextCursor);
  }

  const summary: IngestSummary = {
    scanned: records.length,
    newAfterCursor,
    ingested,
    skippedByReason: reasons,
    cursor: nextCursor,
    durationMs: Date.now() - startMs,
  };

  logger.info(
    SCOPE,
    `Ingest done: scanned=${summary.scanned}, new=${summary.newAfterCursor}, ingested=${summary.ingested}, dryRun=${!!opts.dryRun}`,
  );
  return summary;
}
