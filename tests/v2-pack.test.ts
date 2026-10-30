import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '@/lib/v2/content/items';
import {
  skillMixCounts,
  validatePracticePack,
} from '@/lib/v2/content/validatePack';
import { buildPackFromLesson } from '@/lib/v2/generation/pack/buildFromLesson';
import {
  buildReadingQuestion,
  distractorsAbsentFromArtifact,
} from '@/lib/v2/generation/pack/reading';
import type { LessonPack } from '@/lib/v2/content/lesson';
import { weakItemIdsFromErrors } from '@/lib/v2/progress/weakAreas';
import type { ProgressError } from '@/lib/v2/progress/types';
import { buildTodayQueue } from '@/lib/v2/progress/cards';
import type { CardCandidate } from '@/lib/v2/progress/types';
import { createItemState } from '@/lib/v2/progress/srs';

const items: Item[] = [
  {
    type: 'phrase',
    id: 'phrase.where_milk',
    tl: 'Onde fica o leite?',
    ar: 'فين اللبن؟',
    role: 'said',
  } as Item,
  {
    type: 'phrase',
    id: 'phrase.here',
    tl: 'Aqui.',
    ar: 'هنا.',
    role: 'heard',
  } as Item,
  {
    type: 'word',
    id: 'word.leite',
    tl: 'o leite',
    ar: 'اللبن',
  } as Item,
  {
    type: 'word',
    id: 'word.pao',
    tl: 'o pão',
    ar: 'العيش',
  } as Item,
  {
    type: 'word',
    id: 'word.queijo',
    tl: 'o queijo',
    ar: 'الجبنة',
  } as Item,
];

function fakeLesson(): LessonPack {
  return {
    lesson: {
      id: 'pt-PT.d03',
      target_lang: 'pt-PT',
      day: 3,
      kind: 'lesson',
      situation: { tl: 'No supermercado', eg: 'في السوبر ماركت' },
      pages: ['p1'],
    },
    items,
    pages: [],
    questions: [],
  } as unknown as LessonPack;
}

describe('v2 practice pack', () => {
  it('skillMixCounts always ≥1 each and sums to total', () => {
    const c = skillMixCounts(10);
    assert.equal(
      c.speaking + c.listening + c.reading + c.writing,
      10,
    );
    assert.ok(c.speaking >= 1);
    assert.ok(c.listening >= 1);
    assert.ok(c.reading >= 1);
    assert.ok(c.writing >= 1);
  });

  it('buildPackFromLesson validates with heard/said rules', () => {
    const pack = buildPackFromLesson({
      day: 3,
      lesson: fakeLesson(),
      chatCharacter: 'rita',
    });
    const result = validatePracticePack(pack, { items });
    assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
    assert.ok(pack.beats.length >= 8);
    const skills = new Set(pack.beats.map((b) => b.skill));
    assert.ok(skills.has('listening'));
    assert.ok(skills.has('reading'));
    assert.ok(skills.has('speaking'));
    assert.ok(skills.has('writing'));
  });

  it('rejects said id in prompt_ids', () => {
    const pack = buildPackFromLesson({
      day: 3,
      lesson: fakeLesson(),
    });
    pack.beats[0]!.prompt_ids = ['phrase.where_milk'];
    const result = validatePracticePack(pack, { items });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.rule === 'heard_said'));
  });

  it('reading first/last: no incorrect option may appear in the artifact', () => {
    const artifact = {
      kind: 'receipt' as const,
      lines: [
        { tl: 'o leite', ids: ['word.leite'] },
        { tl: 'o pão', ids: ['word.pao'] },
        { tl: 'o queijo', ids: ['word.queijo'] },
      ],
    };
    const built = buildReadingQuestion({
      kind: 'first',
      artifact,
      bank: items,
      optionCount: 3,
    });
    assert.ok(built);
    assert.ok(distractorsAbsentFromArtifact(artifact, built!.options));
    assert.equal(built!.options.filter((o) => o.correct).length, 1);

    const pack = buildPackFromLesson({ day: 3, lesson: fakeLesson() });
    const reading = pack.beats.find((b) => b.skill === 'reading');
    assert.ok(reading?.artifact && reading.options);
    if (/أول|آخر/.test(reading!.question_eg ?? '')) {
      assert.ok(
        distractorsAbsentFromArtifact(reading!.artifact!, reading!.options!),
      );
    }
    const result = validatePracticePack(pack, { items });
    assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));

    // Inject a bad distractor that appears on the artifact
    reading!.question_eg = 'إيه أول حاجة في الفاتورة؟';
    reading!.options = [
      { id: 'a', label: 'o leite', lang: 'tl', correct: true },
      { id: 'b', label: 'o pão', lang: 'tl', correct: false },
    ];
    reading!.artifact = artifact;
    const bad = validatePracticePack(pack, { items });
    assert.equal(bad.ok, false);
    assert.ok(bad.issues.some((i) => i.rule === 'reading_distractors'));
  });

  it('rejects Ok. as next_character_tl', () => {
    const pack = buildPackFromLesson({ day: 3, lesson: fakeLesson() });
    pack.beats[0]!.next_character_tl = 'Ok.';
    const result = validatePracticePack(pack, { items });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.rule === 'character_tl'));
  });

  it('focus errors land in weak card bucket', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    const errors: ProgressError[] = [1, 2, 3].map((n) => ({
      user_id: 'u1',
      item_id: 'word.leite',
      tool_id: 'articles.definite',
      skill: 'speaking' as const,
      category: 'grammar' as const,
      scope: 'agreement',
      wrong: 'a leite',
      right: 'o leite',
      at: new Date(now.getTime() - n * 1000).toISOString(),
    }));
    const weakIds = weakItemIdsFromErrors(errors);
    assert.ok(weakIds.has('word.leite'));

    const state = createItemState({
      user_id: 'u1',
      item_id: 'word.leite',
      introducedDay: 1,
    });
    state.card.dueAt = new Date(now.getTime() - 3600_000).toISOString();
    state.weakToolIds = ['articles.definite'];

    const candidates: CardCandidate[] = [
      {
        item_id: 'word.leite',
        introducedDay: 1,
        state,
        isWeak: true,
        hasOpenReports: false,
        eligible: true,
      },
    ];
    const mix = buildTodayQueue({
      candidates,
      now,
      currentDay: 4,
    });
    // Weak item must appear in today's mix (bucket may be weak or spill)
    assert.ok(
      mix.some((c) => c.item_id === 'word.leite'),
      `expected word.leite in mix, got ${JSON.stringify(mix)}`,
    );
    assert.ok(weakIds.has('word.leite'));
  });
});
