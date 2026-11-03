import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { descriptionForPrompt, isRegistryCharacter } from '@/lib/v2/characters/registry';
import {
  STYLE_PROMPT,
  buildAuthoredImagePrompt,
  buildImagePrompt,
  sizeForRatio,
  sizeForType,
  type ImageSpec,
} from '@/lib/v2/generation/images/templates';
import type { PromptSource } from './resolveScene';
import {
  editImage,
  generateImage,
  type ImageRefInput,
} from '@/lib/v2/generation/images/openaiEdit';
import { visionQa } from '@/lib/v2/generation/images/visionQa';
import { V2ImageModel, type V2ImageDoc } from '@/lib/v2/mongo/models';
import {
  CHARACTER_IDS,
  STYLE_ANCHOR_KEY,
  characterIdFromKey,
  characterImageKey,
  isCharacterKey,
} from './keys';
import { estimateImageCostUsd, imageModelId, type ImageQuality } from './pricing';
import { denormalizeReadyImage } from './rehydrate';
import { resolveLocalPathFromUrl, uploadImage } from './storage';
import type { V2ImageStatus } from './types';

const STALE_GENERATING_MS = 10 * 60 * 1000;
const LOCKABLE: V2ImageStatus[] = [
  'missing',
  'queued',
  'failed',
  'flagged',
  'blocked',
];
/** When force-regenerating, ready images may be reclaimed too. */
const LOCKABLE_FORCE: V2ImageStatus[] = [
  ...LOCKABLE,
  'ready',
  'generating',
];

export type GenerateOneResult = {
  doc: LeanImage;
  skipped: boolean;
  reason?: string;
};

type LeanImage = {
  key: string;
  kind?: string | null;
  type?: string | null;
  spec?: ImageSpec | null;
  prompt?: string | null;
  prompt_override?: string | null;
  prompt_source?: PromptSource | null;
  status: V2ImageStatus;
  url?: string | null;
  public_id?: string | null;
  cloudinary_version?: number | null;
  qa?: unknown;
  cost_usd?: number | null;
  version?: number | null;
  used_by?: string[];
  reason?: string | null;
  generating_started_at?: Date | null;
};

function toLean(doc: V2ImageDoc | Record<string, unknown>): LeanImage {
  const d = doc as LeanImage;
  return {
    key: d.key,
    kind: d.kind,
    type: d.type,
    spec: d.spec as ImageSpec | null | undefined,
    prompt: d.prompt,
    prompt_override: d.prompt_override,
    prompt_source: d.prompt_source,
    status: d.status,
    url: d.url,
    public_id: d.public_id,
    cloudinary_version: d.cloudinary_version,
    qa: d.qa,
    cost_usd: d.cost_usd,
    version: d.version,
    used_by: d.used_by,
    reason: d.reason,
    generating_started_at: d.generating_started_at,
  };
}

/** In-memory ref cache for one generate call tree. */
type RefCache = Map<string, Buffer>;

async function fetchRefBuffer(url: string, cache: RefCache): Promise<Buffer> {
  const hit = cache.get(url);
  if (hit) return hit;
  const local = resolveLocalPathFromUrl(url);
  if (local) {
    const { readFileSync } = await import('node:fs');
    const buf = readFileSync(local);
    cache.set(url, buf);
    return buf;
  }
  // Absolute local path through Next origin is unusual; support absolute http(s).
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ref ${url}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    cache.set(url, buf);
    return buf;
  }
  // Relative /api/... — fetch against local origin when available
  const base =
    process.env.V2_PUBLIC_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'http://127.0.0.1:3000';
  const res = await fetch(new URL(url, base).toString());
  if (!res.ok) throw new Error(`Failed to fetch ref ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  cache.set(url, buf);
  return buf;
}

async function ensureDoc(key: string, seed?: Partial<LeanImage>): Promise<LeanImage> {
  await connectMongo();
  const Model = V2ImageModel();
  const existing = await Model.findOne({ key }).lean();
  if (existing) return toLean(existing as V2ImageDoc);
  const created = await Model.create({
    key,
    status: 'missing' as const,
    cost_usd: 0,
    version: 1,
    used_by: [],
    ...(seed?.kind
      ? {
          kind: seed.kind as 'character_ref' | 'style_anchor' | 'content',
        }
      : {}),
    ...(seed?.type ? { type: seed.type } : {}),
    ...(seed?.spec ? { spec: seed.spec } : {}),
  });
  return toLean(created);
}

/**
 * Claim the key for generation. Returns null if another worker holds it.
 * Stale generating (>10m) is reset and reclaimed.
 * Pass force=true to reclaim a ready image for overwrite regenerate.
 */
export async function claimImageLock(
  key: string,
  opts?: { force?: boolean },
): Promise<LeanImage | null> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const Model = V2ImageModel();
  const staleBefore = new Date(Date.now() - STALE_GENERATING_MS);

  await Model.updateOne(
    {
      key,
      status: 'generating',
      generating_started_at: { $lt: staleBefore },
    },
    {
      $set: {
        status: 'failed',
        reason: 'stale generating reset',
      },
      $unset: { generating_started_at: 1 },
    },
  );

  await ensureDoc(key);

  const claimed = await Model.findOneAndUpdate(
    {
      key,
      status: { $in: opts?.force ? LOCKABLE_FORCE : LOCKABLE },
    },
    {
      $set: {
        status: 'generating',
        generating_started_at: new Date(),
        reason: null,
      },
    },
    { returnDocument: 'after' },
  );

  return claimed ? toLean(claimed) : null;
}

async function getReadyCharacterSheet(
  characterId: string,
): Promise<LeanImage | null> {
  await connectMongo();
  const doc = await V2ImageModel()
    .findOne({
      key: characterImageKey(characterId),
      status: 'ready',
      url: { $exists: true, $ne: '' },
    })
    .lean();
  return doc ? toLean(doc as V2ImageDoc) : null;
}

async function getReadyStyleAnchor(): Promise<LeanImage | null> {
  await connectMongo();
  const doc = await V2ImageModel()
    .findOne({
      key: STYLE_ANCHOR_KEY,
      status: 'ready',
      url: { $exists: true, $ne: '' },
    })
    .lean();
  return doc ? toLean(doc as V2ImageDoc) : null;
}

/** Prefer ready; else any style_anchor doc that still has a downloadable url. */
async function getUsableStyleAnchor(): Promise<LeanImage | null> {
  const ready = await getReadyStyleAnchor();
  if (ready?.url) return ready;
  await connectMongo();
  const doc = await V2ImageModel()
    .findOne({
      key: STYLE_ANCHOR_KEY,
      url: { $exists: true, $ne: '' },
    })
    .lean();
  return doc ? toLean(doc as V2ImageDoc) : null;
}

function characterBootstrapPrompt(characterId: string): string {
  const desc =
    descriptionForPrompt(characterId) ||
    `${characterId}, adult language-learning character`;
  return [
    STYLE_PROMPT,
    '',
    `Character reference sheet for ${desc}.`,
    'Plain warm cream background. Two views side by side: front view and three-quarter view.',
    'Same outfit and colors in both views. Full body. No text, no labels, no watermark.',
  ].join('\n');
}

function styleAnchorBootstrapPrompt(): string {
  return [
    STYLE_PROMPT,
    '',
    'Style anchor only: a simple ceramic coffee cup on a plain warm cream background.',
    'No people. No text. This image exists only to show line weight, palette and shading.',
  ].join('\n');
}

async function runModelAttempt(opts: {
  prompt: string;
  size: '1024x1024' | '1536x1024';
  quality: ImageQuality;
  references: ImageRefInput[] | null;
}): Promise<{ buffer: Buffer; cost: number }> {
  const model = imageModelId();
  const cost = estimateImageCostUsd({
    model,
    size: opts.size,
    quality: opts.quality,
  });
  const buffer = opts.references?.length
    ? await editImage({
        prompt: opts.prompt,
        references: opts.references,
        size: opts.size,
        quality: opts.quality === 'low' ? 'medium' : opts.quality,
      })
    : await generateImage({
        prompt: opts.prompt,
        size: opts.size,
        quality: opts.quality === 'low' ? 'medium' : opts.quality,
      });
  return { buffer, cost };
}

async function finalizeReady(opts: {
  key: string;
  buffer: Buffer;
  prompt: string;
  spec?: ImageSpec;
  kind?: string;
  type?: string;
  qa?: unknown;
  costAdd: number;
  usedByExtra?: string[];
  promptSource?: PromptSource;
}): Promise<LeanImage> {
  const uploaded = await uploadImage({ key: opts.key, buffer: opts.buffer });
  await connectMongo();
  const Model = V2ImageModel();
  const prev = await Model.findOne({ key: opts.key }).lean();
  const cost_usd = (prev?.cost_usd ?? 0) + opts.costAdd;
  const version = (prev?.version ?? 0) + 1;
  const updated = await Model.findOneAndUpdate(
    { key: opts.key },
    {
      $set: {
        status: 'ready',
        url: uploaded.url,
        public_id: uploaded.public_id,
        cloudinary_version: uploaded.version,
        prompt: opts.prompt,
        spec: opts.spec,
        kind: opts.kind,
        type: opts.type,
        qa: opts.qa,
        cost_usd,
        version,
        reason: null,
        ...(opts.promptSource ? { prompt_source: opts.promptSource } : {}),
      },
      $unset: { generating_started_at: 1 },
      ...(opts.usedByExtra?.length
        ? { $addToSet: { used_by: { $each: opts.usedByExtra } } }
        : {}),
    },
    { returnDocument: 'after', upsert: true },
  );

  await denormalizeReadyImage({
    key: opts.key,
    url: uploaded.url,
    extraUsedBy: opts.usedByExtra,
  });

  // Unblock content images waiting on this character sheet
  if (isCharacterKey(opts.key)) {
    await Model.updateMany(
      { status: 'blocked', reason: 'no sheet' },
      // leave blocked until next generate attempt — just clear isn't enough without knowing which
      {},
    );
  }

  return toLean(updated!);
}

async function markStatus(
  key: string,
  status: V2ImageStatus,
  opts: {
    reason?: string;
    costAdd?: number;
    qa?: unknown;
    prompt?: string;
    promptSource?: PromptSource;
  },
): Promise<LeanImage> {
  await connectMongo();
  const Model = V2ImageModel();
  const prev = await Model.findOne({ key }).lean();
  const cost_usd = (prev?.cost_usd ?? 0) + (opts.costAdd ?? 0);
  const updated = await Model.findOneAndUpdate(
    { key },
    {
      $set: {
        status,
        reason: opts.reason ?? null,
        cost_usd,
        ...(opts.qa ? { qa: opts.qa } : {}),
        ...(opts.prompt ? { prompt: opts.prompt } : {}),
        ...(opts.promptSource ? { prompt_source: opts.promptSource } : {}),
      },
      $unset: { generating_started_at: 1 },
    },
    { returnDocument: 'after', upsert: true },
  );
  return toLean(updated!);
}

/**
 * Generate or regenerate a character reference sheet (high quality).
 * Uses generations when no sheet exists yet; edits when regenerating from existing.
 */
export async function generateCharacterSheet(
  characterId: string,
): Promise<GenerateOneResult> {
  if (!isRegistryCharacter(characterId)) {
    throw new Error(`Unknown character: ${characterId}`);
  }
  const key = characterImageKey(characterId);
  const claimed = await claimImageLock(key);
  if (!claimed) {
    const current = await ensureDoc(key);
    return { doc: current, skipped: true, reason: 'already generating/queued' };
  }

  const cache: RefCache = new Map();
  const prompt = characterBootstrapPrompt(characterId);
  const size = '1024x1024' as const;
  const quality: ImageQuality = 'high';
  let costAdd = 0;

  try {
    // Edits only when a prior sheet url exists; otherwise bootstrap via generations.
    let references: ImageRefInput[] | null = null;
    if (claimed.url) {
      try {
        const buf = await fetchRefBuffer(String(claimed.url), cache);
        references = [{ buffer: buf, filename: `${characterId}.png` }];
      } catch {
        references = null;
      }
    }

    let attempt = await runModelAttempt({ prompt, size, quality, references });
    costAdd += attempt.cost;
    const spec: ImageSpec = {
      type: 'object',
      subject: `${characterId} character reference sheet`,
      characters: [characterId],
      must_avoid: ['text', 'letters', 'numbers'],
    };
    // Front + 3/4 sheet often reads as 2 figures — only gate on no_text + style.
    let qa = await visionQa(attempt.buffer, { ...spec, characters: [] });
    const sheetOk = qa.answers.no_text && qa.answers.style_ok;
    if (!sheetOk) {
      attempt = await runModelAttempt({ prompt, size, quality, references });
      costAdd += attempt.cost;
      qa = await visionQa(attempt.buffer, { ...spec, characters: [] });
    }
    const ok = qa.answers.no_text && qa.answers.style_ok;
    if (!ok) {
      const uploaded = await uploadImage({ key, buffer: attempt.buffer });
      const doc = await markStatus(key, 'flagged', {
        reason: `vision QA failed: ${JSON.stringify(qa.answers)}`,
        costAdd,
        qa,
        prompt,
      });
      await V2ImageModel().updateOne(
        { key },
        {
          $set: {
            url: uploaded.url,
            public_id: uploaded.public_id,
            cloudinary_version: uploaded.version,
            kind: 'character_ref',
            type: 'object',
            spec,
          },
        },
      );
      return { doc: { ...doc, url: uploaded.url }, skipped: false };
    }

    const doc = await finalizeReady({
      key,
      buffer: attempt.buffer,
      prompt,
      spec,
      kind: 'character_ref',
      type: 'object',
      qa: { ...qa, ok: true },
      costAdd,
    });
    return { doc, skipped: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const doc = await markStatus(key, 'failed', { reason: msg, costAdd });
    return { doc, skipped: false, reason: msg };
  }
}

/** Bootstrap or regenerate the global style anchor. */
export async function generateStyleAnchor(): Promise<GenerateOneResult> {
  const key = STYLE_ANCHOR_KEY;
  const claimed = await claimImageLock(key);
  if (!claimed) {
    return {
      doc: await ensureDoc(key),
      skipped: true,
      reason: 'already generating/queued',
    };
  }

  const cache: RefCache = new Map();
  const prompt = styleAnchorBootstrapPrompt();
  const size = '1024x1024' as const;
  const quality: ImageQuality = 'high';
  let costAdd = 0;

  try {
    let references: ImageRefInput[] | null = null;
    if (claimed.url) {
      try {
        const buf = await fetchRefBuffer(String(claimed.url), cache);
        references = [{ buffer: buf, filename: 'style_anchor.png' }];
      } catch {
        references = null;
      }
    }
    let attempt = await runModelAttempt({ prompt, size, quality, references });
    costAdd += attempt.cost;
    const spec: ImageSpec = {
      type: 'object',
      subject: 'ceramic coffee cup style anchor',
      must_avoid: ['text', 'people'],
    };
    // Soft gate: style plate only needs no_text + style_ok.
    let qa = await visionQa(attempt.buffer, { ...spec, characters: [] });
    let ok = qa.answers.no_text && qa.answers.style_ok;
    if (!ok) {
      attempt = await runModelAttempt({ prompt, size, quality, references });
      costAdd += attempt.cost;
      qa = await visionQa(attempt.buffer, { ...spec, characters: [] });
      ok = qa.answers.no_text && qa.answers.style_ok;
    }
    if (!ok) {
      const uploaded = await uploadImage({ key, buffer: attempt.buffer });
      const doc = await markStatus(key, 'flagged', {
        reason: `vision QA failed: ${JSON.stringify(qa.answers)}`,
        costAdd,
        qa,
        prompt,
      });
      await V2ImageModel().updateOne(
        { key },
        {
          $set: {
            url: uploaded.url,
            public_id: uploaded.public_id,
            kind: 'style_anchor',
            type: 'object',
            spec,
          },
        },
      );
      return { doc: { ...doc, url: uploaded.url }, skipped: false };
    }
    const doc = await finalizeReady({
      key,
      buffer: attempt.buffer,
      prompt,
      spec,
      kind: 'style_anchor',
      type: 'object',
      qa: { ...qa, ok: true },
      costAdd,
    });
    return { doc, skipped: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const doc = await markStatus(key, 'failed', { reason: msg, costAdd });
    return { doc, skipped: false, reason: msg };
  }
}

/**
 * Generate a content image (word, scene, …) from a spec.
 * Blocks when a required character sheet is missing.
 * When `scenePrompt` is set (authored/override), skips type templates.
 */
export async function generateContentImage(opts: {
  key: string;
  spec: ImageSpec;
  usedBy?: string[];
  quality?: ImageQuality;
  /** Reclaim ready images and overwrite. */
  force?: boolean;
  /** Authored or override scene description (verbatim body). */
  scenePrompt?: string;
  promptSource?: PromptSource;
  ratio?: '1:1' | '4:3' | '16:9';
}): Promise<GenerateOneResult> {
  const { key, spec } = opts;
  const promptSource: PromptSource =
    opts.promptSource ?? (opts.scenePrompt ? 'authored' : 'generated');
  const claimed = await claimImageLock(key, { force: opts.force });
  if (!claimed) {
    const current = await ensureDoc(key, { spec, kind: 'content', type: spec.type });
    return { doc: current, skipped: true, reason: 'already generating/queued' };
  }

  await V2ImageModel().updateOne(
    { key },
    {
      $set: {
        spec,
        kind: 'content',
        type: spec.type,
        prompt_source: promptSource,
      },
      ...(opts.usedBy?.length
        ? { $addToSet: { used_by: { $each: opts.usedBy } } }
        : {}),
    },
  );

  const chars = (spec.characters ?? []).map((id) =>
    id === 'learner' ? 'yassin' : id,
  );
  const uniqueChars = [...new Set(chars)];
  const cache: RefCache = new Map();
  let costAdd = 0;

  try {
    const references: ImageRefInput[] = [];
    if (uniqueChars.length) {
      for (const id of uniqueChars) {
        const sheet = await getReadyCharacterSheet(id);
        if (!sheet?.url) {
          const doc = await markStatus(key, 'blocked', {
            reason: 'no sheet',
          });
          return { doc, skipped: false, reason: 'no sheet' };
        }
        const buf = await fetchRefBuffer(String(sheet.url), cache);
        references.push({ buffer: buf, filename: `${id}.png` });
      }
    } else {
      let anchor = await getUsableStyleAnchor();
      if (!anchor?.url) {
        // Bootstrap once; flagged-with-url is still usable as an edits ref.
        const boot = await generateStyleAnchor();
        if (!boot.doc.url) {
          const doc = await markStatus(key, 'blocked', {
            reason: 'no style anchor',
          });
          return { doc, skipped: false, reason: 'no style anchor' };
        }
        anchor = boot.doc;
      }
      const buf = await fetchRefBuffer(String(anchor.url), cache);
      references.push({ buffer: buf, filename: 'style_anchor.png' });
    }

    const prompt = opts.scenePrompt?.trim()
      ? buildAuthoredImagePrompt({
          characters: uniqueChars.length ? uniqueChars : spec.characters,
          prompt: opts.scenePrompt,
          scene: true,
        })
      : buildImagePrompt({
          ...spec,
          characters: uniqueChars.length ? uniqueChars : spec.characters,
        });
    const size = opts.scenePrompt
      ? sizeForRatio(opts.ratio ?? undefined)
      : sizeForType(spec.type);
    const quality: ImageQuality = opts.quality ?? 'medium';

    let attempt = await runModelAttempt({
      prompt,
      size,
      quality,
      references,
    });
    costAdd += attempt.cost;
    let qa = await visionQa(attempt.buffer, {
      ...spec,
      characters: uniqueChars,
    });
    if (!qa.ok) {
      attempt = await runModelAttempt({
        prompt,
        size,
        quality,
        references,
      });
      costAdd += attempt.cost;
      qa = await visionQa(attempt.buffer, {
        ...spec,
        characters: uniqueChars,
      });
    }

    if (!qa.ok) {
      const uploaded = await uploadImage({ key, buffer: attempt.buffer });
      const doc = await markStatus(key, 'flagged', {
        reason: `vision QA failed: ${JSON.stringify(qa.answers)}`,
        costAdd,
        qa,
        prompt,
        promptSource,
      });
      await V2ImageModel().updateOne(
        { key },
        {
          $set: {
            url: uploaded.url,
            public_id: uploaded.public_id,
            cloudinary_version: uploaded.version,
          },
        },
      );
      return { doc: { ...doc, url: uploaded.url }, skipped: false };
    }

    const doc = await finalizeReady({
      key,
      buffer: attempt.buffer,
      prompt,
      spec: { ...spec, characters: uniqueChars },
      kind: 'content',
      type: spec.type,
      qa,
      costAdd,
      usedByExtra: opts.usedBy,
      promptSource,
    });
    return { doc, skipped: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const doc = await markStatus(key, 'failed', {
      reason: msg,
      costAdd,
      promptSource,
    });
    return { doc, skipped: false, reason: msg };
  }
}

/** Upload a replacement / character sheet from bytes. */
export async function uploadImageBytes(opts: {
  key: string;
  buffer: Buffer;
  kind?: 'character_ref' | 'style_anchor' | 'content';
  spec?: ImageSpec;
}): Promise<LeanImage> {
  const uploaded = await uploadImage({ key: opts.key, buffer: opts.buffer });
  await connectMongo();
  const kind =
    opts.kind ??
    (isCharacterKey(opts.key)
      ? 'character_ref'
      : opts.key === STYLE_ANCHOR_KEY
        ? 'style_anchor'
        : 'content');
  const Model = V2ImageModel();
  const prev = await Model.findOne({ key: opts.key }).lean();
  const updated = await Model.findOneAndUpdate(
    { key: opts.key },
    {
      $set: {
        status: 'ready',
        url: uploaded.url,
        public_id: uploaded.public_id,
        cloudinary_version: uploaded.version,
        kind,
        version: (prev?.version ?? 0) + 1,
        reason: null,
        ...(opts.spec ? { spec: opts.spec } : {}),
      },
      $unset: { generating_started_at: 1 },
    },
    { upsert: true, returnDocument: 'after' },
  );
  await denormalizeReadyImage({ key: opts.key, url: uploaded.url });
  return toLean(updated!);
}

export async function getImageByKey(key: string): Promise<LeanImage | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2ImageModel().findOne({ key }).lean();
  return doc ? toLean(doc as V2ImageDoc) : null;
}

export async function listCharacterImages(): Promise<LeanImage[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const keys = CHARACTER_IDS.map(characterImageKey);
  const docs = await V2ImageModel().find({ key: { $in: keys } }).lean();
  const byKey = new Map(docs.map((d) => [d.key, toLean(d as V2ImageDoc)]));
  return CHARACTER_IDS.map((id) => {
    const key = characterImageKey(id);
    return (
      byKey.get(key) ?? {
        key,
        kind: 'character_ref',
        status: 'missing' as const,
        cost_usd: 0,
        used_by: [],
      }
    );
  });
}

export { characterIdFromKey };
