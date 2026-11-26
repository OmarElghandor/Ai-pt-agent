import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CustomItemModel,
  V2OfficialDeckModel,
} from '@/lib/v2/mongo/models';
import {
  V2MicroClipModel,
  V2MicroSeriesModel,
} from '@/lib/v2/mongo/microModels';
import { canPublishSceneLines } from './images/regions';

export type PublishClipResult =
  | { ok: true; clip_id: string }
  | { ok: false; reason: string };

export type PublishSeriesResult =
  | { ok: true; series_id: string; official_deck_id: string }
  | { ok: false; reason: string };

export async function publishMicroClip(clipId: string): Promise<PublishClipResult> {
  if (!mongoConfigured()) return { ok: false, reason: 'mongo_unavailable' };
  await connectMongo();
  const Clip = V2MicroClipModel();
  const clip = await Clip.findById(clipId);
  if (!clip) return { ok: false, reason: 'not_found' };
  if (!clip.lines?.length || clip.lines.length < 6) {
    return { ok: false, reason: 'too_few_lines' };
  }
  if (clip.layout === 'scene') {
    const lines = clip.lines.map((l) => ({
      box: l.box
        ? { x: l.box.x, y: l.box.y, w: l.box.w, h: l.box.h }
        : null,
      box_flagged: Boolean(l.box_flagged),
    }));
    if (!canPublishSceneLines(lines)) {
      return { ok: false, reason: 'scene_boxes_incomplete' };
    }
  }
  clip.status = 'published';
  clip.draft_reason = undefined;
  await clip.save();

  // Mark pool items official
  const ids = clip.lines.map((l) => l.item_id).filter(Boolean);
  await V2CustomItemModel().updateMany(
    { id: { $in: ids }, status: 'custom' },
    { $set: { status: 'official' } },
  );

  return { ok: true, clip_id: String(clip._id) };
}

/**
 * Publish series + upsert official deck with source: micro (19 M4).
 */
export async function publishMicroSeries(
  seriesId: string,
): Promise<PublishSeriesResult> {
  if (!mongoConfigured()) return { ok: false, reason: 'mongo_unavailable' };
  await connectMongo();
  const Series = V2MicroSeriesModel();
  const Clip = V2MicroClipModel();
  const series = await Series.findById(seriesId);
  if (!series) return { ok: false, reason: 'not_found' };

  const clips = await Clip.find({
    series_id: String(series._id),
    status: 'published',
  })
    .sort({ order: 1 })
    .lean();

  if (clips.length === 0) {
    return { ok: false, reason: 'no_published_clips' };
  }

  const itemIds: string[] = [];
  const seen = new Set<string>();
  for (const c of clips) {
    for (const line of c.lines ?? []) {
      if (line.item_id && !seen.has(line.item_id)) {
        seen.add(line.item_id);
        itemIds.push(line.item_id);
      }
    }
  }

  const Deck = V2OfficialDeckModel();
  let deckId = series.official_deck_id;
  if (deckId) {
    await Deck.updateOne(
      { _id: deckId },
      {
        $set: {
          title_tl: series.title_tl,
          title_ar: series.title_ar,
          item_ids: itemIds,
          status: 'published',
          source: 'micro',
          micro_series_id: String(series._id),
          target_lang: series.target_lang,
        },
      },
    );
  } else {
    const created = await Deck.create({
      target_lang: series.target_lang,
      title_tl: series.title_tl,
      title_ar: series.title_ar,
      tags: ['micro', series.slug],
      item_ids: itemIds,
      status: 'published',
      source: 'micro',
      micro_series_id: String(series._id),
    });
    deckId = String(created._id);
    series.official_deck_id = deckId;
  }

  series.status = 'published';
  await series.save();

  return { ok: true, series_id: String(series._id), official_deck_id: deckId! };
}
