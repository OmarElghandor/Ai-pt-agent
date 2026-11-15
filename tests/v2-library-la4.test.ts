import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  editToken,
  flagConjugationMismatches,
  mergeTokensIntoChunk,
  preserveHandEditedLines,
  splitChunk,
  surfacesOf,
  type LibraryToken,
} from '../lib/v2/library/tokens';

function tok(partial: Partial<LibraryToken> & { surface: string }): LibraryToken {
  return {
    lemma: partial.lemma ?? partial.surface,
    pos: partial.pos ?? 'other',
    meaning_ar: partial.meaning_ar ?? '',
    ...partial,
  };
}

describe('LA4 · tokens hand edits', () => {
  it('rebuilding line 5 keeps a hand edit on line 3', () => {
    const existing = [
      { tokens: [tok({ surface: 'a' })] },
      { tokens: [tok({ surface: 'b' })] },
      { tokens: [tok({ surface: 'c' })] },
      {
        tokens: [tok({ surface: 'fui', lemma: 'ir', pos: 'verb', hand_edited: true })],
        tokens_hand_edited: true,
      },
      { tokens: [tok({ surface: 'e' })] },
      { tokens: [tok({ surface: 'f' })] },
    ];
    const rebuilt = new Map<number, LibraryToken[]>([
      [5, [tok({ surface: 'novo', lemma: 'novo' })]],
    ]);
    const next = preserveHandEditedLines(existing, [5], rebuilt);
    assert.equal(next[3][0].lemma, 'ir');
    assert.equal(next[3][0].hand_edited, true);
    assert.equal(next[5][0].surface, 'novo');
  });

  it('merge then split restores original surfaces', () => {
    const original = [
      tok({ surface: 'se' }),
      tok({ surface: 'faz' }),
      tok({ surface: 'favor' }),
    ];
    const merged = mergeTokensIntoChunk(original, 0, 2);
    assert.ok(merged.every((t) => t.chunk_id));
    const chunkId = merged[0].chunk_id!;
    const split = splitChunk(merged, chunkId);
    assert.deepEqual(surfacesOf(split), surfacesOf(original));
    assert.ok(split.every((t) => !t.chunk_id));
  });

  it('flagged verb shows amber (flagged true) when table disagrees', () => {
    // "falo" is pres/eu of falar; claiming pret/eu must flag (table has falei).
    const tokens = flagConjugationMismatches([
      tok({
        surface: 'falo',
        lemma: 'falar',
        pos: 'verb',
        tense: 'pret',
        person: 'eu',
      }),
    ]);
    assert.equal(tokens[0].flagged, true);
    assert.ok(tokens[0].flag_reason);
  });

  it('editToken marks hand_edited', () => {
    const next = editToken(
      [tok({ surface: 'casa', lemma: 'casa', meaning_ar: 'بيت' })],
      0,
      { lemma: 'casar', meaning_ar: 'يتزوج' },
    );
    assert.equal(next[0].lemma, 'casar');
    assert.equal(next[0].hand_edited, true);
  });
});

describe('LA4 · routes', () => {
  it('tokens route calls denyUnlessV2Admin', () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        'app/api/v2/admin/library/episodes/[slug]/tokens/route.ts',
      ),
      'utf8',
    );
    assert.match(src, /denyUnlessV2Admin/);
  });
});
