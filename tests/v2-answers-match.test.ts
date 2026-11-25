import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  gradeAcceptedOpen,
  matchAnswer,
  pickCanonical,
} from '../lib/v2/answers/match';

describe('v2 answers · match accent soft-pass', () => {
  it('pickCanonical prefers the accented form', () => {
    assert.equal(pickCanonical(['Até já', 'ate ja']), 'Até já');
    assert.equal(pickCanonical(['ate ja', 'Até já']), 'Até já');
    assert.equal(pickCanonical(['ola', 'olá']), 'olá');
    assert.equal(pickCanonical(['cafe']), 'cafe');
  });

  it('stripped accepted entry still yields accent vs canonical', () => {
    const accepted = ['Até já', 'ate ja'];
    assert.equal(matchAnswer('ate ja', accepted).kind, 'accent');
    assert.equal(matchAnswer('Ate Ja', accepted).kind, 'accent');
    const graded = gradeAcceptedOpen('ate ja', accepted);
    assert.equal(graded.correct, true);
    assert.equal(graded.accent_only, true);
    assert.equal(graded.canonical, 'Até já');
  });

  it('exact accents stay exact', () => {
    const accepted = ['Até já', 'ate ja'];
    assert.equal(matchAnswer('Até já', accepted).kind, 'exact');
    assert.equal(matchAnswer('até já', accepted).kind, 'exact');
    const graded = gradeAcceptedOpen('Até já', accepted);
    assert.equal(graded.correct, true);
    assert.equal(graded.accent_only, false);
  });

  it('accent-only when accepted has only the accented form', () => {
    assert.equal(matchAnswer('cafe', ['café']).kind, 'accent');
    const graded = gradeAcceptedOpen('cafe', ['café']);
    assert.equal(graded.correct, true);
    assert.equal(graded.accent_only, true);
    assert.equal(graded.canonical, 'café');
  });

  it('real miss stays a miss', () => {
    assert.equal(matchAnswer('bom dia', ['Até já', 'ate ja']).kind, 'miss');
    const graded = gradeAcceptedOpen('bom dia', ['Até já', 'ate ja']);
    assert.equal(graded.correct, false);
    assert.equal(graded.accent_only, false);
  });
});
