import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  consumeConvoTag,
  dropConvoReaction,
  parseConvoReaction,
  stripReactionQuestions,
} from '@/lib/v2/convo/output';

const CANDIDATES = ['q_right_open', 'q_left_open', 'q_straight_open'];

describe('v2 convo output · tag streaming', () => {
  it('resolves a tag split across stream chunks', () => {
    const chunks = ['[q_ri', 'ght_op', 'en] Boa!', ' Obrigada.'];
    let buf = '';
    let last = consumeConvoTag(buf, CANDIDATES);
    for (const ch of chunks) {
      buf += ch;
      last = consumeConvoTag(buf, CANDIDATES);
      if (!last.complete) {
        assert.equal(last.tag, null);
      }
    }
    assert.equal(last.complete, true);
    assert.equal(last.tag, 'q_right_open');
    assert.match(last.rest, /Boa!/);
  });

  it('maps unknown tag id to the first candidate', () => {
    const result = consumeConvoTag(
      '[q_unknown] Hmm.',
      CANDIDATES,
    );
    assert.equal(result.complete, true);
    assert.equal(result.tag, CANDIDATES[0]);
  });

  it('treats missing tag as complete with null tag', () => {
    const result = consumeConvoTag('Boa ideia.', CANDIDATES);
    assert.equal(result.complete, true);
    assert.equal(result.tag, null);
    assert.equal(result.rest, 'Boa ideia.');
  });
});

describe('v2 convo output · parse + post-checks', () => {
  it('parses tag and reaction; ok when clean', () => {
    const parsed = parseConvoReaction(
      '[q_left_open] Consegui! Obrigada.',
      CANDIDATES,
    );
    assert.equal(parsed.candidateId, 'q_left_open');
    assert.equal(parsed.reaction, 'Consegui! Obrigada.');
    assert.equal(parsed.decision, 'ok');
    assert.deepEqual(parsed.issues, []);
  });

  it('unknown id falls back to first candidate', () => {
    const parsed = parseConvoReaction(
      '[nope] Ok.',
      CANDIDATES,
    );
    assert.equal(parsed.candidateId, CANDIDATES[0]);
  });

  it('strips a question from the reaction', () => {
    assert.equal(
      stripReactionQuestions('Hmm… vejo o rio. E agora?'),
      'Hmm… vejo o rio.',
    );
    const parsed = parseConvoReaction(
      '[q_right_open] Direita? Hmm, vejo o rio?',
      CANDIDATES,
    );
    assert.ok(!parsed.reaction.includes('?'));
  });

  it('flags Brazilian leak → regenerate', () => {
    const parsed = parseConvoReaction(
      '[q_right_open] Pega o ônibus agora.',
      CANDIDATES,
    );
    assert.ok(parsed.issues.includes('brazilian'));
    assert.equal(parsed.decision, 'regenerate');
    assert.match(parsed.regenerateReason ?? '', /Brazilian/i);
  });

  it('flags English leak → regenerate', () => {
    const parsed = parseConvoReaction(
      '[q_right_open] Please turn right.',
      CANDIDATES,
    );
    assert.ok(parsed.issues.includes('english'));
    assert.equal(parsed.decision, 'regenerate');
  });

  it('flags length over 8 words → regenerate', () => {
    const parsed = parseConvoReaction(
      '[q_right_open] Eu acho que devemos ir agora para a rua longa.',
      CANDIDATES,
    );
    assert.ok(parsed.issues.includes('length'));
    assert.equal(parsed.decision, 'regenerate');
  });

  it('unknown words are marked, not rejected', () => {
    const parsed = parseConvoReaction(
      '[q_right_open] Vejo o rio.',
      CANDIDATES,
      { knownWords: ['vejo', 'o'] },
    );
    assert.equal(parsed.decision, 'ok');
    assert.ok(parsed.unknownWords.map((w) => w.toLowerCase()).includes('rio'));
  });

  it('drop clears reaction after failed regen', () => {
    const bad = parseConvoReaction(
      '[q_right_open] Please go.',
      CANDIDATES,
    );
    const dropped = dropConvoReaction(bad);
    assert.equal(dropped.decision, 'drop');
    assert.equal(dropped.reaction, '');
    assert.equal(dropped.candidateId, bad.candidateId);
  });
});
