import {
  CHARACTER_IDS as REGISTRY_IDS,
  type CharacterId as RegistryCharacterId,
} from '@/lib/v2/characters/registry';

export const CHARACTER_IDS = REGISTRY_IDS;
export type CharacterId = RegistryCharacterId;

export const STYLE_ANCHOR_KEY = 'style_anchor';

export function characterImageKey(id: string): string {
  return `character.${id}`;
}

export function isCharacterKey(key: string): boolean {
  return key.startsWith('character.');
}

export function characterIdFromKey(key: string): string | null {
  if (!isCharacterKey(key)) return null;
  return key.slice('character.'.length) || null;
}

/** Cover scene for a day story — e.g. story.pt-PT.day-01.scene */
export function storySceneKey(
  day: number,
  targetLang = 'pt-PT',
  sceneId?: string,
): string {
  const dayPart = String(day).padStart(2, '0');
  const base = `story.${targetLang}.day-${dayPart}.scene`;
  return sceneId ? `${base}.${sceneId}` : base;
}

export function safeImageFilename(key: string): string {
  return `${key.replace(/[^a-z0-9._-]/gi, '_')}.png`;
}
