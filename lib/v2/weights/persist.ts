/**
 * Load frequency map + upsert weight rows (17 W1). Never on the answer path.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { loadCoreItemsFile } from '@/lib/v2/generation/lesson/coreItems';
import {
  V2FrequencyWordModel,
  V2ItemWeightModel,
} from '@/lib/v2/mongo/models';
import { buildWeightRows, type ItemWeightRow } from './buildRows';
import {
  buildFreqRankMap,
  buildPalavrasSet,
  type FreqRankMap,
} from './freq';
import { CUSTOM_ONLY_WEIGHT, isCustomOnlyItemId, weightOrDefault } from './lookup';

const DEFAULT_PALAVRAS_PATH = path.join(
  process.cwd(),
  'content/v2/frequency/1000-palavras.json',
);

export async function loadFreqRankMap(lang: string): Promise<FreqRankMap> {
  if (!mongoConfigured()) return new Map();
  await connectMongo();
  const docs = await V2FrequencyWordModel()
    .find({ lang })
    .select({ word: 1, rank: 1 })
    .lean()
    .exec();
  return buildFreqRankMap(
    docs.map((d) => ({ word: String(d.word), rank: Number(d.rank) })),
  );
}

/** Load curated 1000-palavras membership from disk (optional). */
export function loadPalavrasSet(filePath = DEFAULT_PALAVRAS_PATH): Set<string> {
  if (!existsSync(filePath)) return new Set();
  const data = JSON.parse(readFileSync(filePath, 'utf8')) as Array<{
    tl?: string;
    freq_heads?: string[];
  }>;
  return buildPalavrasSet(data);
}

export type RecomputeItemWeightsResult = {
  lang: string;
  count: number;
  flagged: number;
  top: ItemWeightRow[];
};

/**
 * Recompute every core item weight and upsert into v2_item_weights.
 */
export async function recomputeItemWeights(opts?: {
  lang?: string;
  throughDay?: number;
  topN?: number;
}): Promise<RecomputeItemWeightsResult> {
  if (!mongoConfigured()) {
    throw new Error('Mongo is not configured (MONGODB_URI)');
  }
  await connectMongo();

  const file = loadCoreItemsFile();
  const lang = opts?.lang ?? file.lang ?? 'pt-PT';
  const freqMap = await loadFreqRankMap(lang);
  const palavrasSet = loadPalavrasSet();
  const rows = buildWeightRows({
    file,
    freqMap,
    palavrasSet,
    lang,
    throughDay: opts?.throughDay,
  });

  const now = new Date();
  const ops = rows.map((row) => ({
    updateOne: {
      filter: { item_id: row.item_id, lang: row.lang },
      update: {
        $set: {
          item_id: row.item_id,
          lang: row.lang,
          day: row.day,
          tl: row.tl,
          kind: row.kind,
          priority: row.priority,
          survival: row.survival,
          freq_rank: row.freq_rank,
          reuse_count: row.reuse_count,
          weight: row.weight,
          weight_why: row.weight_why,
          needs_review: row.needs_review,
          updated_at: now,
        },
      },
      upsert: true,
    },
  }));

  if (ops.length) {
    await V2ItemWeightModel().bulkWrite(ops, { ordered: false });
  }

  const topN = opts?.topN ?? 50;
  return {
    lang,
    count: rows.length,
    flagged: rows.filter((r) => r.needs_review).length,
    top: rows.slice(0, topN),
  };
}

/** Runtime lookup used by builders (W4+). Custom-only → 30. */
export async function weightForItemId(
  itemId: string,
  lang = 'pt-PT',
): Promise<number> {
  if (isCustomOnlyItemId(itemId)) return CUSTOM_ONLY_WEIGHT;
  if (!mongoConfigured()) return CUSTOM_ONLY_WEIGHT;
  await connectMongo();
  const row = await V2ItemWeightModel()
    .findOne({ item_id: itemId, lang })
    .select({ weight: 1 })
    .lean()
    .exec();
  return weightOrDefault(itemId, row?.weight as number | undefined);
}
