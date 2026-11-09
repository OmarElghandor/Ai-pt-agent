import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  buildImageManifest,
  estimateImageCostUsd,
  getImageByKey,
  loadLessonAndStoryForImages,
  resolveImageScene,
} from '@/lib/v2/images';
import {
  buildAuthoredImagePrompt,
  buildImagePrompt,
  sizeForRatio,
  type ImageSpec,
} from '@/lib/v2/generation/images/templates';
import { V2ImageModel } from '@/lib/v2/mongo/models';

export const runtime = 'nodejs';

function previewFinalPrompt(opts: {
  source: 'authored' | 'generated' | 'override';
  scenePrompt: string | null;
  characters: string[];
  storedPrompt?: string | null;
  spec?: ImageSpec | null;
}): string {
  if (opts.scenePrompt) {
    return buildAuthoredImagePrompt({
      characters: opts.characters,
      prompt: opts.scenePrompt,
      scene: true,
    });
  }
  if (opts.storedPrompt?.trim()) return opts.storedPrompt;
  if (opts.spec) {
    return buildImagePrompt({
      ...opts.spec,
      characters: opts.characters.length
        ? opts.characters
        : opts.spec.characters,
    });
  }
  return '';
}

export async function GET(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const url = new URL(req.url);
  const day = Number(url.searchParams.get('day'));
  if (!Number.isFinite(day) || day < 1) {
    return NextResponse.json({ error: 'day required' }, { status: 400 });
  }

  const { lesson, story } = await loadLessonAndStoryForImages(day);
  if (!lesson && !story) {
    return NextResponse.json(
      { error: `no lesson/story for day ${day}` },
      { status: 404 },
    );
  }

  const pack = lesson?.pack ?? ({ items: [], pages: [], lesson: {} } as never);
  const targetLang = story?.target_lang ?? lesson?.target_lang ?? 'pt-PT';
  const manifest = buildImageManifest({
    pack,
    story,
    day,
    targetLang,
  });

  const images = [];
  let queued = 0;
  let generating = 0;
  let ready = 0;
  let blocked = 0;
  let failed = 0;
  let flagged = 0;
  let missing = 0;
  let estimate_usd_for_missing = 0;
  let sample_reason: string | null = null;

  for (const entry of manifest) {
    const resolved = await resolveImageScene({
      day,
      key: entry.key,
      itemId: entry.itemId,
      targetLang,
    });
    const doc = await getImageByKey(entry.key);
    const characters =
      resolved.characters.length > 0
        ? resolved.characters
        : ((doc?.spec as ImageSpec | null | undefined)?.characters ?? []);
    const scene_prompt =
      resolved.prompt_override ??
      resolved.authored?.prompt ??
      null;
    const source =
      resolved.source !== 'generated'
        ? resolved.source
        : ((doc?.prompt_source as 'authored' | 'generated' | 'override' | null) ??
          'generated');
    const final_prompt = previewFinalPrompt({
      source,
      scenePrompt: resolved.scenePrompt,
      characters,
      storedPrompt: doc?.prompt,
      spec: (doc?.spec as ImageSpec | null | undefined) ?? null,
    });

    const status = doc?.status ?? 'missing';
    const reason = doc?.reason ?? null;
    if (status === 'queued') queued += 1;
    else if (status === 'generating') generating += 1;
    else if (status === 'ready') ready += 1;
    else if (status === 'blocked') {
      blocked += 1;
      if (!sample_reason && reason) sample_reason = reason;
    } else if (status === 'failed') {
      failed += 1;
      if (!sample_reason && reason) sample_reason = reason;
    } else if (status === 'flagged') {
      flagged += 1;
      if (!sample_reason && reason) sample_reason = reason;
    }
    const needsGen =
      !doc ||
      status === 'missing' ||
      status === 'queued' ||
      status === 'failed' ||
      status === 'flagged' ||
      status === 'blocked';
    if (needsGen) {
      missing += 1;
      const size = sizeForRatio(
        entry.aspect === '16:9'
          ? '16:9'
          : entry.aspect === '4:3'
            ? '4:3'
            : '1:1',
      );
      estimate_usd_for_missing += estimateImageCostUsd({
        size,
        quality: 'medium',
      });
    }

    images.push({
      key: entry.key,
      item_id: entry.itemId ?? null,
      manifest_source: entry.source,
      aspect: entry.aspect,
      ratio: resolved.ratio ?? entry.aspect,
      characters,
      source,
      scene_prompt,
      prompt_override: resolved.prompt_override,
      final_prompt,
      status,
      reason,
      url: doc?.url ?? null,
      cost_usd: doc?.cost_usd ?? null,
    });
  }

  return NextResponse.json({
    day,
    images,
    queued,
    generating,
    ready,
    blocked,
    failed,
    flagged,
    missing,
    sample_reason,
    estimate_usd_for_missing: Math.round(estimate_usd_for_missing * 1000) / 1000,
  });
}
export async function PATCH(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    key?: string;
    prompt_override?: string | null;
  } | null;
  if (!body?.key) {
    return NextResponse.json({ error: 'key required' }, { status: 400 });
  }

  await connectMongo();
  const override =
    typeof body.prompt_override === 'string' ? body.prompt_override.trim() : '';
  const updated = await V2ImageModel().findOneAndUpdate(
    { key: body.key },
    override
      ? {
          $set: {
            prompt_override: override,
            prompt_source: 'override',
          },
          $setOnInsert: {
            key: body.key,
            status: 'missing',
            kind: 'content',
            cost_usd: 0,
            version: 1,
            used_by: [],
          },
        }
      : {
          $unset: { prompt_override: 1 },
          $setOnInsert: {
            key: body.key,
            status: 'missing',
            kind: 'content',
            cost_usd: 0,
            version: 1,
            used_by: [],
          },
        },
    { upsert: true, returnDocument: 'after' },
  );

  return NextResponse.json({
    ok: true,
    key: body.key,
    prompt_override: updated?.prompt_override ?? null,
    prompt_source: updated?.prompt_source ?? null,
  });
}
