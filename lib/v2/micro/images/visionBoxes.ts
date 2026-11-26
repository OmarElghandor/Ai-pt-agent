import Anthropic from '@anthropic-ai/sdk';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { getImageByKey } from '@/lib/v2/images/generateOne';
import { V2MicroClipModel } from '@/lib/v2/mongo/microModels';
import {
  applyVisionBoxes,
  isValidFractionBox,
  normaliseBox,
  type RegionBox,
  type RegionVisionResult,
} from './regions';

function haikuModel(): string {
  return (
    process.env.MICRO_VISION_MODEL?.trim() ||
    process.env.CLAUDE_HAIKU_MODEL?.trim() ||
    'claude-haiku-4-5'
  );
}

/**
 * Deterministic fallback box when vision misses a hint (still flagged for admin).
 * Places small boxes in a 2-column grid over the middle/lower image.
 */
export function fallbackBoxForIndex(i: number, n: number): RegionBox {
  const cols = 2;
  const rows = Math.max(1, Math.ceil(Math.max(n, 1) / cols));
  const col = i % cols;
  const row = Math.floor(i / cols) % rows;
  const cellW = 0.36;
  const cellH = Math.min(0.28, 0.7 / rows);
  const gapX = (1 - cols * cellW) / (cols + 1);
  const topBase = 0.28;
  const gapY = 0.04;
  const x = gapX + col * (cellW + gapX);
  const y = topBase + row * (cellH + gapY);
  return normaliseBox({ x, y, w: cellW, h: cellH });
}

export type LocateSceneRegionsOpts = {
  imageUrl: string;
  hints: string[];
  /** Injected for tests. */
  callVision?: (args: {
    imageUrl: string;
    hints: string[];
  }) => Promise<Array<{ hint: string; box?: RegionBox | null }>>;
};

async function fetchImageAsBase64(
  imageUrl: string,
): Promise<{ mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string }> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`failed to fetch image: HTTP ${res.status}`);
  }
  const ctype = (res.headers.get('content-type') ?? 'image/png').split(';')[0]!.trim();
  const mediaType =
    ctype === 'image/jpeg' ||
    ctype === 'image/jpg' ||
    ctype === 'image/webp' ||
    ctype === 'image/gif' ||
    ctype === 'image/png'
      ? (ctype === 'image/jpg' ? 'image/jpeg' : ctype)
      : 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    mediaType: mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
    data: buf.toString('base64'),
  };
}

async function defaultVisionCall(opts: {
  imageUrl: string;
  hints: string[];
}): Promise<Array<{ hint: string; box?: RegionBox | null }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY is not set');
  }
  const { mediaType, data } = await fetchImageAsBase64(opts.imageUrl);
  const client = new Anthropic({ apiKey });
  const hintList = opts.hints.map((h, i) => `${i + 1}. ${h}`).join('\n');
  const msg = await client.messages.create({
    model: haikuModel(),
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data },
          },
          {
            type: 'text',
            text: `Find a bounding box for each region hint in this illustration.
Return JSON only: an array of objects {"hint":"<exact hint text>","x":0-1,"y":0-1,"w":0-1,"h":0-1}.
Coordinates are fractions of the image (origin top-left). Boxes should tightly cover the named object/person region.
If a hint is not visible, omit it or set x/y/w/h to null.

Hints:
${hintList}

JSON array only.`,
          },
        ],
      },
    ],
  });
  const block = msg.content.find((b) => b.type === 'text');
  const raw = block && block.type === 'text' ? block.text : '';
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Array<{
    hint?: string;
    x?: number | null;
    y?: number | null;
    w?: number | null;
    h?: number | null;
  }>;
  return parsed
    .filter((row) => typeof row.hint === 'string')
    .map((row) => {
      if (
        typeof row.x !== 'number' ||
        typeof row.y !== 'number' ||
        typeof row.w !== 'number' ||
        typeof row.h !== 'number'
      ) {
        return { hint: row.hint!, box: null };
      }
      return {
        hint: row.hint!,
        box: normaliseBox({ x: row.x, y: row.y, w: row.w, h: row.h }),
      };
    });
}

/**
 * Locate region boxes for scene hints via Haiku vision.
 */
export async function locateSceneRegions(
  opts: LocateSceneRegionsOpts,
): Promise<RegionVisionResult[]> {
  const hints = opts.hints.map((h) => h.trim()).filter(Boolean);
  if (!hints.length) return [];
  const call = opts.callVision ?? defaultVisionCall;
  const vision = await call({ imageUrl: opts.imageUrl, hints });
  return applyVisionBoxes(hints, vision);
}

export type ApplySceneBoxesResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  located: number;
  flagged: number;
};

/**
 * Run vision (or reuse existing) and persist fraction boxes on a scene clip.
 */
export async function applySceneBoxesToClip(
  clipId: string,
  opts?: {
    force?: boolean;
    callVision?: LocateSceneRegionsOpts['callVision'];
  },
): Promise<ApplySceneBoxesResult> {
  if (!mongoConfigured()) {
    return { ok: false, skipped: true, reason: 'mongo_unavailable', located: 0, flagged: 0 };
  }
  await connectMongo();
  const clip = await V2MicroClipModel().findById(clipId);
  if (!clip) {
    return { ok: false, skipped: true, reason: 'not_found', located: 0, flagged: 0 };
  }
  if (clip.layout !== 'scene') {
    return { ok: false, skipped: true, reason: 'not_scene', located: 0, flagged: 0 };
  }
  const lines = clip.lines ?? [];
  if (!lines.length) {
    return { ok: false, skipped: true, reason: 'no_lines', located: 0, flagged: 0 };
  }

  const alreadyComplete =
    !opts?.force &&
    lines.every(
      (l) =>
        l.box &&
        !l.box_flagged &&
        isValidFractionBox({
          x: l.box.x,
          y: l.box.y,
          w: l.box.w,
          h: l.box.h,
        }),
    );
  if (alreadyComplete) {
    return {
      ok: true,
      skipped: true,
      reason: 'already_complete',
      located: lines.length,
      flagged: 0,
    };
  }

  const key = clip.main_image_key;
  if (!key) {
    return { ok: false, skipped: true, reason: 'no_main_key', located: 0, flagged: 0 };
  }
  const img = await getImageByKey(key);
  // Player already shows flagged/blocked images when a URL exists — locate boxes on those too.
  if (!img?.url) {
    return { ok: false, skipped: true, reason: 'main_not_ready', located: 0, flagged: 0 };
  }

  const hints = lines.map((l) => (l.region_hint ?? l.tl ?? '').trim());
  let results: RegionVisionResult[];
  try {
    results = await locateSceneRegions({
      imageUrl: img.url,
      hints,
      callVision: opts?.callVision,
    });
  } catch (err) {
    // Vision failed entirely — fall back for every line
    results = hints.map((hint, i) => ({
      hint,
      box: fallbackBoxForIndex(i, hints.length),
      flagged: true,
    }));
    void err;
  }

  let located = 0;
  let flagged = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const hit = results[i];
    if (hit?.box && isValidFractionBox(hit.box) && !hit.flagged) {
      line.box = hit.box;
      line.box_flagged = false;
      located += 1;
    } else {
      line.box = hit?.box && isValidFractionBox(hit.box)
        ? hit.box
        : fallbackBoxForIndex(i, lines.length);
      line.box_flagged = true;
      flagged += 1;
    }
  }
  clip.markModified('lines');
  await clip.save();
  return { ok: true, located, flagged };
}

/**
 * Apply boxes to all scene clips in a series that have a ready main image.
 */
export async function applySceneBoxesToSeries(opts: {
  seriesId: string;
  force?: boolean;
  callVision?: LocateSceneRegionsOpts['callVision'];
}): Promise<{ clips: number; located: number; flagged: number }> {
  if (!mongoConfigured()) {
    return { clips: 0, located: 0, flagged: 0 };
  }
  await connectMongo();
  const clips = await V2MicroClipModel()
    .find({
      series_id: opts.seriesId,
      layout: 'scene',
      status: { $in: ['ready', 'published'] },
    })
    .select({ _id: 1 })
    .lean();
  let located = 0;
  let flagged = 0;
  for (const c of clips) {
    const r = await applySceneBoxesToClip(String(c._id), {
      force: opts.force,
      callVision: opts.callVision,
    });
    located += r.located;
    flagged += r.flagged;
  }
  return { clips: clips.length, located, flagged };
}
