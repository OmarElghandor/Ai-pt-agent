import {
  enqueueCustomDeckImages,
  enqueueDeckImages,
  planDeckImages,
  customDeckImageQuality,
  customDeckImageModelId,
  customDeckImageDailyLimit,
  countImagesGeneratedToday,
} from './images';
import { estimateImageCostUsd } from '@/lib/v2/images/pricing';
import { listAdminOfficialDecks } from './admin';

export type BulkImagesKind = 'custom' | 'official';

export type BulkImagesResult = {
  ok: true;
  kind: BulkImagesKind;
  totals: {
    decks: number;
    enqueued: number;
    reused: number;
    estimate_usd: number;
    missing_before: number;
  };
  results: {
    deck_id: string;
    ok: boolean;
    enqueued?: number;
    keys?: string[];
    reused?: number;
    reason?: string;
  }[];
};

/**
 * Preview missing counts + cost for selected decks (no enqueue).
 */
export async function previewBulkFlashcardImages(opts: {
  kind: BulkImagesKind;
  deck_ids: string[];
}): Promise<{
  missing_count: number;
  estimate_usd: number;
  decks: { deck_id: string; missing: number; estimate_usd: number }[];
}> {
  const ids = [...new Set(opts.deck_ids.map((id) => id.trim()).filter(Boolean))];
  const decks: { deck_id: string; missing: number; estimate_usd: number }[] = [];
  let missing_count = 0;
  let estimate_usd = 0;
  const quality = customDeckImageQuality();
  const model = customDeckImageModelId();
  const unit = estimateImageCostUsd({
    model,
    size: '1024x1024',
    quality,
  });

  if (opts.kind === 'custom') {
    for (const id of ids) {
      const plan = await planDeckImages({ deckId: id });
      const missing = plan?.missing.length ?? 0;
      const est = plan?.estimate_usd ?? missing * unit;
      decks.push({ deck_id: id, missing, estimate_usd: est });
      missing_count += missing;
      estimate_usd += est;
    }
  } else {
    const all = await listAdminOfficialDecks();
    const byId = new Map(all.map((d) => [d.id, d]));
    for (const id of ids) {
      const row = byId.get(id);
      const missing = row?.missing_images ?? 0;
      const est = missing * unit;
      decks.push({ deck_id: id, missing, estimate_usd: est });
      missing_count += missing;
      estimate_usd += est;
    }
  }

  return { missing_count, estimate_usd, decks };
}

export async function bulkEnqueueFlashcardImages(opts: {
  kind: BulkImagesKind;
  deck_ids: string[];
  confirm_over_cap?: boolean;
}): Promise<
  | BulkImagesResult
  | {
      ok: false;
      reason: string;
      missing_count?: number;
      estimate_usd?: number;
    }
> {
  const ids = [...new Set(opts.deck_ids.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return { ok: false, reason: 'no_decks' };

  const preview = await previewBulkFlashcardImages({
    kind: opts.kind,
    deck_ids: ids,
  });

  // Cap check once for the whole batch (custom only; mirrors single-deck admin API).
  if (opts.kind === 'custom' && !opts.confirm_over_cap && preview.missing_count > 0) {
    const used = await countImagesGeneratedToday();
    const limit = customDeckImageDailyLimit();
    if (used + preview.missing_count > limit) {
      return {
        ok: false,
        reason: 'needs_confirm_over_cap',
        missing_count: preview.missing_count,
        estimate_usd: preview.estimate_usd,
      };
    }
  }

  const results: BulkImagesResult['results'] = [];
  let enqueued = 0;
  let reused = 0;
  const confirm = Boolean(opts.confirm_over_cap) || opts.kind === 'official';

  for (const id of ids) {
    if (opts.kind === 'custom') {
      const r = await enqueueCustomDeckImages({
        deckId: id,
        admin: true,
        confirmOverCap: confirm,
      });
      if (!r.ok) {
        results.push({ deck_id: id, ok: false, reason: r.reason });
        continue;
      }
      enqueued += r.enqueued;
      reused += r.reused;
      results.push({
        deck_id: id,
        ok: true,
        enqueued: r.enqueued,
        keys: r.keys,
        reused: r.reused,
      });
    } else {
      try {
        const r = await enqueueDeckImages(id);
        enqueued += r.enqueued;
        results.push({
          deck_id: id,
          ok: true,
          enqueued: r.enqueued,
          keys: r.keys,
        });
      } catch (e) {
        results.push({
          deck_id: id,
          ok: false,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return {
    ok: true,
    kind: opts.kind,
    totals: {
      decks: ids.length,
      enqueued,
      reused,
      estimate_usd: preview.estimate_usd,
      missing_before: preview.missing_count,
    },
    results,
  };
}
