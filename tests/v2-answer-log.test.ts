import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { USER_KEYED_V2_COLLECTIONS } from '../lib/v2/auth/userKeyedCollections';
import {
  ANSWER_TIME_MS_CAP,
  buildAnswerLogDoc,
  capTimeMs,
  mapAnswerSource,
  recordAnswerLog,
  setAnswerLogStore,
  type AnswerLogDoc,
} from '../lib/v2/answers/log';
import type { AnswerPayload } from '../lib/v2/answers/payload';
import {
  PRACTICE_QUESTION_BUILDER_VERSION,
  practiceQuestionId,
} from '../lib/v2/review/questions';

const UUID = () => randomUUID();

function baseClosed(
  overrides: Partial<Extract<AnswerPayload, { kind: 'closed' }>> = {},
): Extract<AnswerPayload, { kind: 'closed' }> {
  return {
    kind: 'closed',
    answer_id: UUID(),
    day: 3,
    skill: 'listening',
    option_index: 0,
    correct_index: 0,
    question_id: 'q.day3.listen.1',
    ...overrides,
  };
}

describe('practiceQuestionId', () => {
  it('returns the same id for the same inputs', () => {
    const a = practiceQuestionId({
      target_lang: 'pt-PT',
      type: 'build_sentence',
      item_ids: ['food.bread', 'food.water'],
      pattern_ids: ['pat.ser'],
      source_id: 'tpl.build.1',
    });
    const b = practiceQuestionId({
      target_lang: 'pt-PT',
      type: 'build_sentence',
      item_ids: ['food.water', 'food.bread'],
      pattern_ids: ['pat.ser'],
      source_id: 'tpl.build.1',
    });
    assert.equal(a, b);
    assert.match(a, /^pq\.[a-f0-9]{24}$/);
  });

  it('returns a new id when builder_version changes', () => {
    const a = practiceQuestionId({
      target_lang: 'pt-PT',
      type: 'fill_blank_choice',
      item_ids: ['greet.ola'],
      source_id: 'tpl.fill.1',
      builder_version: PRACTICE_QUESTION_BUILDER_VERSION,
    });
    const b = practiceQuestionId({
      target_lang: 'pt-PT',
      type: 'fill_blank_choice',
      item_ids: ['greet.ola'],
      source_id: 'tpl.fill.1',
      builder_version: `${PRACTICE_QUESTION_BUILDER_VERSION}.next`,
    });
    assert.notEqual(a, b);
  });
});

describe('capTimeMs', () => {
  it('caps at 3 minutes', () => {
    assert.equal(capTimeMs(ANSWER_TIME_MS_CAP + 50_000), ANSWER_TIME_MS_CAP);
    assert.equal(capTimeMs(12_345), 12_345);
    assert.equal(capTimeMs(-1), 0);
    assert.equal(capTimeMs(undefined), 0);
  });
});

describe('mapAnswerSource', () => {
  it('maps every existing source kind', () => {
    assert.equal(
      mapAnswerSource(baseClosed({ question_type: 'micro_check' })),
      'micro',
    );
    assert.equal(
      mapAnswerSource(baseClosed({ question_type: 'find_image' })),
      'find_image',
    );
    assert.equal(
      mapAnswerSource(baseClosed({ skill: 'grammar', question_type: 'fill_blank_choice' })),
      'grammar_check',
    );
    assert.equal(mapAnswerSource(baseClosed()), 'lesson');
    assert.equal(
      mapAnswerSource({
        kind: 'open',
        answer_id: UUID(),
        day: 3,
        skill: 'writing',
        text: 'olá',
        question_id: 'q.open.1',
      }),
      'lesson',
    );
    assert.equal(
      mapAnswerSource({
        kind: 'page_ask',
        answer_id: UUID(),
        day: 3,
        page_id: 'p1',
        step_index: 0,
        option_index: 0,
      }),
      'lesson',
    );
    assert.equal(
      mapAnswerSource({
        kind: 'page_quiz',
        answer_id: UUID(),
        day: 3,
        page_id: 'grammar.checks',
        question_id: 'gq.1',
        option_index: 0,
      }),
      'grammar_check',
    );
    assert.equal(
      mapAnswerSource({
        kind: 'card_review',
        answer_id: UUID(),
        day: 3,
        item_id: 'greet.ola',
        rating: 'easy',
      }),
      'cards',
    );
    assert.equal(
      mapAnswerSource({
        kind: 'beat',
        answer_id: UUID(),
        day: 3,
        beat_id: 'b1',
        skill: 'speaking',
        answer_source: 'text',
        text: 'olá',
      }),
      'roleplay',
    );
    assert.equal(
      mapAnswerSource({
        kind: 'scene_mistake',
        answer_id: UUID(),
        day: 3,
        session_id: 's1',
        scene_id: 'cafe',
        goal_id: 'g1',
        prompt_tl: 'x',
        learner_tl: 'y',
        corrected_tl: 'z',
        wrong: 'y',
        right: 'z',
        stopped: false,
      }),
      'roleplay',
    );
    assert.equal(
      mapAnswerSource({
        kind: 'convo',
        answer_id: UUID(),
        day: 3,
        item_id: 'greet.ola',
        rung: 'said',
      }),
      'convo',
    );
  });
});

describe('buildAnswerLogDoc + persist', () => {
  afterEach(() => {
    setAnswerLogStore(null);
  });

  it('writes exactly one entry per attempt with the right first_try', async () => {
    const rows: AnswerLogDoc[] = [];
    setAnswerLogStore({
      async insert(doc) {
        rows.push(doc);
      },
    });

    const sources: { payload: AnswerPayload; source: string; first_try: boolean }[] = [
      {
        payload: baseClosed({ question_id: 'q.lesson.1' }),
        source: 'lesson',
        first_try: true,
      },
      {
        payload: baseClosed({
          skill: 'grammar',
          question_id: 'q.gram.1',
          first_try: false,
        }),
        source: 'grammar_check',
        first_try: false,
      },
      {
        payload: baseClosed({
          question_type: 'micro_check',
          question_id: 'micro_check:3:greet.ola:pick_meaning',
          item_id: 'greet.ola',
        }),
        source: 'micro',
        first_try: true,
      },
      {
        payload: baseClosed({
          question_type: 'find_image',
          question_id: 'find_image:3:greet.ola',
          item_id: 'greet.ola',
        }),
        source: 'find_image',
        first_try: true,
      },
      {
        payload: {
          kind: 'card_review',
          answer_id: UUID(),
          day: 3,
          item_id: 'greet.ola',
          rating: 'easy',
        },
        source: 'cards',
        first_try: true,
      },
      {
        payload: {
          kind: 'beat',
          answer_id: UUID(),
          day: 3,
          beat_id: 'b1',
          skill: 'speaking',
          answer_source: 'text',
          text: 'olá',
        },
        source: 'roleplay',
        first_try: true,
      },
    ];

    for (const row of sources) {
      await recordAnswerLog({
        payload: row.payload,
        user_id: 'u1',
        local_date: '2026-11-22',
        verdict: 'correct',
        first_try: row.first_try,
        attempt: 1,
      });
    }

    // Second beat attempt → first_try false
    await recordAnswerLog({
      payload: {
        kind: 'beat',
        answer_id: UUID(),
        day: 3,
        beat_id: 'b1',
        skill: 'speaking',
        answer_source: 'text',
        text: 'olá',
      },
      user_id: 'u1',
      local_date: '2026-11-22',
      verdict: 'wrong',
      attempt: 2,
      first_try: false,
    });

    assert.equal(rows.length, sources.length + 1);
    for (let i = 0; i < sources.length; i++) {
      assert.equal(rows[i]!.source, sources[i]!.source);
      assert.equal(rows[i]!.first_try, sources[i]!.first_try);
      assert.ok(rows[i]!.question_id);
      assert.equal(rows[i]!.user_id, 'u1');
    }
    assert.equal(rows.at(-1)!.first_try, false);
    assert.equal(rows.at(-1)!.attempt, 2);
  });

  it('caps time_ms and carries error_id on a mistake', async () => {
    const rows: AnswerLogDoc[] = [];
    setAnswerLogStore({
      async insert(doc) {
        rows.push(doc);
      },
    });

    const doc = await recordAnswerLog({
      payload: {
        kind: 'open',
        answer_id: UUID(),
        day: 3,
        skill: 'writing',
        text: 'errado',
        question_id: 'q.write.1',
        item_id: 'greet.ola',
        time_ms: 999_999,
      },
      user_id: 'u1',
      local_date: '2026-11-22',
      verdict: 'wrong',
      error_id: 'err_abc',
    });

    assert.equal(doc.time_ms, ANSWER_TIME_MS_CAP);
    assert.equal(doc.error_id, 'err_abc');
    assert.equal(doc.verdict, 'wrong');
    assert.equal(rows.length, 1);
  });

  it('builds a card question_id from the item id', () => {
    const doc = buildAnswerLogDoc({
      payload: {
        kind: 'card_review',
        answer_id: UUID(),
        day: 5,
        item_id: 'food.pao',
        rating: 'hard',
        hint: true,
      },
      user_id: 'u1',
      local_date: '2026-11-22',
      verdict: 'correct',
    });
    assert.equal(doc.question_id, 'food.pao');
    assert.equal(doc.question_version, 'card');
    assert.equal(doc.hint_used, true);
    assert.equal(doc.source, 'cards');
  });
});

describe('A5 answer log', () => {
  it('includes v2_answers in the user-keyed deletion list', () => {
    assert.ok(
      (USER_KEYED_V2_COLLECTIONS as readonly string[]).includes('v2_answers'),
    );
  });

  it('does not put shared practice questions on the A5 list', () => {
    assert.ok(
      !(USER_KEYED_V2_COLLECTIONS as readonly string[]).includes(
        'v2_practice_questions',
      ),
    );
  });
});
