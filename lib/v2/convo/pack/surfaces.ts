import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { surfacesForDay } from '@/lib/v2/generation/convo/itemSurfaces';
import { packIdToDay } from './load';
import type { ConvoItemSurface } from './schema';

const DEFAULT_SURFACES_PATH = path.join(
  process.cwd(),
  'content/v2/convo/item-surfaces.json',
);

let cached: ConvoItemSurface[] | null = null;

/** Load lesson item surfaces used to validate / grade convo packs. */
export function loadConvoItemSurfaces(
  filePath: string = DEFAULT_SURFACES_PATH,
): ConvoItemSurface[] {
  if (filePath === DEFAULT_SURFACES_PATH && cached) return cached;
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as ConvoItemSurface[];
  if (filePath === DEFAULT_SURFACES_PATH) cached = raw;
  return raw;
}

/**
 * Day-scoped surfaces for pack load / ensure / start.
 * Prefer surfaces built from the published lesson (same as generation);
 * fall back to the static day-33 file when no published lesson is available.
 */
export async function resolveConvoItemSurfacesForPack(
  packId: string,
  deps?: {
    getPublished?: typeof getPublishedLesson;
    loadStatic?: typeof loadConvoItemSurfaces;
  },
): Promise<ConvoItemSurface[]> {
  const getPublished = deps?.getPublished ?? getPublishedLesson;
  const loadStatic = deps?.loadStatic ?? loadConvoItemSurfaces;
  const day = packIdToDay(packId);
  if (day != null) {
    try {
      const published = await getPublished(day);
      if (published?.pack) {
        return surfacesForDay(day, published.pack);
      }
    } catch {
      /* fall through to static */
    }
  }
  return loadStatic();
}

export function surfaceTlFor(
  surfaces: ConvoItemSurface[],
  itemId: string,
): string {
  return surfaces.find((s) => s.id === itemId)?.tl ?? itemId;
}

export function clearConvoItemSurfacesCache(): void {
  cached = null;
}
