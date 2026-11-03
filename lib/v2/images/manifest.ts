import type { Item } from '@/lib/v2/content/items';
import type { LessonPack } from '@/lib/v2/content/lesson';
import type { StoryDoc } from '@/lib/v2/content/story';
import type { ImageSpec } from '@/lib/v2/generation/images/templates';
import type { ImageAspect } from './cloudinaryUrl';
import { storySceneKey } from './keys';

export type ManifestEntry = {
  key: string;
  aspect: ImageAspect;
  expectedType: ImageSpec['type'];
  itemId?: string;
  itemType?: Item['type'];
  source: 'word' | 'phrase' | 'story_scene' | 'scene_page' | 'question_ref';
};

function wordExpectedType(item: Item): ImageSpec['type'] {
  const pos =
    'pos' in item && typeof item.pos === 'string'
      ? item.pos.toLowerCase()
      : '';
  if (/adj|emotion|feeling/.test(pos)) return 'emotion';
  if (/place|loc/.test(pos)) return 'place';
  if (/verb/.test(pos)) return 'action';
  return 'object';
}

/**
 * Build the lesson image manifest from pack + story (00 §10).
 * Phrases with cards → 4:3 scene; words with cards → 1:1; story cover → 16:9.
 */
export function buildImageManifest(opts: {
  pack: LessonPack;
  story?: StoryDoc | null;
  day: number;
  targetLang?: string;
}): ManifestEntry[] {
  const targetLang = opts.targetLang ?? 'pt-PT';
  const out: ManifestEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: ManifestEntry) => {
    if (seen.has(entry.key)) return;
    seen.add(entry.key);
    out.push(entry);
  };

  for (const item of opts.pack.items ?? []) {
    if (item.has_card === false) continue;
    if (item.type === 'word') {
      push({
        key: item.id,
        aspect: '1:1',
        expectedType: wordExpectedType(item),
        itemId: item.id,
        itemType: item.type,
        source: 'word',
      });
    } else if (item.type === 'phrase') {
      push({
        key: item.id,
        aspect: '4:3',
        expectedType: 'scene',
        itemId: item.id,
        itemType: item.type,
        source: 'phrase',
      });
    } else if (item.type === 'form' || item.type === 'sentence') {
      // verbs/forms with cards → action
      if (item.type === 'form' || ('lemma' in item && item.has_card)) {
        push({
          key: item.id,
          aspect: '1:1',
          expectedType: 'action',
          itemId: item.id,
          itemType: item.type,
          source: 'word',
        });
      }
    }
  }

  if (opts.story) {
    push({
      key: storySceneKey(opts.day, opts.story.target_lang || targetLang),
      aspect: '16:9',
      expectedType: 'scene',
      source: 'story_scene',
    });
    if (opts.story.scenes?.length) {
      for (const scene of opts.story.scenes) {
        push({
          key: storySceneKey(
            opts.day,
            opts.story.target_lang || targetLang,
            scene.id,
          ),
          aspect: '16:9',
          expectedType: 'scene',
          source: 'story_scene',
        });
      }
    }
  }

  // Scene page blocks + question image_refs (≤3 extras)
  let extraRefs = 0;
  for (const page of opts.pack.pages ?? []) {
    if (!page || typeof page !== 'object') continue;
    const blocks = (page as { blocks?: unknown[] }).blocks ?? [];
    for (const b of blocks) {
      if (!b || typeof b !== 'object') continue;
      const block = b as { type?: string; image?: string };
      if (block.type === 'scene' && typeof block.image === 'string' && block.image) {
        push({
          key: block.image,
          aspect: '16:9',
          expectedType: 'scene',
          source: 'scene_page',
        });
      }
    }
  }

  const questions = (opts.pack as { questions?: { image_ref?: string; image_refs?: string[] }[] })
    .questions;
  if (Array.isArray(questions)) {
    for (const q of questions) {
      const refs = [
        ...(typeof q.image_ref === 'string' ? [q.image_ref] : []),
        ...(Array.isArray(q.image_refs) ? q.image_refs : []),
      ];
      for (const ref of refs) {
        if (!ref || seen.has(ref) || extraRefs >= 3) continue;
        push({
          key: ref,
          aspect: '4:3',
          expectedType: 'scene',
          source: 'question_ref',
        });
        extraRefs += 1;
      }
    }
  }

  return out;
}

export function aspectForManifestEntry(entry: ManifestEntry): ImageAspect {
  return entry.aspect;
}
