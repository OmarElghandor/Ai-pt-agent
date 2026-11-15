import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countSentences,
  parseRoleplayActorOutput,
} from '../lib/v2/roleplay/parse';
import {
  guardRoleplayActorTurn,
  isRealRoleplayAttempt,
  matchRoleplayOptionValue,
} from '../lib/v2/roleplay/guard';
import {
  clearRoleplayLoadCache,
  createStubRoleplayActor,
  loadRoleplaySituation,
} from '../lib/v2/roleplay';

describe('roleplay actor parse + guards', () => {
  it('parses PT + AR: + BEAT: done option', () => {
    const p = parseRoleplayActorOutput(
      'Um café? Claro! Mais alguma coisa?\nAR: قهوة؟ تمام!\nBEAT: done café',
    );
    assert.equal(p.tl, 'Um café? Claro! Mais alguma coisa?');
    assert.ok(p.ar.includes('قهوة'));
    assert.equal(p.beat.kind, 'done');
    if (p.beat.kind === 'done') assert.equal(p.beat.option, 'café');
  });

  it('parses BEAT: open', () => {
    const p = parseRoleplayActorOutput('Desculpe, o quê?\nAR: إيه؟\nBEAT: open');
    assert.equal(p.beat.kind, 'open');
  });

  it('counts sentences', () => {
    assert.equal(countSentences('One. Two.'), 2);
    assert.equal(countSentences('One. Two. Three!'), 3);
  });

  it('rejects empty / too many sentences / CJK', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    assert.equal(guardRoleplayActorTurn({ tl: '', situation: cafe }).ok, false);
    assert.equal(
      guardRoleplayActorTurn({
        tl: 'One. Two. Three. Four.',
        situation: cafe,
      }).reason,
      'sentences',
    );
    assert.equal(
      guardRoleplayActorTurn({
        tl: 'Um café? Claro! Mais alguma coisa?',
        situation: cafe,
      }).ok,
      true,
    );
    assert.equal(
      guardRoleplayActorTurn({
        tl: 'Olhe, é tudo fresquinho!',
        situation: cafe,
      }).reason,
      'closed',
    );
    assert.equal(
      guardRoleplayActorTurn({
        tl: '你好世界朋友',
        situation: cafe,
      }).reason,
      'script',
    );
  });

  it('sim is not a real attempt on order_drink; café option matches', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const step = cafe.steps.find((s) => s.id === 'order_drink')!;
    assert.equal(isRealRoleplayAttempt('sim', step), false);
    assert.equal(isRealRoleplayAttempt('quero um coffee', step), true);
    assert.equal(matchRoleplayOptionValue(step, 'café'), 'café');
    assert.equal(matchRoleplayOptionValue(step, 'pizza'), null);
  });

  it('stub actor can simulate timeout', async () => {
    const actor = createStubRoleplayActor({ reply: 'x', timeout: true });
    const r = await actor.generate('prompt');
    assert.equal(r.timedOut, true);
    assert.equal(r.text, '');
  });
});
