import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  getAuthoredItemImage,
  getAuthoredStoryImage,
  type AuthoredImage,
  type ImageKind,
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
  kind: ImageKind | null;
  theme: string | null;
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

/** Drop a stale admin override so the next generate stays on authored. */
async function clearPromptOverride(key: string): Promise<void> {
  if (!mongoConfigured()) return;
  await connectMongo();
  await V2ImageModel().updateOne(
    { key },
    { $unset: { prompt_override: 1 } },
  );
}

/**
 * Resolve scene description source for one image key.
 * Priority: admin prompt_override → core-items authored → generated.
 * When `force` and authored exists: authored wins and override is cleared.
 */
export async function resolveImageScene(opts: {
  day: number;
  key: string;
  itemId?: string;
  targetLang?: string;
  /** Force regenerate: authored core-items beats prompt_override. */
  force?: boolean;
}): Promise<ResolvedImageScene> {
  const override = await readPromptOverride(opts.key);
  const authored = lookupAuthoredImage(opts);

  // Force + authored: ignore and clear stale café overrides from earlier runs.
  if (opts.force && authored) {
    if (override) await clearPromptOverride(opts.key);
    return {
      source: 'authored',
      scenePrompt: authored.prompt,
      characters: authored.characters,
      ratio: authored.ratio,
      kind: authored.kind ?? null,
      theme: authored.theme ?? null,
      authored,
      prompt_override: null,
      skipSpecs: true,
    };
  }

  if (override) {
    return {
      source: 'override',
      scenePrompt: override,
      characters: authored?.characters ?? [],
      ratio: authored?.ratio ?? null,
      kind: authored?.kind ?? null,
      theme: authored?.theme ?? null,
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
      kind: authored.kind ?? null,
      theme: authored.theme ?? null,
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
    kind: null,
    theme: null,
    authored: null,
    prompt_override: null,
    skipSpecs: false,
  };
}

function typeFromKind(
  kind: ImageKind | null | undefined,
  ratio?: AuthoredImage['ratio'] | null,
): ImageSpec['type'] {
  if (kind === 'object' || kind === 'action' || kind === 'scene') return kind;
  if (ratio === '16:9') return 'scene';
  return 'scene';
}

/** Build a stored ImageSpec shell from an authored/override scene. */
export function specFromAuthoredScene(opts: {
  scenePrompt: string;
  characters: string[];
  ratio?: AuthoredImage['ratio'] | null;
  kind?: ImageKind | null;
  theme?: string | null;
}): ImageSpec {
  const type = typeFromKind(opts.kind, opts.ratio);
  const characters = type === 'object' ? [] : opts.characters;
  return {
    type,
    subject: opts.scenePrompt.slice(0, 240),
    characters,
    intent: opts.scenePrompt.slice(0, 280),
    must_avoid: ['text', 'letters', 'numbers'],
    ...(opts.theme && type !== 'object' ? { theme: opts.theme } : {}),
  };
}
