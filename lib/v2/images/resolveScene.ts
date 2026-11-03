import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  getAuthoredItemImage,
  getAuthoredStoryImage,
  type AuthoredImage,
} from '@/lib/v2/generation/lesson/coreItems';
import type { ImageSpec } from '@/lib/v2/generation/images/templates';
import { V2ImageModel } from '@/lib/v2/mongo/models';
import { storySceneKey } from './keys';

export type PromptSource = 'authored' | 'generated' | 'override';

export type ResolvedImageScene = {
  source: PromptSource;
  /** Non-null when source is authored or override — skip image_specs. */
  scenePrompt: string | null;
  characters: string[];
  ratio: AuthoredImage['ratio'] | null;
  authored: AuthoredImage | null;
  prompt_override: string | null;
  skipSpecs: boolean;
};

function isStoryKey(key: string): boolean {
  return key.startsWith('story.') && key.endsWith('.scene');
}

/** Look up core-items authored image for a manifest key. */
export function lookupAuthoredImage(opts: {
  day: number;
  key: string;
  itemId?: string;
  targetLang?: string;
}): AuthoredImage | null {
  if (isStoryKey(opts.key) || opts.key === storySceneKey(opts.day, opts.targetLang)) {
    return getAuthoredStoryImage(opts.day);
  }
  const itemId = opts.itemId || opts.key;
  return getAuthoredItemImage(opts.day, itemId);
}

async function readPromptOverride(key: string): Promise<string | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2ImageModel()
    .findOne({ key })
    .select({ prompt_override: 1 })
    .lean();
  const raw = (doc as { prompt_override?: string | null } | null)?.prompt_override;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/**
 * Resolve scene description source for one image key.
 * Priority: admin prompt_override → core-items authored → generated.
 */
export async function resolveImageScene(opts: {
  day: number;
  key: string;
  itemId?: string;
  targetLang?: string;
}): Promise<ResolvedImageScene> {
  const override = await readPromptOverride(opts.key);
  const authored = lookupAuthoredImage(opts);

  if (override) {
    return {
      source: 'override',
      scenePrompt: override,
      characters: authored?.characters ?? [],
      ratio: authored?.ratio ?? null,
      authored,
      prompt_override: override,
      skipSpecs: true,
    };
  }

  if (authored) {
    return {
      source: 'authored',
      scenePrompt: authored.prompt,
      characters: authored.characters,
      ratio: authored.ratio,
      authored,
      prompt_override: null,
      skipSpecs: true,
    };
  }

  return {
    source: 'generated',
    scenePrompt: null,
    characters: [],
    ratio: null,
    authored: null,
    prompt_override: null,
    skipSpecs: false,
  };
}

/** Build a stored ImageSpec shell from an authored/override scene. */
export function specFromAuthoredScene(opts: {
  scenePrompt: string;
  characters: string[];
  ratio?: AuthoredImage['ratio'] | null;
}): ImageSpec {
  const type: ImageSpec['type'] =
    opts.ratio === '16:9' ? 'scene' : 'scene';
  return {
    type,
    subject: opts.scenePrompt.slice(0, 240),
    characters: opts.characters,
    intent: opts.scenePrompt.slice(0, 280),
    must_avoid: ['text', 'letters', 'numbers'],
  };
}
