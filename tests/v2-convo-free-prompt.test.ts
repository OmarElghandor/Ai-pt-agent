import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFreeReactionPrompt,
  estimateConvoPromptTokens,
  freePromptPartsToMessages,
} from '@/lib/v2/convo/prompt';
import { requirePersona } from '@/lib/v2/convo/topics';

const LABELS = [
  'CHARACTER',
  'TOPIC',
  'EVENT',
  'NEXT LINE',
  'LAST EXCHANGES',
  'LEARNER JUST SAID',
] as const;

function samplePrompt(opts?: {
  facts?: string[];
  exchanges?: number;
  learner?: string;
}) {
  const persona = requirePersona('ines');
  const exchanges = Array.from({ length: opts?.exchanges ?? 3 }, (_, i) => ({
    role: (i % 2 === 0 ? 'character' : 'learner') as 'character' | 'learner',
    tl: i % 2 === 0 ? 'Que fixe!' : 'Moro em Amadora.',
  }));
  return buildFreeReactionPrompt({
    module: 'free',
    pack: null,
    freeTopicTitle: 'A casa',
    facts: opts?.facts ?? ['said Amadora'],
    event: {
      verdict: 'correct',
      item_id: '',
      question_id: 'casa.t1.ask',
      question_kind: 'open',
      phase: 'teaching',
    },
    eventLine: 'learner answered your question about where they live',
    candidates: [],
    lastExchanges: exchanges,
    learnerAnswer: opts?.learner ?? 'Moro em Amadora.',
    personaJson: JSON.stringify(persona),
    nextLineTl: 'É longe do centro?',
  });
}

describe('v2 free chat · C4 reaction prompt', () => {
  it('includes all six labels non-empty', () => {
    const built = samplePrompt();
    assert.equal(built.parts.length, 6);
    for (let i = 0; i < 6; i++) {
      assert.equal(built.parts[i]!.label, LABELS[i]);
      assert.ok(built.parts[i]!.text.trim().length > 0, LABELS[i]);
      assert.match(built.assembled, new RegExp(`^${LABELS[i]}$`, 'm'));
    }
    assert.match(built.parts[0]!.text, /Inês|ines/i);
    assert.match(built.parts[0]!.text, /Never ask a question/);
    assert.match(built.parts[3]!.text, /É longe do centro/);
  });

  it('turn 1 vs turn 10 token delta under 10%', () => {
    const t1 = samplePrompt({ facts: [], exchanges: 0, learner: 'Sim.' });
    const t10 = samplePrompt({
      facts: ['said a', 'said b', 'said c', 'said d', 'said e'],
      exchanges: 3,
      learner: 'Moro com a minha mulher há dois anos em Amadora.',
    });
    const m1 = freePromptPartsToMessages(t1);
    const m10 = freePromptPartsToMessages(t10);
    const n1 = estimateConvoPromptTokens(`${m1.system}\n${m1.prompt}`);
    const n10 = estimateConvoPromptTokens(`${m10.system}\n${m10.prompt}`);
    const delta = Math.abs(n10 - n1) / n1;
    assert.ok(
      delta < 0.1,
      `token delta ${(delta * 100).toFixed(1)}% (t1=${n1} t10=${n10})`,
    );
    assert.ok(n1 >= 400 && n1 <= 1200, `turn1 tokens ${n1} out of 600–900±`);
  });
});
