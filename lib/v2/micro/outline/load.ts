import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MicroOutlineSchema,
  type MicroOutline,
  type OutlineClip,
  type OutlineSeries,
} from './schema';

export class MicroOutlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MicroOutlineError';
  }
}

export function defaultOutlinePath(targetLang = 'pt-PT'): string {
  return join(process.cwd(), 'content', 'v2', 'micro', `${targetLang}.outline.json`);
}

/**
 * Load and validate the authored micro outline.
 * Rejects any clip missing layout or level (19 M1).
 */
export function loadMicroOutline(
  path = defaultOutlinePath(),
): MicroOutline {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, 'utf8'));
  } catch (err) {
    throw new MicroOutlineError(
      `Failed to read micro outline at ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return parseMicroOutline(raw);
}

/** Validate an outline object (tests may pass fixtures without a file). */
export function parseMicroOutline(raw: unknown): MicroOutline {
  if (!raw || typeof raw !== 'object') {
    throw new MicroOutlineError('Outline must be an object');
  }
  const series = (raw as { series?: unknown }).series;
  if (!Array.isArray(series)) {
    throw new MicroOutlineError('Outline.series must be an array');
  }
  for (const s of series) {
    if (!s || typeof s !== 'object') continue;
    const clips = (s as { clips?: unknown }).clips;
    if (!Array.isArray(clips)) continue;
    for (const c of clips) {
      if (!c || typeof c !== 'object') {
        throw new MicroOutlineError('Clip must be an object');
      }
      const clip = c as Record<string, unknown>;
      if (clip.layout == null || clip.layout === '') {
        throw new MicroOutlineError(
          `Clip ${String(clip.slug ?? '?')} is missing layout`,
        );
      }
      if (clip.level == null || clip.level === '') {
        throw new MicroOutlineError(
          `Clip ${String(clip.slug ?? '?')} is missing level`,
        );
      }
    }
  }

  const parsed = MicroOutlineSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new MicroOutlineError(`Invalid micro outline: ${msg}`);
  }
  return parsed.data;
}

export function listOutlineSeries(outline: MicroOutline): OutlineSeries[] {
  return [...outline.series].sort((a, b) => a.order - b.order);
}

export function findOutlineClip(
  outline: MicroOutline,
  seriesSlug: string,
  clipSlug: string,
): { series: OutlineSeries; clip: OutlineClip } | null {
  const series = outline.series.find((s) => s.slug === seriesSlug);
  if (!series) return null;
  const clip = series.clips.find((c) => c.slug === clipSlug);
  if (!clip) return null;
  return { series, clip };
}

export function countOutlineClips(outline: MicroOutline): number {
  return outline.series.reduce((n, s) => n + s.clips.length, 0);
}
