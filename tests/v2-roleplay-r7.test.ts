import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRoleplayModelReactionsEnabled } from '../lib/v2/flags';
import {
  buildRoleplayReactionPrompt,
  clearRoleplayLoadCache,
  createRoleplaySessionState,
  createStubRoleplayModelReaction,
  loadRoleplaySituation,
  runRoleplayTurn,
} from '../lib/v2/roleplay';

describe('roleplay R7 optional model reaction', () => {
  it('flag defaults to off', () => {
    const prev = process.env.V2_ROLEPLAY_MODEL_REACTIONS;
    delete process.env.V2_ROLEPLAY_MODEL_REACTIONS;
    assert.equal(isRoleplayModelReactionsEnabled(), false);
    if (prev != null) process.env.V2_ROLEPLAY_MODEL_REACTIONS = prev;
  });

  it('prompt is constant-size: character, step, last 2 exchanges', () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const step = cafe.steps[0];
    const prompt = buildRoleplayReactionPrompt({
      situation: cafe,
      step,
      learnerText: 'Quero pizza',
      lastExchanges: [
        { role: 'character', tl: 'Bom dia! Diga.' },
        { role: 'learner', tl: 'Quero pizza' },
        { role: 'character', tl: 'extra should be trimmed' },
      ],
    });
    assert.match(prompt, /manuel|Manuel/i);
    assert.match(prompt, /Learner just said/);
    assert.match(prompt, /Quero pizza/);
    // Only last 2 exchanges listed under Recent.
    const recent = prompt.split('Recent:\n')[1]?.split('\nLearner')[0] ?? '';
    assert.equal(recent.trim().split('\n').length, 2);
  });

  it('tier 3 off-script calls stub once when flag enabled; normal path stays 0', async () => {
    clearRoleplayLoadCache();
    const cafe = loadRoleplaySituation('rp.cafe');
    const state = createRoleplaySessionState({
      id: 'r7',
      user_id: 'u',
      situation_id: 'rp.cafe',
      tier: 3,
      first_step_id: 'order_drink',
    });
    let calls = 0;
    const stub = createStubRoleplayModelReaction('Hmm?');
    const r = await runRoleplayTurn(
      { situation: cafe, state, learnerText: 'zzzz' },
      {
        modelReactionsEnabled: true,
        modelReaction: async (input) => {
          calls += 1;
          return stub(input);
        },
      },
    );
    assert.equal(calls, 1);
    assert.equal(r.state.model_calls, 1);
    assert.ok(
      r.events.some((e) => e.type === 'character' && e.tl === 'Hmm?'),
    );

    const state2 = createRoleplaySessionState({
      id: 'r7b',
      user_id: 'u',
      situation_id: 'rp.cafe',
      tier: 1,
      first_step_id: 'order_drink',
    });
    let calls2 = 0;
    await runRoleplayTurn(
      {
        situation: cafe,
        state: state2,
        learnerText: 'Bom dia! Queria um galão, por favor.',
      },
      {
        modelReactionsEnabled: true,
        modelReaction: async () => {
          calls2 += 1;
          return 'nope';
        },
      },
    );
    assert.equal(calls2, 0);
  });
});
