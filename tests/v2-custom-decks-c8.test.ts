import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('C8 · promote wiring', () => {
  it('promote module keeps same item ids and marks source promoted', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'lib/v2/decks/promote.ts'),
      'utf8',
    );
    assert.match(src, /item_ids:\s*\[\.\.\.\(src\.item_ids/);
    assert.match(src, /status:\s*'promoted'/);
    assert.match(src, /status:\s*'official'/);
    assert.match(src, /visibility:\s*'hidden'/);
  });

  it('admin promote routes exist', () => {
    const promote = readFileSync(
      path.join(
        process.cwd(),
        'app/api/v2/admin/custom-decks/[id]/promote/route.ts',
      ),
      'utf8',
    );
    assert.match(promote, /createOfficialDraftFromCustom/);
    const official = readFileSync(
      path.join(
        process.cwd(),
        'app/api/v2/admin/official-decks/[id]/route.ts',
      ),
      'utf8',
    );
    assert.match(official, /publishOfficialDeck/);
    assert.match(official, /enqueueDeckImages/);
  });
});
