import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  computeMasterySummary,
  masteryLineEg,
} from '../lib/v2/practice/masterySummary';
import {
  computeQuestionStats,
  shouldAutoFlagQuestion,
} from '../lib/v2/practice/questionStats';
import { resolveStepSeconds } from '../lib/v2/practice/stepTimeEstimates';
import { STEP_SECONDS } from '../lib/v2/practice/stepTimes';
import {
  computeUserLevel,
  skillCountsLineEg,
  skillPercentAdmin,
  weakestSkill,
} from '../lib/v2/practice/userLevel';
import { USER_KEYED_V2_COLLECTIONS } from '../lib/v2/auth/userKeyedCollections';

describe('v2 practice · user level (16 §9.3 / E8)', () => {
  it('level view matches a seeded answer log', () => {
    const level = computeUserLevel({
      today: '2026-11-22',
      answers: [
        {
          local_date: '2026-11-20',
          skill: 'listening',
          type: 'listen_meaning',
          first_try: true,
          verdict: 'correct',
          time_ms: 12_000,
        },
        {
          local_date: '2026-11-21',
          skill: 'listening',
          type: 'listen_meaning',
          first_try: true,
          verdict: 'wrong',
          time_ms: 18_000,
        },
        {
          // Outside last 14 (from 2026-11-09), inside prev 14
          local_date: '2026-11-08',
          skill: 'listening',
          type: 'listen_meaning',
          first_try: true,
          verdict: 'correct',
          time_ms: 10_000,
        },
        {
          local_date: '2026-11-22',
          skill: 'grammar',
          type: 'fill_blank_choice',
          first_try: true,
          verdict: 'correct',
          time_ms: 20_000,
          tests: { pattern_ids: ['pattern.ser'] },
        },
        {
          local_date: '2026-11-22',
          skill: 'building',
          type: 'build_sentence',
          first_try: true,
          verdict: 'correct',
          time_ms: 40_000,
        },
      ],
      items: [{ item_id: 'pattern.ser', stage: 2 }],
      coverage: [
        {
          lesson_day: 3,
          pairs: [
            { status: 'covered' },
            { status: 'covered' },
            { status: 'open' },
            { status: 'open' },
          ],
        },
      ],
      weak: [{ problem: 'article_gender' }],
    });

    assert.equal(level.skills.listening.last_14.first_try_correct, 1);
    assert.equal(level.skills.listening.last_14.attempts, 2);
    assert.equal(level.skills.listening.prev_14.first_try_correct, 1);
    assert.equal(level.skills.listening.prev_14.attempts, 1);
    assert.equal(level.skills.grammar.last_14.first_try_correct, 1);
    assert.equal(level.skills.writing.last_14.attempts, 1); // building → writing
    assert.equal(level.patterns['pattern.ser']?.stage, 2);
    assert.equal(level.patterns['pattern.ser']?.first_try_correct, 1);
    assert.equal(level.lessons['3']?.covered_pairs, 2);
    assert.equal(level.lessons['3']?.total_pairs, 4);
    assert.deepEqual(level.problem_ids, ['article_gender']);
    assert.equal(level.answer_count, 5);
  });

  it('admin percent exists; learner line never has %', () => {
    const stats = {
      first_try_correct: 42,
      attempts: 50,
      avg_time_ms: 0,
      by_type: {},
    };
    assert.equal(skillPercentAdmin(stats), 84);
    const line = skillCountsLineEg('استماع', stats);
    assert.match(line, /٤٢|42/);
    assert.equal(line.includes('%'), false);
    assert.equal(line.includes('٪'), false);
  });

  it('weakest skill needs 40 answers', () => {
    const thin = computeUserLevel({
      today: '2026-11-22',
      answers: Array.from({ length: 10 }, () => ({
        local_date: '2026-11-22',
        skill: 'listening',
        first_try: true,
        verdict: 'wrong',
      })),
    });
    assert.equal(weakestSkill(thin), null);

    const fat = computeUserLevel({
      today: '2026-11-22',
      answers: [
        ...Array.from({ length: 20 }, () => ({
          local_date: '2026-11-22',
          skill: 'listening',
          first_try: true,
          verdict: 'wrong',
        })),
        ...Array.from({ length: 20 }, () => ({
          local_date: '2026-11-22',
          skill: 'writing',
          first_try: true,
          verdict: 'correct',
        })),
      ],
    });
    assert.equal(weakestSkill(fat), 'listening');
  });
});

describe('v2 practice · question stats auto-flag (16 §9.3 / E8)', () => {
  it('a question with 20 first tries and 5 correct gets flagged', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => ({
        question_id: 'q.bad',
        first_try: true,
        verdict: 'correct',
        time_ms: 10_000,
        answer_key: `ok-${i}`,
      })),
      ...Array.from({ length: 15 }, (_, i) => ({
        question_id: 'q.bad',
        first_try: true,
        verdict: 'wrong',
        time_ms: 12_000,
        answer_key: i % 2 === 0 ? 'foo' : 'bar',
      })),
    ];
    const stats = computeQuestionStats('q.bad', rows);
    assert.equal(stats.first_try_total, 20);
    assert.equal(stats.first_try_correct, 5);
    assert.equal(stats.should_auto_flag, true);
    assert.equal(shouldAutoFlagQuestion(stats), true);
    assert.equal(stats.most_common_wrong, 'foo'); // 8 foo vs 7 bar
  });

  it('under 20 first tries never auto-flags', () => {
    assert.equal(
      shouldAutoFlagQuestion({ first_try_total: 19, first_try_correct: 0 }),
      false,
    );
  });
});

describe('v2 practice · home mastery + summary (16 §10 / E8)', () => {
  it('learners never see a percentage in mastery line', () => {
    const m = computeMasterySummary([
      { item_id: 'a', stage: 4, item_type: 'word' },
      { item_id: 'b', stage: 4, item_type: 'phrase' },
    ]);
    const line = masteryLineEg(m);
    assert.equal(line.includes('%'), false);
    assert.equal(line.includes('٪'), false);
    assert.match(line, /اتحفظت/);
  });

  it('custom-only items are not counted', () => {
    const m = computeMasterySummary([
      { item_id: 'ugc.pt-PT.x.noun', stage: 4, item_type: 'word' },
      { item_id: 'food.cheese', stage: 4, item_type: 'word' },
    ]);
    assert.equal(m.mastered_words, 1);
  });

  it('summary makes no query on v2_errors or v2_answers', () => {
    const src = readFileSync('lib/v2/progress/summary.ts', 'utf8');
    assert.equal(src.includes('V2Error'), false);
    assert.equal(src.includes('V2Answers'), false);
    assert.equal(src.includes('v2_errors'), false);
    assert.equal(src.includes('v2_answers'), false);
    assert.match(src, /computeMasterySummary/);
  });

  it('v2_user_level is on the A5 deletion list; question stats are not', () => {
    assert.ok(
      (USER_KEYED_V2_COLLECTIONS as readonly string[]).includes('v2_user_level'),
    );
    assert.ok(
      !(USER_KEYED_V2_COLLECTIONS as readonly string[]).includes(
        'v2_practice_question_stats',
      ),
    );
  });

  it('bakra hero CTA opens review', () => {
    const src = readFileSync('components/v2/path/PathRoadmap.tsx', 'utf8');
    assert.match(src, /bakra[\s\S]*?href: '\/review'/);
  });
});

describe('v2 practice · step time estimates (16 §2.2 / §9.3)', () => {
  it('uses user median over global over default', () => {
    assert.equal(
      resolveStepSeconds('build_sentence'),
      STEP_SECONDS.build_sentence,
    );
    assert.equal(
      resolveStepSeconds('build_sentence', {
        global: { build_sentence: 50_000 },
      }),
      50,
    );
    assert.equal(
      resolveStepSeconds('build_sentence', {
        user: { build_sentence: 28_000 },
        global: { build_sentence: 50_000 },
      }),
      28,
    );
  });
});
