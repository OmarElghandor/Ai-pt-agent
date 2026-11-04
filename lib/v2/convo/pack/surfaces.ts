import { readFileSync } from 'node:fs';
import path from 'node:path';
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

export function surfaceTlFor(
  surfaces: ConvoItemSurface[],
  itemId: string,
): string {
  return surfaces.find((s) => s.id === itemId)?.tl ?? itemId;
}

export function clearConvoItemSurfacesCache(): void {
  cached = null;
}
