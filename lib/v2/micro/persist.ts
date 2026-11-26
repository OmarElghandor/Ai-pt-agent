import { connectMongo, mongoConfigured } from '@/lib/mongo';
import type { OutlineClip, OutlineSeries } from '@/lib/v2/micro/outline';
import type {
  GenerateClipOk,
  ResolvedMicroLine,
} from '@/lib/v2/micro/generate';
import {
  V2MicroClipModel,
  V2MicroSeriesModel,
} from '@/lib/v2/mongo/microModels';
import { microMainImageKey } from './images/main';

export async function ensureMicroSeries(
  series: OutlineSeries,
  targetLang: string,
): Promise<string> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const Model = V2MicroSeriesModel();
  const existing = await Model.findOne({
    target_lang: targetLang,
    slug: series.slug,
  });
  if (existing) {
    existing.title_ar = series.title_ar;
    existing.title_tl = series.title_tl;
    existing.order = series.order;
    await existing.save();
    return String(existing._id);
  }
  const created = await Model.create({
    target_lang: targetLang,
    slug: series.slug,
    title_ar: series.title_ar,
    title_tl: series.title_tl,
    order: series.order,
    status: 'draft',
  });
  return String(created._id);
}

export async function persistGeneratedClip(opts: {
  seriesId: string;
  seriesSlug: string;
  clip: OutlineClip;
  targetLang: string;
  result: GenerateClipOk;
}): Promise<string> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const Model = V2MicroClipModel();
  const mainKey = microMainImageKey(
    opts.targetLang,
    opts.seriesSlug,
    opts.clip.slug,
  );
  const payload = {
    series_id: opts.seriesId,
    series_slug: opts.seriesSlug,
    target_lang: opts.targetLang,
    slug: opts.clip.slug,
    order: opts.clip.order,
    layout: opts.clip.layout,
    level: opts.clip.level,
    title_ar: opts.result.title_ar,
    title_tl: opts.result.title_tl,
    note: opts.result.note,
    rule_card: opts.result.rule_card,
    main_image_key: mainKey,
    main_image_aspect: '4:3',
    lines: opts.result.lines.map((l) => ({
      item_id: l.item_id,
      icon_key: l.icon_key,
      tl: l.tl,
      ar: l.ar,
      pos: l.pos,
      concept_en: l.concept_en,
      region_hint: l.region_hint,
      highlight: l.highlight,
      verb_lemma: l.verb_lemma,
      box_flagged: opts.clip.layout === 'scene' && !l.region_hint ? true : false,
    })),
    legacy_ref: opts.clip.legacy_ref,
    status: 'ready' as const,
    draft_reason: undefined,
    generation_cost: opts.result.cost_tokens,
    generation_tokens: opts.result.cost_tokens,
    image_spec: opts.result.image_spec,
  };

  const existing = await Model.findOne({
    target_lang: opts.targetLang,
    slug: opts.clip.slug,
  });
  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    return String(existing._id);
  }
  const created = await Model.create(payload);
  return String(created._id);
}

/** Persist a partial/failed generate as draft for admin visibility. */
export async function persistDraftClip(opts: {
  seriesId: string;
  seriesSlug: string;
  clip: OutlineClip;
  targetLang: string;
  lines: ResolvedMicroLine[];
  title_ar: string;
  title_tl: string;
  draft_reason: string;
  cost_tokens?: number;
}): Promise<string> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const Model = V2MicroClipModel();
  const mainKey = microMainImageKey(
    opts.targetLang,
    opts.seriesSlug,
    opts.clip.slug,
  );
  const payload = {
    series_id: opts.seriesId,
    series_slug: opts.seriesSlug,
    target_lang: opts.targetLang,
    slug: opts.clip.slug,
    order: opts.clip.order,
    layout: opts.clip.layout,
    level: opts.clip.level,
    title_ar: opts.title_ar,
    title_tl: opts.title_tl,
    main_image_key: mainKey,
    main_image_aspect: '4:3',
    lines: opts.lines.map((l) => ({
      item_id: l.item_id,
      icon_key: l.icon_key,
      tl: l.tl,
      ar: l.ar,
      pos: l.pos,
      concept_en: l.concept_en,
      region_hint: l.region_hint,
      highlight: l.highlight,
      verb_lemma: l.verb_lemma,
      box_flagged: opts.clip.layout === 'scene' && !l.region_hint,
    })),
    legacy_ref: opts.clip.legacy_ref,
    status: 'draft' as const,
    draft_reason: opts.draft_reason,
    generation_cost: opts.cost_tokens ?? 0,
    generation_tokens: opts.cost_tokens ?? 0,
  };
  const existing = await Model.findOne({
    target_lang: opts.targetLang,
    slug: opts.clip.slug,
  });
  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    return String(existing._id);
  }
  const created = await Model.create(payload);
  return String(created._id);
}
