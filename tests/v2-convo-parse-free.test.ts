import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseFreeConvoReaction,
  splitFreeReactionAr,
  stripQuestionSentences,
  visibleFreeStreamText,
} from '@/lib/v2/convo/output';

describe('v2 free chat · C5 parse', () => {
  it('splits AR: and accepts a good reaction', () => {
    const p = parseFreeConvoReaction(
      'Ah, moras em Amadora!\nAR: آه، تسكن في أمادورا!',
    );
    assert.equal(p.decision, 'ok');
    assert.equal(p.reaction, 'Ah, moras em Amadora!');
    assert.match(p.reaction_ar, /أمادورا/);
  });

  it('fails when AR line is missing', () => {
    const p = parseFreeConvoReaction('Que fixe!');
    assert.equal(p.decision, 'regenerate');
    assert.ok(p.extraIssues.includes('missing_ar'));
    assert.match(p.regenerateReason ?? '', /AR:/);
  });

  it('flags a question in the reaction and strips it', () => {
    const p = parseFreeConvoReaction(
      'Que bom! E tu?\nAR: رائع!',
    );
    assert.equal(p.decision, 'regenerate');
    assert.ok(p.extraIssues.includes('question'));
    assert.equal(p.reaction, 'Que bom!');
  });

  it('flags a sua casa as formal', () => {
    const p = parseFreeConvoReaction(
      'Ah, a sua casa é pequena!\nAR: بيتك صغير!',
    );
    assert.equal(p.decision, 'regenerate');
    assert.ok(p.extraIssues.includes('formal'));
  });

  it('splits AR marker across stream-like chunks', () => {
    const chunks = ['Ah, fixe!\n', 'AR', ': ', 'رائع!'];
    let acc = '';
    for (const c of chunks) acc += c;
    const { reaction, ar } = splitFreeReactionAr(acc);
    assert.equal(reaction, 'Ah, fixe!');
    assert.equal(ar, 'رائع!');
    assert.equal(
      visibleFreeStreamText('Ah, fixe!\nAR'),
      'Ah, fixe!',
    );
  });

  it('stripQuestionSentences removes ? sentences', () => {
    assert.equal(stripQuestionSentences('Ok. E depois? Fixe.'), 'Ok. Fixe.');
  });

  it('allows 24 words when learnerAsked', () => {
    const long =
      'Tenho uma gata a Pimenta e ela dorme no sofá todos os dias em casa.';
    assert.ok(long.split(/\s+/).length > 12);
    const bad = parseFreeConvoReaction(`${long}\nAR: قطتي.`);
    assert.equal(bad.decision, 'regenerate');
    const ok = parseFreeConvoReaction(`${long}\nAR: قطتي.`, {
      learnerAsked: true,
    });
    assert.equal(ok.decision, 'ok');
  });
});
