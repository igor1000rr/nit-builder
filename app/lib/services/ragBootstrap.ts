/**
 * Load seeds в ragStore при первом обращении. Idempotent через sentinel-запись.
 *
 * Zero-cost если sentinel текущей версии уже есть: hasDocument() → return.
 * При первом запуске или bump SEED_VERSION:
 *   - добавляет plan_example seeds из planExamples.ts
 *   - добавляет hero_headline / benefits / social_proof / cta_microcopy
 *     из copywritingBank.ts
 *   - пишет sentinel
 *
 * Старые seed:plan:* из предыдущей версии остаются в JSONL — id-дедупликация
 * в addDocument гарантирует что повторно они не зальются. Новые добавятся.
 *
 * Tier 2 (since v3): plan_example seeds индексируются с contextual prefix
 * `[niche | tone | mood] query` — это даёт +30-50% recall на medium queries
 * (перефразировки, билингвал, гибридные ниши).
 *
 * Вызывается ленивыми точками: buildFewShotPlansAdaptive, admin endpoints.
 * Если RAG_ENABLED=0 или embedding недоступен — ничего не делает.
 */

import { logger } from "~/lib/utils/logger";
import { addDocument, hasDocument } from "~/lib/services/ragStore";
import { isRagDisabled } from "~/lib/services/ragEmbeddings";
import { PLAN_EXAMPLE_SEEDS } from "~/lib/rag/seeds/planExamples";
import {
  HERO_HEADLINE_SEEDS,
  BENEFITS_SEEDS,
  SOCIAL_PROOF_SEEDS,
  MICROCOPY_SEEDS,
} from "~/lib/rag/seeds/copywritingBank";
import { buildContextualText } from "~/lib/services/contextualEmbed";

const SCOPE = "ragBootstrap";
const SEED_VERSION = "v3";
const SENTINEL_ID = `__seed_sentinel:${SEED_VERSION}`;

let bootstrapPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (isRagDisabled()) return;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = doBootstrap().catch((err) => {
    logger.warn(SCOPE, `Bootstrap failed: ${(err as Error).message}`);
    bootstrapPromise = null; // позволим retry
    throw err;
  });
  return bootstrapPromise;
}

async function doBootstrap(): Promise<void> {
  if (await hasDocument(SENTINEL_ID)) {
    logger.info(SCOPE, `Seeds ${SEED_VERSION} already present, skipping`);
    return;
  }

  let added = 0;
  let failed = 0;

  for (const seed of PLAN_EXAMPLE_SEEDS) {
    // Contextual prefix для plan_example seeds: ниша + tone + mood
    // ID меняется (suffix :v3) чтобы старые v1/v2 embeddings не блокировали
    // переиндексацию с новым префиксом.
    const contextualText = buildContextualText(seed.query, {
      niche: seed.niche,
      tone: seed.plan.tone,
      mood: seed.plan.color_mood,
    });
    const result = await addDocument({
      id: `seed:plan:${seed.id}:${SEED_VERSION}`,
      text: seed.query,
      contextualText,
      category: "plan_example",
      metadata: {
        query: seed.query,
        plan: seed.plan,
        niche: seed.niche,
        source: `seed_${SEED_VERSION}`,
      },
    });
    if (result) added++;
    else failed++;
  }

  for (const hero of HERO_HEADLINE_SEEDS) {
    const result = await addDocument({
      text: hero.text,
      category: "hero_headline",
      metadata: {
        niche: hero.niche,
        tone: hero.tone,
        language: hero.language,
        source: `seed_${SEED_VERSION}`,
      },
    });
    if (result) added++;
    else failed++;
  }

  for (const benefits of BENEFITS_SEEDS) {
    const result = await addDocument({
      text: benefits.items.map((b) => `${b.title}: ${b.description}`).join(" | "),
      category: "benefits",
      metadata: {
        items: benefits.items,
        niche: benefits.niche,
        language: benefits.language,
        source: `seed_${SEED_VERSION}`,
      },
    });
    if (result) added++;
    else failed++;
  }

  for (const proof of SOCIAL_PROOF_SEEDS) {
    const result = await addDocument({
      text: proof.text,
      category: "social_proof",
      metadata: {
        niche: proof.niche,
        language: proof.language,
        source: `seed_${SEED_VERSION}`,
      },
    });
    if (result) added++;
    else failed++;
  }

  for (const mc of MICROCOPY_SEEDS) {
    const result = await addDocument({
      text: mc.text,
      category: "cta_microcopy",
      metadata: { niche: mc.niche, purpose: mc.purpose, source: `seed_${SEED_VERSION}` },
    });
    if (result) added++;
    else failed++;
  }

  // Sentinel — пишем только если что-то реально добавилось
  if (added > 0) {
    await addDocument({
      id: SENTINEL_ID,
      text: `seed sentinel ${SEED_VERSION}`,
      category: "plan_example",
      metadata: { isSentinel: true, version: SEED_VERSION },
      skipEmbed: true,
    });
    logger.info(
      SCOPE,
      `Bootstrap ${SEED_VERSION}: +${added} docs (${failed} failed — embedding unavailable?)`,
    );
  } else {
    logger.warn(
      SCOPE,
      `Bootstrap ${SEED_VERSION} added 0 docs — embedding unavailable. Retry later.`,
    );
  }
}

export function _resetBootstrapState(): void {
  bootstrapPromise = null;
}
