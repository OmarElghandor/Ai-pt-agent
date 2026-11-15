import {
  getCharacter,
  voiceForCharacter,
  DEFAULT_PT_VOICE,
} from '@/lib/v2/characters/registry';
import type { RoleplaySituation } from './types';

const GENDER_VOICE = {
  m: 'pt-PT-DuarteNeural',
  f: 'pt-PT-RaquelNeural',
} as const;

export type ResolvedRoleplayCharacter = {
  name: string;
  character_id: string | null;
  voice: string;
};

/**
 * Resolve who is speaking for a situation step. Never falls back to a default
 * cast member (e.g. Inês) — uses scene `character` / `cast` / `speaker`.
 */
export function resolveRoleplaySpeaker(
  situation: RoleplaySituation,
  speaker?: string | null,
): ResolvedRoleplayCharacter {
  if (speaker && situation.cast?.length) {
    const member =
      situation.cast.find(
        (c) =>
          (c.id != null && c.id === speaker) ||
          c.name.toLowerCase() === speaker.toLowerCase(),
      ) ?? null;
    if (member) {
      if (member.id) {
        const rec = getCharacter(member.id);
        return {
          name: rec?.name ?? member.name,
          character_id: member.id,
          voice: voiceForCharacter(member.id),
        };
      }
      return {
        name: member.name,
        character_id: null,
        voice: GENDER_VOICE[member.gender] ?? DEFAULT_PT_VOICE,
      };
    }
    // Speaker string may itself be a registry id.
    const byId = getCharacter(speaker);
    if (byId) {
      return {
        name: byId.name,
        character_id: byId.id,
        voice: byId.voice,
      };
    }
  }

  const c = situation.character;
  if (c && 'id' in c && typeof c.id === 'string' && c.id) {
    const rec = getCharacter(c.id);
    if (rec) {
      return {
        name: rec.name,
        character_id: rec.id,
        voice: rec.voice,
      };
    }
    // Unknown registry id: still surface the id as the label (never Inês).
    return {
      name: c.id.charAt(0).toUpperCase() + c.id.slice(1),
      character_id: c.id,
      voice: voiceForCharacter(c.id),
    };
  }

  if (c && 'name' in c && typeof c.name === 'string') {
    const gender = c.gender === 'f' ? 'f' : 'm';
    return {
      name: c.name,
      character_id: null,
      voice: GENDER_VOICE[gender],
    };
  }

  throw new Error(
    `roleplay ${situation.id}: missing character / speaker identity`,
  );
}

/** Display name for side-channel coach lines. */
export function roleplayCharacterDisplayName(
  situation: RoleplaySituation,
): string {
  return resolveRoleplaySpeaker(situation).name;
}
