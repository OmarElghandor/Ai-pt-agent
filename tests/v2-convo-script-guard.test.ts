import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkArScript,
  checkPtScript,
  parseConvoReaction,
  parseFreeConvoReaction,
  splitFreeReactionAr,
  splitReactionAr,
} from '@/lib/v2/convo/output';

describe('v2 convo output · M2 script guard', () => {
  it('splits AR: on the same line as PT', () => {
    const { reaction, ar } = splitReactionAr(
      'Ah, já vejo! 😊 AR: آه، أرى!',
    );
    assert.equal(reaction, 'Ah, já vejo! 😊');
    assert.equal(ar, 'آه، أرى!');
  });

  it('splitFreeReactionAr matches splitReactionAr for inline AR:', () => {
    const raw = 'Ah, já vejo! 😊 AR: آه، أرى!';
    assert.deepEqual(splitFreeReactionAr(raw), splitReactionAr(raw));
  });

  it('rejects CJK in PT or AR', () => {
    const free = parseFreeConvoReaction(
      'Ah, já vejo! 😊 AR: أ،،أ终于明白了！',
    );
    assert.equal(free.decision, 'regenerate');
    assert.ok(
      free.extraIssues.includes('cjk') ||
        free.extraIssues.includes('not_arabic') ||
        free.extraIssues.includes('forbidden_script'),
    );

    const modA = parseConvoReaction(
      '[q1] Ah, já vejo! 😊 AR: أ،،أ终于明白了！',
      ['q1'],
    );
    assert.equal(modA.decision, 'regenerate');
    assert.ok(modA.scriptIssues?.length);
  });

  it('rejects Latin-only AR line', () => {
    const free = parseFreeConvoReaction('Que fixe!\nAR: wow nice');
    assert.equal(free.decision, 'regenerate');
    assert.ok(
      free.extraIssues.includes('not_arabic') ||
        free.extraIssues.includes('ar_not_arabic'),
    );
    assert.equal(checkArScript('wow nice'), 'ar_not_arabic');
  });

  it('accepts clean inline split for Module A', () => {
    const p = parseConvoReaction(
      '[q1] Ah, já vejo! 😊 AR: آه، أرى!',
      ['q1'],
    );
    assert.equal(p.decision, 'ok');
    assert.equal(p.reaction, 'Ah, já vejo! 😊');
    assert.equal(p.reaction_ar, 'آه، أرى!');
  });

  it('checkPtScript flags Cyrillic', () => {
    assert.equal(checkPtScript('Привет'), 'cyrillic');
  });
});
