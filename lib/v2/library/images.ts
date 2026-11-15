import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2LibraryEpisodeModel } from '@/lib/v2/mongo/libraryModels';
import { ScriptError } from './scriptGenerate';
import { LIBRARY_LANG, type EpisodeStages } from './types';

/**
 * Library episode images (14 §2.9, 14d §2.2g).
 * Specs are built in code; generation reuses the lesson image pipeline keys.
 */

export type ImageRow = {
  key: string;
  kind: 'scene' | 'cover';
  scene?: number;
  spec: string;
  status: 'missing' | 'ready' | 'queued';
  url?: string | null;
};

export function buildImageManifest(episode: {
  slug: string;
  type: string;
  lines: { scene?: number }[];
  intro_eg?: string;
  title_ar?: string | null;
}): ImageRow[] {
  if (episode.type === 'podcast') {
    return [
      {
        key: `library.pt-PT.${episode.slug}.cover`,
        kind: 'cover',
        spec: `Generic place cover for a phone-call or conversation podcast. No place badges, no city names, no readable text. Mood from: ${episode.intro_eg ?? episode.title_ar ?? episode.slug}`,
        status: 'missing',
      },
    ];
  }
  const scenes = [
    ...new Set(
      (episode.lines ?? [])
        .map((l) => l.scene ?? 1)
        .filter((n) => Number.isInteger(n) && n >= 1),
    ),
  ].sort((a, b) => a - b);
  const list = scenes.length ? scenes : [1];
  return list.map((scene) => ({
    key: `library.pt-PT.${episode.slug}.scene-${scene}`,
    kind: 'scene' as const,
    scene,
    spec: `16:9 story scene ${scene} in a generic place. Cast mid-conversation. No place badges, no landmarks, no readable signage, no text in the image. Setup: ${episode.intro_eg ?? ''}`,
    status: 'missing' as const,
  }));
}

export async function getEpisodeImages(slug: string, lang = LIBRARY_LANG) {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 })
    .lean();
  if (!episode) throw new ScriptError('not found', 404);
  const manifest = buildImageManifest({
    slug: episode.slug,
    type: episode.type,
    lines: (episode.lines ?? []) as { scene?: number }[],
    intro_eg: episode.intro_eg ?? undefined,
    title_ar: episode.title_ar,
  });
  const stored = (episode.images ?? {}) as Record<
    string,
    { url?: string; status?: string }
  >;
  const rows = manifest.map((row) => {
    const s = stored[row.key];
    return {
      ...row,
      status: (s?.url ? 'ready' : s?.status === 'queued' ? 'queued' : 'missing') as ImageRow['status'],
      url: s?.url ?? null,
    };
  });
  const ready = rows.filter((r) => r.status === 'ready').length;
  return {
    rows,
    estimate_usd_for_missing: rows.filter((r) => r.status === 'missing').length * 0.04,
    stage:
      ready === 0
        ? 'none'
        : ready === rows.length
          ? 'ready'
          : 'partial',
  };
}

export async function setEpisodeImage(
  slug: string,
  key: string,
  patch: { url?: string; status?: string; spec?: string },
  lang = LIBRARY_LANG,
) {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 });
  if (!episode) throw new ScriptError('not found', 404);
  const images = {
    ...((episode.images as Record<string, unknown>) ?? {}),
  };
  images[key] = { ...(images[key] as object), ...patch };
  episode.images = images;
  const view = await getEpisodeImages(slug, lang);
  // recompute after write — use local
  const rows = Object.keys(images);
  void rows;
  const all = buildImageManifest({
    slug: episode.slug,
    type: episode.type,
    lines: (episode.lines ?? []) as { scene?: number }[],
    intro_eg: episode.intro_eg ?? undefined,
    title_ar: episode.title_ar,
  });
  const ready = all.filter((r) => (images[r.key] as { url?: string })?.url).length;
  episode.stages = {
    ...episode.stages,
    images: {
      status:
        ready === 0 ? 'none' : ready === all.length ? 'ready' : 'partial',
      stale: false,
      updated_at: new Date(),
    },
  } as EpisodeStages;
  episode.markModified('images');
  episode.markModified('stages');
  await episode.save();
  return view;
}
