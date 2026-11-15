import { resolveForm } from '@/lib/v2/content/conjugations/resolve';
import type { Person, Tense } from '@/lib/v2/content/items';

/**
 * Library token analysis (14 §2.6, 14d §2.2c).
 * Pure helpers are testable without Mongo or the model.
 */

export const TOKENS_PROMPT_VERSION = 'library-tokens-v1';

export type LibraryToken = {
  surface: string;
  lemma: string;
  pos: string;
  /** Contextual MSA meaning. */
  meaning_ar: string;
  say?: string;
  tense?: string;
  person?: string;
  /** Function word: short Egyptian note instead of a card. */
  function?: boolean;
  note_eg?: string;
  /** Multi-word chunk membership (shared id across members). */
  chunk_id?: string | null;
  /** True when conjugation table disagrees. */
  flagged?: boolean;
  flag_reason?: string;
  hand_edited?: boolean;
  start?: number;
  end?: number;
};

export type LineTokens = {
  line_index: number;
  tokens: LibraryToken[];
};

const PERSONS: readonly Person[] = ['eu', 'tu', 'ele', 'nos', 'eles'];
const TENSES: readonly Tense[] = [
  'inf',
  'pres',
  'pret',
  'imperf',
  'fut',
  'cond',
  'imp',
];

function isPerson(p: string): p is Person {
  return (PERSONS as readonly string[]).includes(p);
}
function isTense(t: string): t is Tense {
  return (TENSES as readonly string[]).includes(t);
}

/**
 * Flag verbs whose claimed tense/person doesn't match the conjugation table.
 * Unknown lemmas are left unflagged (model analysis kept).
 */
export function flagConjugationMismatches(
  tokens: LibraryToken[],
): LibraryToken[] {
  return tokens.map((tok) => {
    if (tok.pos !== 'verb' || !tok.lemma || !tok.tense || !tok.person) {
      return { ...tok, flagged: false, flag_reason: undefined };
    }
    if (!isTense(tok.tense) || !isPerson(tok.person)) {
      return {
        ...tok,
        flagged: true,
        flag_reason: 'unknown tense or person',
      };
    }
    const id = `verb.${tok.lemma}:${tok.tense}:${tok.person}`;
    const resolved = resolveForm(id);
    if (!resolved) {
      // Lemma not in table — keep analysis, no flag.
      return { ...tok, flagged: false, flag_reason: undefined };
    }
    const expected = resolved.tl.normalize('NFC').toLowerCase();
    const got = tok.surface.normalize('NFC').toLowerCase();
    if (expected !== got) {
      return {
        ...tok,
        flagged: true,
        flag_reason: `table has "${resolved.tl}" for ${id}`,
      };
    }
    return { ...tok, flagged: false, flag_reason: undefined };
  });
}

/**
 * When rebuilding tokens for some lines, keep hand-edited tokens on other lines.
 * For a rebuilt line, prefer hand-edited tokens that still match by surface order
 * when the admin marked them; otherwise take the new analysis.
 */
export function mergeTokenRebuild(
  existingLines: { tokens?: LibraryToken[] }[],
  rebuilt: LineTokens[],
): { line_index: number; tokens: LibraryToken[] }[] {
  const byIndex = new Map(rebuilt.map((r) => [r.line_index, r.tokens]));
  const out: { line_index: number; tokens: LibraryToken[] }[] = [];
  const max = Math.max(
    existingLines.length - 1,
    ...rebuilt.map((r) => r.line_index),
    0,
  );
  for (let i = 0; i <= max; i++) {
    if (byIndex.has(i)) {
      const prev = existingLines[i]?.tokens ?? [];
      const next = byIndex.get(i)!;
      // Preserve hand edits on this line when surfaces still align 1:1.
      if (
        prev.length === next.length &&
        prev.every((p, k) => p.hand_edited && p.surface === next[k].surface)
      ) {
        out.push({
          line_index: i,
          tokens: prev.map((p, k) => ({
            ...next[k],
            lemma: p.lemma,
            meaning_ar: p.meaning_ar,
            chunk_id: p.chunk_id,
            hand_edited: true,
            flagged: flagConjugationMismatches([
              {
                ...next[k],
                lemma: p.lemma,
                meaning_ar: p.meaning_ar,
                tense: p.tense ?? next[k].tense,
                person: p.person ?? next[k].person,
              },
            ])[0].flagged,
            flag_reason: flagConjugationMismatches([
              {
                ...next[k],
                lemma: p.lemma,
                meaning_ar: p.meaning_ar,
                tense: p.tense ?? next[k].tense,
                person: p.person ?? next[k].person,
              },
            ])[0].flag_reason,
          })),
        });
      } else {
        out.push({
          line_index: i,
          tokens: flagConjugationMismatches(next),
        });
      }
    } else if (existingLines[i]?.tokens) {
      out.push({ line_index: i, tokens: existingLines[i].tokens! });
    }
  }
  return out;
}

/** Keep hand-edited lines untouched when only other lines are rebuilt. */
export function preserveHandEditedLines(
  existing: { tokens?: LibraryToken[]; tokens_hand_edited?: boolean }[],
  rebuiltIndexes: number[],
  newTokensByLine: Map<number, LibraryToken[]>,
): LibraryToken[][] {
  return existing.map((line, i) => {
    if (!rebuiltIndexes.includes(i)) {
      return line.tokens ?? [];
    }
    if (line.tokens_hand_edited && line.tokens?.length) {
      return line.tokens;
    }
    return flagConjugationMismatches(newTokensByLine.get(i) ?? line.tokens ?? []);
  });
}

export function editToken(
  tokens: LibraryToken[],
  index: number,
  patch: Partial<Pick<LibraryToken, 'lemma' | 'meaning_ar' | 'say' | 'tense' | 'person'>>,
): LibraryToken[] {
  if (index < 0 || index >= tokens.length) return tokens;
  const next = tokens.map((t, i) =>
    i === index ? { ...t, ...patch, hand_edited: true } : { ...t },
  );
  return flagConjugationMismatches(next);
}

/**
 * Merge tokens [from..to] inclusive into one chunk (first surface keeps lemma edits).
 */
export function mergeTokensIntoChunk(
  tokens: LibraryToken[],
  from: number,
  to: number,
): LibraryToken[] {
  if (from < 0 || to >= tokens.length || from >= to) return tokens;
  const chunkId = `chunk_${from}_${to}_${Date.now()}`;
  return tokens.map((t, i) => {
    if (i < from || i > to) return t;
    return {
      ...t,
      chunk_id: chunkId,
      hand_edited: true,
    };
  });
}

/**
 * Split a chunk: clear chunk_id on members. Surfaces stay as separate tokens.
 */
export function splitChunk(
  tokens: LibraryToken[],
  chunkId: string,
): LibraryToken[] {
  return tokens.map((t) =>
    t.chunk_id === chunkId
      ? { ...t, chunk_id: null, hand_edited: true }
      : t,
  );
}

/** After merge then split of the same range, surfaces equal the original. */
export function surfacesOf(tokens: LibraryToken[]): string[] {
  return tokens.map((t) => t.surface);
}

export function buildTokensSystem(): string {
  return `You analyse each line of a European Portuguese (pt-PT) listening script into tokens for language learners.

For every line, split the target-language text into tokens. Each token has:
- surface: the form as written in the line
- lemma: dictionary form
- pos: noun|verb|adj|adv|pron|det|prep|conj|interj|num|other
- meaning_ar: the meaning of THIS form in THIS sentence, in simple Modern Standard Arabic
- say: optional pronunciation in Arabic letters
- tense + person: for verbs only (tense: inf|pres|pret|imperf|fut|cond|imp; person: eu|tu|ele|nos|eles)
- function: true for function words (o, a, de, em, que, …) with a short note_eg in Egyptian Arabic
- chunk_id: shared string for multi-word units that should be tapped together (e.g. se faz favor); null otherwise

Return one JSON object:
{ "lines": [ { "line_index": 0, "tokens": [ ... ] } ] }

Cover every line_index given. Do not invent Portuguese content; only analyse the lines provided.`;
}

export function buildTokensUser(
  lines: { index: number; tl: string; ar: string }[],
): string {
  return `Analyse these lines:\n${JSON.stringify({ lines }, null, 2)}`;
}

export function parseTokensOutput(
  data: unknown,
  expectedIndexes: number[],
): { lines?: LineTokens[]; error?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'not an object' };
  }
  const r = data as Record<string, unknown>;
  if (!Array.isArray(r.lines)) return { error: 'no lines array' };
  const out: LineTokens[] = [];
  for (const raw of r.lines) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const idx = Number(row.line_index);
    if (!Number.isInteger(idx)) continue;
    if (!Array.isArray(row.tokens)) continue;
    const tokens: LibraryToken[] = [];
    for (const t of row.tokens) {
      if (!t || typeof t !== 'object') continue;
      const tok = t as Record<string, unknown>;
      if (typeof tok.surface !== 'string' || !tok.surface.trim()) continue;
      tokens.push({
        surface: tok.surface.trim(),
        lemma: typeof tok.lemma === 'string' ? tok.lemma.trim() : tok.surface.trim(),
        pos: typeof tok.pos === 'string' ? tok.pos.trim() : 'other',
        meaning_ar:
          typeof tok.meaning_ar === 'string' ? tok.meaning_ar.trim() : '',
        say: typeof tok.say === 'string' ? tok.say : undefined,
        tense: typeof tok.tense === 'string' ? tok.tense : undefined,
        person: typeof tok.person === 'string' ? tok.person : undefined,
        function: tok.function === true,
        note_eg: typeof tok.note_eg === 'string' ? tok.note_eg : undefined,
        chunk_id:
          typeof tok.chunk_id === 'string' ? tok.chunk_id : null,
      });
    }
    out.push({
      line_index: idx,
      tokens: flagConjugationMismatches(tokens),
    });
  }
  const got = new Set(out.map((l) => l.line_index));
  for (const i of expectedIndexes) {
    if (!got.has(i)) return { error: `missing line_index ${i}` };
  }
  return { lines: out };
}
