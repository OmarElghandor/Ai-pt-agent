import { readFileSync } from 'node:fs';
import path from 'node:path';

export type CharacterGender = 'm' | 'f';

export type CharacterRecord = {
  id: string;
  name: string;
  role: string;
  gender: CharacterGender;
  age: string;
  home: string[];
  description: string;
  /** Fixed Azure pt-PT voice, assigned in code for life. */
  voice: string;
};

type CharactersFile = {
  note?: string;
  characters: Record<
    string,
    {
      name: string;
      role: string;
      gender: CharacterGender;
      age: string;
      home: string[];
      description: string;
    }
  >;
};

const DEFAULT_PATH = path.join(process.cwd(), 'content/v2/characters.json');

/** Fixed Azure voices — not stored in JSON. */
const VOICE_BY_ID: Record<string, string> = {
  yassin: 'pt-PT-DuarteNeural',
  carlos: 'pt-PT-DuarteNeural',
  manuel: 'pt-PT-DuarteNeural',
  tiago: 'pt-PT-Rui:MAI-Voice-2',
  ines: 'pt-PT-RaquelNeural',
  sofia: 'pt-PT-RaquelNeural',
  nour: 'pt-PT-RaquelNeural',
  rita: 'pt-PT-FernandaNeural',
  graca: 'pt-PT-FernandaNeural',
};

export const NARRATOR_VOICE = 'pt-PT-RaquelNeural';
export const DEFAULT_PT_VOICE = 'pt-PT-RaquelNeural';

let cached: CharacterRecord[] | null = null;
let cachedPath: string | null = null;

function loadFile(filePath = DEFAULT_PATH): CharactersFile {
  return JSON.parse(readFileSync(filePath, 'utf8')) as CharactersFile;
}

function buildRecords(file: CharactersFile): CharacterRecord[] {
  const out: CharacterRecord[] = [];
  for (const [id, raw] of Object.entries(file.characters ?? {})) {
    if (!raw?.name || !raw.description) continue;
    const gender = raw.gender === 'f' ? 'f' : 'm';
    const voice =
      VOICE_BY_ID[id] ??
      (gender === 'f' ? 'pt-PT-RaquelNeural' : 'pt-PT-DuarteNeural');
    out.push({
      id,
      name: raw.name,
      role: raw.role ?? 'character',
      gender,
      age: raw.age ?? '',
      home: Array.isArray(raw.home) ? raw.home.map(String) : [],
      description: raw.description,
      voice,
    });
  }
  return out;
}

export function loadCharacters(filePath = DEFAULT_PATH): CharacterRecord[] {
  if (cached && cachedPath === filePath) return cached;
  const records = buildRecords(loadFile(filePath));
  if (!records.length) {
    throw new Error(`Empty characters registry at ${filePath}`);
  }
  cached = records;
  cachedPath = filePath;
  return records;
}

/** Test helper. */
export function resetCharactersCache(): void {
  cached = null;
  cachedPath = null;
}

export function listCharacters(filePath?: string): CharacterRecord[] {
  return loadCharacters(filePath);
}

export const CHARACTER_IDS: readonly string[] = (() => {
  try {
    return loadCharacters().map((c) => c.id);
  } catch {
    return [
      'yassin',
      'ines',
      'tiago',
      'rita',
      'carlos',
      'manuel',
      'sofia',
      'graca',
      'nour',
    ];
  }
})();

export type CharacterId = string;

export function getCharacter(
  id: string,
  filePath?: string,
): CharacterRecord | null {
  const key = id === 'learner' ? 'yassin' : id.toLowerCase();
  return loadCharacters(filePath).find((c) => c.id === key) ?? null;
}

export function isRegistryCharacter(id: string): boolean {
  return getCharacter(id) != null;
}

/** Image prompt sheet line: "Name (description)". */
export function descriptionForPrompt(id: string): string {
  const c = getCharacter(id);
  if (!c) return id;
  return `${c.name} (${c.description})`;
}

/** Legacy Record shape used by older call sites. */
export function characterDescriptionsMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of loadCharacters()) {
    out[c.id] = descriptionForPrompt(c.id);
  }
  return out;
}

export function homesFor(id: string): string[] {
  return getCharacter(id)?.home ?? [];
}

export function voiceForCharacter(id: string): string {
  if (id === 'narrator') return NARRATOR_VOICE;
  return getCharacter(id)?.voice ?? DEFAULT_PT_VOICE;
}

export function genderForCharacter(id: string): CharacterGender {
  if (id === 'narrator') return 'f';
  return getCharacter(id)?.gender ?? 'm';
}

function normalizePlace(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Characters whose home matches any token in the place text (excl. yassin-only everywhere). */
export function charactersForPlace(
  place: string,
  opts?: { includeLearner?: boolean; filePath?: string },
): CharacterRecord[] {
  const hay = normalizePlace(place);
  const includeLearner = opts?.includeLearner !== false;
  const out: CharacterRecord[] = [];
  for (const c of loadCharacters(opts?.filePath)) {
    if (c.id === 'yassin') {
      if (includeLearner) out.push(c);
      continue;
    }
    const homes = c.home.map(normalizePlace);
    if (homes.some((h) => h === 'everywhere' || hay.includes(h) || h.includes(hay))) {
      out.push(c);
      continue;
    }
    // Token overlap (office ↔ office reception)
    const hayTokens = new Set(hay.split(' ').filter(Boolean));
    if (
      homes.some((h) =>
        h.split(' ').some((t) => t.length > 2 && hayTokens.has(t)),
      )
    ) {
      out.push(c);
    }
  }
  return out;
}

/** Multiline CHARACTERS block for generation system prompts. */
export function charactersPromptBlock(filePath?: string): string {
  return loadCharacters(filePath)
    .map((c) => `${c.id} — ${c.description}`)
    .join('\n');
}
