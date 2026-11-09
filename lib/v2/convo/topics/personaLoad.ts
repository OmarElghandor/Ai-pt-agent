import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PersonasFileSchema } from './personaSchema';
import type {
  Persona,
  PersonasFile,
  ValidatePersonasResult,
} from './personaTypes';

const PERSONAS_PATH = path.join(
  process.cwd(),
  'content/v2/convo/personas.pt-PT.json',
);

let personasCached: PersonasFile | null = null;

export function validatePersonasFile(raw: unknown): ValidatePersonasResult {
  const parsed = PersonasFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
      ),
      doc: null,
    };
  }
  const personas = parsed.data.personas;
  if (Object.keys(personas).length === 0) {
    return {
      ok: false,
      issues: ['personas: expected at least one persona'],
      doc: null,
    };
  }
  return {
    ok: true,
    issues: [],
    doc: {
      target_lang: parsed.data.target_lang,
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
      personas: personas as PersonasFile['personas'],
    },
  };
}

export function loadPersonasFile(
  filePath: string = PERSONAS_PATH,
): PersonasFile {
  if (personasCached && filePath === PERSONAS_PATH) return personasCached;
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  const result = validatePersonasFile(raw);
  if (!result.ok || !result.doc) {
    throw new Error(`personas invalid: ${result.issues.join('; ')}`);
  }
  if (filePath === PERSONAS_PATH) personasCached = result.doc;
  return result.doc;
}

/** Test helper. */
export function clearPersonasCache(): void {
  personasCached = null;
}

export function personaById(
  characterId: string,
  file: PersonasFile = loadPersonasFile(),
): Persona | null {
  return file.personas[characterId] ?? null;
}

export function requirePersona(
  characterId: string,
  file: PersonasFile = loadPersonasFile(),
): Persona {
  const p = personaById(characterId, file);
  if (!p) throw new Error(`persona not found: ${characterId}`);
  return p;
}
