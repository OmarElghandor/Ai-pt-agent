import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkReplyLevel,
  loadCommonWords,
} from '@/lib/v2/convo/guard/levelGuard';

describe('conversations v4 · V6 level guard', () => {
  it('loads a common-words list', () => {
    const words = loadCommonWords();
    assert.ok(words.has('eu'));
    assert.ok(words.has('obrigado') || words.has('ola') || words.size > 50);
  });

  it('allows day-1 greetings at level 1', () => {
    const r = checkReplyLevel({
      text: 'Olá! Bom dia! Como se chama?',
      level: 1,
      extraAllowed: ['chama', 'chamo', 'nome'],
    });
    assert.equal(r.ok, true, JSON.stringify(r.offLevel));
  });

  it('flags many off-level content words', () => {
    const r = checkReplyLevel({
      text: 'Ontem fizeste bacalhau com natas no restaurante fancy?',
      level: 1,
    });
    assert.equal(r.ok, false);
    assert.ok(r.offLevel.length > 2, JSON.stringify(r.offLevel));
  });
});
