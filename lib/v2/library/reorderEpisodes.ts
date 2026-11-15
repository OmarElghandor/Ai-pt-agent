import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2LibraryBriefModel,
  V2LibraryEpisodeModel,
} from '@/lib/v2/mongo/libraryModels';
import { LIBRARY_LANG } from './types';

export type ReorderRow = { slug: string; sort_order: number };

export class ReorderError extends Error {}

/**
 * Pure: the level keeps the same pool of sort_order values; they are handed out
 * again in the new slug order. Other levels are never touched.
 */
export function planReorder(
  levelRows: ReorderRow[],
  slugs: string[],
): ReorderRow[] {
  if (new Set(slugs).size !== slugs.length) {
    throw new ReorderError('duplicate slugs');
  }
  const have = new Set(levelRows.map((r) => r.slug));
  if (
    slugs.length !== levelRows.length ||
    slugs.some((s) => !have.has(s))
  ) {
    throw new ReorderError('slugs must be exactly the episodes of this level');
  }
  const pool = levelRows.map((r) => r.sort_order).sort((a, b) => a - b);
  const next = slugs.map((slug, i) => ({ slug, sort_order: pool[i] }));
  return next.filter(
    (n) => levelRows.find((r) => r.slug === n.slug)!.sort_order !== n.sort_order,
  );
}

/** Reorder episodes inside one level; returns how many changed. */
export async function reorderEpisodes(
  level: number,
  slugs: string[],
  lang: string = LIBRARY_LANG,
): Promise<{ changed: number }> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new ReorderError('invalid level');
  }
  const docs = await V2LibraryEpisodeModel()
    .find({ target_lang: lang, target_level: level })
    .select('slug sort_order version')
    .lean();
  const bySlug = new Map<string, number>();
  for (const d of docs) bySlug.set(d.slug, d.sort_order);
  const updates = planReorder(
    [...bySlug].map(([slug, sort_order]) => ({ slug, sort_order })),
    slugs,
  );
  for (const u of updates) {
    // Every version of the episode moves together.
    await V2LibraryEpisodeModel().updateMany(
      { target_lang: lang, slug: u.slug },
      { $set: { sort_order: u.sort_order } },
    );
    await V2LibraryBriefModel().updateOne(
      { target_lang: lang, slug: u.slug },
      { $set: { sort_order: u.sort_order } },
    );
  }
  return { changed: updates.length };
}
