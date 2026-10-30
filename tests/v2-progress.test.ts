import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  evaluateAnswer,
  MemoryIdempotencyStore,
  withIdempotency,
  matchAnswer,
  resolveToolId,
  parseAnswerPayload,
} from '../lib/v2/answers';
import { getGraderCallCount, resetGraderCallCount } from '../lib/v2/grader';
import {
  applyCardRating,
  applyImplicitCorrectUse,
  applyKnow,
  buildTodayQueue,
  createCardsSession,
  createItemState,
  detectWeakArea,
  endOfTomorrow,
  weakItemIdsFromErrors,
  failKnowCheck,
  isKnowCheckDue,
  markCardRated,
  reopenCardsSession,
  tryGraduate,
  weakToolAfterError,
  type CardCandidate,
  type ItemState,
  type ProgressError,
} from '../lib/v2/progress';
import { isFlashcardItem } from '../lib/v2/content/flashcards';
import type { Item } from '../lib/v2/content/items';
import {
  buildMechanicalQuestions,
  skillsForItem,
} from '../lib/v2/questions';

function makeState(
  partial: Partial<ItemState> & { item_id: string; introducedDay: number },
): ItemState {
  const base = createItemState({
    user_id: 'u1',
    item_id: partial.item_id,
    introducedDay: partial.introducedDay,
  });
  return {
    ...base,
    ...partial,
    card: { ...base.card, ...(partial.card ?? {}) },
    levels: { ...base.levels, ...(partial.levels ?? {}) },
  };
}

function candidate(
  state: ItemState,
  opts?: Partial<CardCandidate>,
): CardCandidate {
  return {
    item_id: state.item_id,
    introducedDay: state.introducedDay,
    state,
    isWeak: false,
    hasOpenReports: false,
    eligible: true,
    ...opts,
  };
}

describe('v2 progress · card mix 9/4/2', () => {
  function manyCandidates(n: number, introducedDay: number): CardCandidate[] {
    return Array.from({ length: n }, (_, i) =>
      candidate(
        makeState({
          item_id: `word.w${introducedDay}_${i}`,
          introducedDay,
          card: {
            interval: 1,
            dueAt: new Date(0).toISOString(),
            masteryLevel: 'learning',
            consecutiveCorrect: 0,
            face: 'recognize',
            knowCheckDueAt: null,
          },
        }),
      ),
    );
  }

  for (const missed of [0, 3, 30] as const) {
    it(`cap ≤15 with ${missed} missed days of backlog pressure`, () => {
      // Simulate backlog: many older due cards + recent
      const currentDay = 40;
      const recent = manyCandidates(20, currentDay - 2);
      const older = manyCandidates(50 + missed, currentDay - 20);
      const weak = manyCandidates(10, currentDay - 5).map((c) => ({
        ...c,
        isWeak: true,
      }));
      const queue = buildTodayQueue({
        currentDay,
        candidates: [...recent, ...older, ...weak],
      });
      assert.ok(queue.length <= 15);
      assert.equal(
        (queue as { backlog?: number }).backlog,
        undefined,
        'no backlog field',
      );
    });
  }

  it('frozen session stable on reopen; done stays done', () => {
    const queue = buildTodayQueue({
      currentDay: 5,
      candidates: manyCandidates(20, 4),
    });
    const session = createCardsSession({
      user_id: 'u1',
      local_date: '2026-10-27',
      queue,
    });
    const again = reopenCardsSession(session);
    assert.deepEqual(
      again.queue.map((q) => q.item_id),
      session.queue.map((q) => q.item_id),
    );
    let done = session;
    for (const q of session.queue) {
      done = markCardRated(done, q.item_id, 'easy');
    }
    assert.equal(done.status, 'done');
    const reopened = reopenCardsSession(done);
    assert.equal(reopened.status, 'done');
    assert.equal(reopened.queue.length, done.queue.length);
  });
});

describe('v2 progress · graduation', () => {
  it('needs both interval ≥ 21 and 2 situations', () => {
    let s = makeState({
      item_id: 'word.x',
      introducedDay: 1,
      card: {
        interval: 21,
        dueAt: null,
        masteryLevel: 'learning',
        consecutiveCorrect: 5,
        face: 'produce',
        knowCheckDueAt: null,
      },
      usedCorrectlyIn: ['day:2'],
    });
    s = tryGraduate(s);
    assert.equal(s.card.masteryLevel, 'learning');

    s = { ...s, usedCorrectlyIn: ['day:2', 'day:5'] };
    s = tryGraduate(s);
    assert.equal(s.card.masteryLevel, 'mastered');
  });

  it('usedCorrectlyIn only after introducedDay', () => {
    const s = makeState({ item_id: 'word.x', introducedDay: 2 });
    const onIntro = applyImplicitCorrectUse(s, {
      curriculumDay: 2,
      localDate: '2026-10-01',
    });
    assert.equal(onIntro.situationAdded, false);
    assert.equal(onIntro.cardReviewed, false);
    assert.deepEqual(onIntro.state.usedCorrectlyIn, []);

    const later = applyImplicitCorrectUse(s, {
      curriculumDay: 3,
      localDate: '2026-10-02',
    });
    assert.equal(later.situationAdded, true);
    assert.ok(later.state.usedCorrectlyIn.includes('day:3'));
  });
});

describe('v2 progress · weak areas', () => {
  it('3 agreement errors on pattern.queria_um_uma in 10 → weak', () => {
    const errs: ProgressError[] = [];
    for (let i = 0; i < 3; i++) {
      errs.push({
        user_id: 'u1',
        item_id: 'phrase.x',
        tool_id: 'pattern.queria_um_uma',
        category: 'grammar',
        scope: 'agreement',
        wrong: 'um',
        right: 'uma',
        at: new Date(i).toISOString(),
      });
    }
    assert.equal(
      detectWeakArea(errs),
      'pattern.queria_um_uma',
    );
    assert.equal(weakToolAfterError(errs), 'pattern.queria_um_uma');
  });

  it('3 errors in the last 10 mark that item weak', () => {
    const errs: ProgressError[] = [];
    for (let i = 0; i < 3; i++) {
      errs.push({
        user_id: 'u1',
        item_id: 'word.leite',
        tool_id: 'seed:word.leite',
        category: 'vocabulary',
        scope: 'forgot_word',
        wrong: '—',
        right: 'o leite',
        at: new Date(i).toISOString(),
      });
    }
    assert.deepEqual([...weakItemIdsFromErrors(errs)], ['word.leite']);
  });

  it('an 11th older error falls out of the weak window', () => {
    const errs: ProgressError[] = [];
    for (let i = 0; i < 3; i++) {
      errs.push({
        user_id: 'u1',
        item_id: 'word.old',
        tool_id: 'seed:word.old',
        category: 'vocabulary',
        scope: 'forgot_word',
        wrong: '—',
        right: 'velho',
        at: new Date(i).toISOString(),
      });
    }
    for (let i = 0; i < 10; i++) {
      errs.push({
        user_id: 'u1',
        item_id: 'word.other',
        tool_id: `other:${i}`,
        category: 'vocabulary',
        scope: 'wrong_word',
        wrong: 'a',
        right: 'b',
        at: new Date(100 + i).toISOString(),
      });
    }
    assert.equal(weakItemIdsFromErrors(errs).has('word.old'), false);
  });

  it('end of tomorrow is the last ms of the next UTC day', () => {
    const end = endOfTomorrow(new Date('2026-10-28T22:00:00Z'), 'UTC');
    assert.equal(end.toISOString(), '2026-10-29T23:59:59.999Z');
  });

  it('accent errors do not feed weak areas', () => {
    const errs: ProgressError[] = Array.from({ length: 5 }, (_, i) => ({
      user_id: 'u1',
      tool_id: 'pattern.queria_um_uma',
      category: 'spelling' as const,
      scope: 'accent',
      wrong: 'cafe',
      right: 'café',
      at: new Date(i).toISOString(),
    }));
    assert.equal(detectWeakArea(errs), null);
  });
});

describe('v2 answers · accent and closed never call grader', () => {
  beforeEach(() => resetGraderCallCount());

  it('accent-only is correct for SRS/levels and appends accent error', async () => {
    const before = getGraderCallCount();
    const state = makeState({ item_id: 'word.cafe', introducedDay: 1 });
    const result = await evaluateAnswer(
      {
        kind: 'open',
        answer_id: '22222222-2222-4222-8222-222222222222',
        day: 3,
        skill: 'writing',
        text: 'cafe',
        item_id: 'word.cafe',
        accepted: ['café'],
      },
      {
        user_id: 'u1',
        localDate: '2026-10-10',
        itemState: state,
        introducedDay: 1,
      },
    );
    assert.equal(result.correct, true);
    assert.equal(result.accent_only, true);
    assert.equal(result.called_grader, false);
    assert.equal(getGraderCallCount(), before);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]?.scope, 'accent');
    assert.equal(result.errors[0]?.category, 'spelling');
    assert.ok(result.item_state);
    assert.ok(result.item_state.levels.said >= 1);
  });

  it('listening closed answer never calls grader', async () => {
    const before = getGraderCallCount();
    const result = await evaluateAnswer(
      {
        kind: 'closed',
        answer_id: '33333333-3333-4333-8333-333333333333',
        day: 3,
        skill: 'listening',
        option_index: 0,
        correct_index: 0,
        item_id: 'word.x',
      },
      {
        user_id: 'u1',
        localDate: '2026-10-10',
        itemState: makeState({ item_id: 'word.x', introducedDay: 1 }),
      },
    );
    assert.equal(result.correct, true);
    assert.equal(result.called_grader, false);
    assert.equal(getGraderCallCount(), before);
  });

  it('matchAnswer distinguishes exact vs accent', () => {
    assert.equal(matchAnswer('café', ['café']).kind, 'exact');
    assert.equal(matchAnswer('cafe', ['café']).kind, 'accent');
    assert.equal(matchAnswer('chá', ['café']).kind, 'miss');
  });
});

describe('v2 answers · implicit review cap', () => {
  it('5× correct on day 2 leaves interval unchanged after first review', () => {
    let state = makeState({
      item_id: 'word.ola',
      introducedDay: 1,
      card: {
        interval: 1,
        dueAt: null,
        masteryLevel: 'learning',
        consecutiveCorrect: 0,
        face: 'recognize',
        knowCheckDueAt: null,
      },
    });
    const localDate = '2026-10-02';
    const first = applyImplicitCorrectUse(state, {
      curriculumDay: 2,
      localDate,
    });
    assert.equal(first.cardReviewed, true);
    const intervalAfterFirst = first.state.card.interval;
    state = first.state;

    for (let i = 0; i < 4; i++) {
      const next = applyImplicitCorrectUse(state, {
        curriculumDay: 2,
        localDate,
      });
      assert.equal(next.cardReviewed, false);
      assert.equal(next.state.card.interval, intervalAfterFirst);
      state = next.state;
    }
  });
});

describe('v2 answers · answer_id idempotency', () => {
  it('duplicate answer_id returns stored verdict without rewriting', async () => {
    const store = new MemoryIdempotencyStore();
    let writes = 0;
    const answer_id = '44444444-4444-4444-8444-444444444444';
    const run = async () => {
      writes += 1;
      return evaluateAnswer(
        {
          kind: 'closed',
          answer_id,
          day: 2,
          skill: 'reading',
          option_index: 1,
          correct_index: 1,
          item_id: 'word.x',
        },
        {
          user_id: 'u1',
          localDate: '2026-10-10',
          itemState: makeState({ item_id: 'word.x', introducedDay: 1 }),
        },
      );
    };
    const a = await withIdempotency(answer_id, store, run);
    const b = await withIdempotency(answer_id, store, run);
    assert.equal(writes, 1);
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
    assert.equal(a.verdict, b.verdict);
  });

  it('parseAnswerPayload requires uuid answer_id', () => {
    assert.equal(
      parseAnswerPayload({
        kind: 'closed',
        day: 1,
        skill: 'listening',
        option_index: 0,
        correct_index: 0,
      }),
      null,
    );
    assert.ok(
      parseAnswerPayload({
        kind: 'closed',
        answer_id: '55555555-5555-4555-8555-555555555555',
        day: 1,
        skill: 'listening',
        option_index: 0,
        correct_index: 0,
      }),
    );
  });
});

describe('v2 progress · know +21d check', () => {
  it('know graduates and schedules +21d; fail re-enters review', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    let s = makeState({ item_id: 'word.x', introducedDay: 1 });
    s = applyKnow(s, now);
    assert.equal(s.card.masteryLevel, 'mastered');
    assert.ok(s.card.knowCheckDueAt);
    const due = new Date(s.card.knowCheckDueAt!);
    assert.equal(
      Math.round((due.getTime() - now.getTime()) / 86400000),
      21,
    );
    assert.equal(isKnowCheckDue(s, now), false);
    assert.equal(isKnowCheckDue(s, due), true);

    s = failKnowCheck(s, due);
    assert.equal(s.card.masteryLevel, 'learning');
    assert.equal(s.card.knowCheckDueAt, null);
    assert.equal(s.card.interval, 0);
  });
});

describe('v2 flashcards · has_card / role', () => {
  it('has_card false and derived are not flashcards', () => {
    const setItem = {
      type: 'word',
      id: 'word.numbers_0_10',
      tl: 'zero, um, dois',
      ar: 'أرقام',
      has_card: false,
    } as Item;
    assert.equal(isFlashcardItem(setItem), false);

    const derived = {
      type: 'phrase',
      id: 'pattern.x.ex.1',
      tl: 'Queria um café',
      ar: 'عايز',
      context_eg: 'كافية',
      cloze: 'Queria',
      derived: true,
    } as Item;
    assert.equal(isFlashcardItem(derived), false);
  });

  it('heard phrases get listening+reading only', () => {
    const heard = {
      type: 'phrase',
      id: 'phrase.hear',
      tl: 'Pois não?',
      ar: 'أيوة؟',
      context_eg: 'كاشير',
      cloze: 'Pois',
      role: 'heard',
      has_card: true,
    } as Item;
    assert.deepEqual(skillsForItem(heard), ['listening', 'reading']);
    const qs = buildMechanicalQuestions([heard]);
    assert.ok(qs.every((q) => q.skill === 'listening' || q.skill === 'reading'));
  });

  it('2 open reports exclude from today mix', () => {
    const c = candidate(makeState({ item_id: 'word.x', introducedDay: 5 }), {
      hasOpenReports: true,
    });
    const queue = buildTodayQueue({
      currentDay: 5,
      candidates: [c, ...Array.from({ length: 5 }, (_, i) =>
        candidate(makeState({ item_id: `word.y${i}`, introducedDay: 5 })),
      )],
    });
    assert.ok(!queue.some((q) => q.item_id === 'word.x'));
  });
});

describe('v2 answers · tool_id', () => {
  it('resolves pattern id from example or grammar_focus', () => {
    assert.equal(
      resolveToolId({ itemId: 'pattern.queria_um_uma.ex.2' }),
      'pattern.queria_um_uma',
    );
    assert.equal(
      resolveToolId({
        itemId: 'phrase.x',
        grammarFocusId: 'pattern.queria_um_uma',
      }),
      'pattern.queria_um_uma',
    );
  });
});

describe('v2 progress · easy ladder', () => {
  it('easy advances 1→3→7→14→21', () => {
    let card = createItemState({
      user_id: 'u',
      item_id: 'w',
      introducedDay: 1,
    }).card;
    const steps = [1, 3, 7, 14, 21];
    for (const expected of steps) {
      card = applyCardRating(card, 'easy', new Date());
      assert.equal(card.interval, expected);
    }
  });
});
