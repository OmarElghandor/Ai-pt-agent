import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildConvoPrompt,
  estimateConvoPromptTokens,
} from '@/lib/v2/convo/prompt';
import { selectConvoCandidates } from '@/lib/v2/convo/select';
import {
  createConvoSessionDoc,
  type ConvoExchange,
  type ConvoPendingQuestion,
} from '@/lib/v2/convo/session';
import {
  DAY18_PACK,
  day18ScriptSteps,
  gradeAndApply,
  surfaceTl,
} from './fixtures/convo/day18-script';

const FORBIDDEN = [
  'accepted forms',
  'coach_intro',
  'memory_trick',
  'بالبرتغالي',
  'عشان نقول',
  JSON.stringify(DAY18_PACK.groups),
];

function appendExchanges(
  prev: ConvoExchange[],
  characterTl: string,
  learnerTl: string,
): ConvoExchange[] {
  return [
    ...prev,
    { role: 'character' as const, tl: characterTl },
    { role: 'learner' as const, tl: learnerTl },
  ].slice(-3);
}

function pendingFromCandidate(
  c: { id: string; item_id: string; qkind: string },
): NonNullable<ConvoPendingQuestion> {
  const kind =
    c.qkind === 'recap'
      ? 'recap'
      : c.qkind === 'open'
        ? 'open'
        : 'choice';
  return { id: c.id, kind, item_id: c.item_id };
}

/**
 * Scripted 30-turn run: day-18 answers while available, then pad with
 * fixed-size exchanges so turn 30 still builds the six-part prompt.
 */
function runThirtyTurnPrompts(): string[] {
  let session = createConvoSessionDoc({
    id: 'prompt-budget',
    userId: 'u',
    pack: DAY18_PACK,
  });
  const script = day18ScriptSteps().filter((s) => s.kind === 'answer');
  let scriptIdx = 0;
  const prompts: string[] = [];
  let lastExchanges: ConvoExchange[] = [];

  for (let turn = 1; turn <= 30; turn++) {
    const selected = selectConvoCandidates({
      session,
      pack: DAY18_PACK,
    });

    let learnerText = 'ok';
    let pending: NonNullable<ConvoPendingQuestion> | null = null;
    let candidates = selected.candidates;

    if (selected.kind === 'help' && selected.help) {
      pending = {
        id: selected.help.question_id,
        kind: 'help',
        item_id: selected.help.item_id,
      };
      // Prefer next scripted answer for this item if any
      const step = script[scriptIdx];
      if (step && step.kind === 'answer') {
        learnerText = step.text;
        scriptIdx++;
      } else {
        learnerText = surfaceTl(selected.help.item_id);
      }
      candidates = [
        {
          id: selected.help.question_id,
          tl: selected.help.tl ?? selected.help.choice_tl ?? '…',
          item_id: selected.help.item_id,
          qkind: 'open',
        },
      ];
    } else if (candidates.length > 0) {
      const step = script[scriptIdx];
      if (
        step &&
        step.kind === 'answer' &&
        candidates.some((c) => c.id === step.pending.id)
      ) {
        pending = step.pending;
        learnerText = step.text;
        scriptIdx++;
      } else if (step && step.kind === 'answer') {
        // Script pending not in candidates — still apply script to stay on track
        pending = step.pending;
        learnerText = step.text;
        scriptIdx++;
        candidates = [
          {
            id: step.pending.id,
            tl: '…',
            item_id: step.pending.item_id,
            qkind:
              step.pending.kind === 'recap'
                ? 'recap'
                : step.pending.kind === 'open' || step.pending.kind === 'help'
                  ? 'open'
                  : 'choice',
          },
          ...candidates.slice(0, 2),
        ];
      } else {
        pending = pendingFromCandidate(candidates[0]);
        learnerText = surfaceTl(candidates[0].item_id);
      }
    } else {
      // Pad after end: keep last exchanges, fixed candidates placeholder
      candidates = [
        {
          id: 'pad_q',
          tl: 'Tudo bem?',
          item_id: 'word.right',
          qkind: 'open',
        },
      ];
      learnerText = 'sim';
    }

    const event =
      pending != null
        ? gradeAndApply(session, pending, learnerText).event
        : {
            verdict: 'correct' as const,
            item_id: 'word.right',
            question_id: 'pad_q',
            question_kind: 'open' as const,
          };

    const built = buildConvoPrompt({
      pack: DAY18_PACK,
      event,
      candidates: candidates.slice(0, 3),
      lastExchanges,
      learnerAnswer: learnerText,
      visualStateSummary:
        'Map: metro → street. Highlight: next step.',
    });
    prompts.push(built.assembled);

    if (pending) {
      const applied = gradeAndApply(session, pending, learnerText);
      session = applied.session;
      session = {
        ...session,
        candidate_history: [
          ...session.candidate_history,
          pending.id,
        ].slice(-20),
      };
      const charTl =
        candidates[0]?.tl ??
        DAY18_PACK.items[pending.item_id]?.open_questions[0]?.tl ??
        'Ok.';
      lastExchanges = appendExchanges(lastExchanges, charTl, learnerText);
      session = { ...session, last_exchanges: lastExchanges };
    } else {
      lastExchanges = appendExchanges(lastExchanges, 'Tudo bem?', learnerText);
    }
  }

  return prompts;
}

describe('v2 convo prompt', () => {
  it('emits exactly six parts in fixed order with cache flags', () => {
    const session = createConvoSessionDoc({
      id: 'p',
      userId: 'u',
      pack: DAY18_PACK,
    });
    const selected = selectConvoCandidates({ session, pack: DAY18_PACK });
    const built = buildConvoPrompt({
      pack: DAY18_PACK,
      event: {
        verdict: 'correct',
        item_id: 'word.station',
        question_id: 'q_station_choice',
        question_kind: 'choice',
        first_without_help: true,
      },
      candidates: selected.candidates,
      lastExchanges: [],
      learnerAnswer: 'estação',
    });
    assert.equal(built.parts.length, 6);
    assert.deepEqual(
      built.parts.map((p) => p.index),
      [1, 2, 3, 4, 5, 6],
    );
    assert.equal(built.parts[0].cache, true);
    assert.equal(built.parts[1].cache, true);
    assert.equal(built.parts[2].cache, false);
    assert.match(built.assembled, /character_rules/);
    assert.match(built.assembled, /estação/);
  });

  it('never contains pack dumps, accepted forms, Arabic, or coach text', () => {
    const prompts = runThirtyTurnPrompts();
    for (const p of [prompts[0], prompts[29]]) {
      for (const bad of FORBIDDEN) {
        assert.ok(
          !p.includes(bad),
          `forbidden fragment present: ${bad.slice(0, 40)}`,
        );
      }
      assert.ok(!/accepted/i.test(p));
      assert.ok(!p.includes('coach-bank'));
    }
  });

  it('turn 1 vs turn 30 token counts differ by under 10%', () => {
    const prompts = runThirtyTurnPrompts();
    assert.equal(prompts.length, 30);
    const t1 = estimateConvoPromptTokens(prompts[0]);
    const t30 = estimateConvoPromptTokens(prompts[29]);
    const delta = Math.abs(t30 - t1) / t1;
    assert.ok(
      delta < 0.1,
      `token delta ${(delta * 100).toFixed(1)}% (t1=${t1}, t30=${t30})`,
    );
  });
});
