import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { LessonPack } from '@/lib/v2/content/lesson';
import { editImage, generatedImagePath, saveGeneratedImage } from './openaiEdit';
import {
  buildImagePrompt,
  sizeForType,
  type ImageSpec,
} from './templates';
import { visionQa } from './visionQa';

export type ImageJobResult = {
  key: string;
  status: 'generated' | 'reused' | 'skipped' | 'flagged';
  path?: string;
  reason?: string;
};

const ASSETS_INDEX = path.join(process.cwd(), 'content/v2/assets/index.json');

type AssetsIndex = {
  keys: string[];
  style_anchor: string;
  characters: Record<string, string>;
};

function loadAssetsIndex(): AssetsIndex {
  if (!existsSync(ASSETS_INDEX)) {
    return {
      keys: [],
      style_anchor: 'content/v2/assets/style-anchor.png',
      characters: {},
    };
  }
  return JSON.parse(readFileSync(ASSETS_INDEX, 'utf8')) as AssetsIndex;
}

function saveAssetsIndex(index: AssetsIndex): void {
  writeFileSync(ASSETS_INDEX, JSON.stringify(index, null, 2) + '\n');
}

function resolvePath(relOrAbs: string): string {
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(process.cwd(), relOrAbs);
}

type SpecEntry = { key: string; spec: ImageSpec };

function collectImageSpecs(pack: LessonPack): SpecEntry[] {
  const out: SpecEntry[] = [];
  const seen = new Set<string>();

  const walk = (value: unknown) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    const media = obj.media as
      | { image?: string; image_spec?: ImageSpec }
      | undefined;
    if (media?.image && media.image_spec && !seen.has(media.image)) {
      seen.add(media.image);
      out.push({ key: media.image, spec: media.image_spec });
    }
    if (obj.image_key && obj.image_spec && typeof obj.image_key === 'string') {
      if (!seen.has(obj.image_key)) {
        seen.add(obj.image_key);
        out.push({ key: obj.image_key, spec: obj.image_spec as ImageSpec });
      }
    }
    for (const v of Object.values(obj)) walk(v);
  };

  walk(pack);
  return out;
}

/**
 * Generate images for a pack: OpenAI edits + Haiku QA (regen once).
 */
export async function generatePackImages(
  pack: LessonPack,
): Promise<{ results: ImageJobResult[]; generated: number; skipped: number; flagged: number }> {
  const index = loadAssetsIndex();
  const specs = collectImageSpecs(pack);
  const results: ImageJobResult[] = [];
  let generated = 0;
  let skipped = 0;
  let flagged = 0;

  for (const { key, spec } of specs) {
    if (index.keys.includes(key) && existsSync(generatedImagePath(key))) {
      results.push({ key, status: 'reused', path: generatedImagePath(key) });
      skipped += 1;
      continue;
    }

    const chars = spec.characters ?? [];
    const refPaths: string[] = [];
    let skipReason: string | undefined;

    if (chars.length > 0) {
      for (const id of chars) {
        const rel = index.characters[id];
        if (!rel) {
          skipReason = `no character ref path for ${id}`;
          break;
        }
        const full = resolvePath(rel);
        if (!existsSync(full)) {
          skipReason = `missing character ref: ${rel}`;
          break;
        }
        refPaths.push(full);
      }
    } else {
      const anchor = resolvePath(index.style_anchor);
      if (!existsSync(anchor)) {
        skipReason = `missing style anchor: ${index.style_anchor}`;
      } else {
        refPaths.push(anchor);
      }
    }

    if (skipReason) {
      results.push({ key, status: 'flagged', reason: skipReason });
      flagged += 1;
      continue;
    }

    const prompt = buildImagePrompt(spec);
    const size = sizeForType(spec.type);

    try {
      let buffer = await editImage({ prompt, referencePaths: refPaths, size });
      let outPath = saveGeneratedImage(key, buffer);
      let qa = await visionQa(outPath, spec);

      if (!qa.ok) {
        buffer = await editImage({ prompt, referencePaths: refPaths, size });
        outPath = saveGeneratedImage(key, buffer);
        qa = await visionQa(outPath, spec);
      }

      if (!qa.ok) {
        results.push({
          key,
          status: 'flagged',
          path: outPath,
          reason: `vision QA failed: ${JSON.stringify(qa.answers)}`,
        });
        flagged += 1;
        continue;
      }

      if (!index.keys.includes(key)) {
        index.keys.push(key);
        saveAssetsIndex(index);
      }
      results.push({ key, status: 'generated', path: outPath });
      generated += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ key, status: 'flagged', reason: msg });
      flagged += 1;
    }
  }

  return { results, generated, skipped, flagged };
}
