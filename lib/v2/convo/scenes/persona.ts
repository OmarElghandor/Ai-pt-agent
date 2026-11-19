import { getCharacter } from '@/lib/v2/characters/registry';
import type { Persona } from '@/lib/v2/convo/topics/personaTypes';
import { personaById } from '@/lib/v2/convo/topics/personaLoad';

/**
 * Scene prompt persona: keep name / voice / style, drop the friend's own
 * facts_tl (Rita is a cashier in one scene and a ticket clerk in another).
 * Role comes from scene.place in the TOPIC block.
 */
export function personaJsonForScene(persona: Persona): string {
  const { facts_tl: _facts, ...rest } = persona;
  return JSON.stringify(rest);
}

/**
 * Build CHARACTER JSON for a scene cast id.
 * Prefer the cast record (name/gender); fall back to a friend persona with
 * facts_tl stripped. Never invent workplace facts here.
 */
export function sceneCharacterPersonaJson(characterId: string): string {
  const cast = getCharacter(characterId);
  if (cast) {
    return JSON.stringify({
      id: cast.id,
      name: cast.name,
      gender: cast.gender,
      voice: cast.voice,
    });
  }
  const persona = personaById(characterId);
  if (persona) return personaJsonForScene(persona);
  return JSON.stringify({
    id: characterId,
    name: characterId,
  });
}
