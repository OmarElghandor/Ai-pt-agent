import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConjugationSeed, resolveForm } from '@/lib/v2/content/conjugations/resolve';
import { loadCoreItemsFile, type CoreItemsFile } from '@/lib/v2/generation/lesson/coreItems';
import { isHardPackIssue } from '@/lib/v2/generation/lesson/hardRules';
import { loadPlan, type PlanFile } from '@/lib/v2/generation/lesson/plan';
import { validatePlanCrossRefs } from '@/lib/v2/generation/lesson/planChecks';
import { runPrepareDayChain, type PrepareDayDeps } from '@/lib/v2/generation/prepare';
import type { Item } from '@/lib/v2/content/items';
import type { LessonPack, Question } from '@/lib/v2/content/lesson';
import {
  planQuestionSlots,
  validateDayQuestionQuotas,
} from '@/lib/v2/generation/lesson/questionSlots';
import type { OutlineResult } from '@/lib/v2/generation/lesson/stages/types';
import type { SavedLesson } from '@/lib/v2/generation/lesson/save';

describe('base plan files (core-items × days × conjugations)', () => {
  it('have no cross-file issues', () => {
    const issues = validatePlanCrossRefs(
      loadCoreItemsFile() as unknown as CoreItemsFile,
      loadPlan(),
      loadConjugationSeed(),
    );
    assert.deepEqual(issues, []);
  });

  it('flags a pattern day without grammar_focus and a verb missing from the table', () => {
    const core = {
      version: 1,
      lang: 'pt-PT',
      days: [
        {
          day: 1,
          is_story: false,
          recycle_ids: [],
          core_items: [
            { id: 'pattern.x', kind: 'pattern', tl: 'x + y', eg: 'x', priority: 'useful' },
            { id: 'verb.inventar', kind: 'verb', tl: 'inventar', eg: 'x', priority: 'useful' },
            { id: 'word.ab', kind: 'word', tl: 'a / b · c / d', eg: 'x', priority: 'useful' },
          ],
        },
      ],
    } as unknown as CoreItemsFile;
    const plan = { target_lang: 'pt-PT', days: [{ day: 1, generation: {} }] } as unknown as PlanFile;
    const rules = validatePlanCrossRefs(core, plan, { verbs: [] }).map((i) => i.rule);
    assert.ok(rules.includes('grammar_focus_missing'));
    assert.ok(rules.includes('verb_not_in_conjugations'));
    assert.ok(rules.includes('tl_slash_bundle'));
  });

  it('resolves forms for the verbs added on 2026-11-26 (incl. pôr and vestir-se)', () => {
    assert.equal(resolveForm('verb.trabalhar:pres:eu')?.tl, 'trabalho');
    assert.equal(resolveForm('verb.comprar:pret:eu')?.tl, 'comprei');
    assert.equal(resolveForm('verb.por:pres:ele')?.tl, 'põe');
    assert.equal(resolveForm('verb.vestir_se:pres:eu')?.tl, 'visto-me');
  });
});

describe('publish gate matches assemble', () => {
  it('only hard structure rules block', () => {
    assert.equal(isHardPackIssue({ rule: 'core_id_missing', severity: 'error' }), true);
    assert.equal(isHardPackIssue({ rule: 'pages_count', severity: 'error' }), false);
    assert.equal(isHardPackIssue({ rule: 'unknown_item_ref', severity: 'error' }), false);
    assert.equal(isHardPackIssue({ rule: 'core_id_missing', severity: 'warning' }), false);
  });
});

describe('prepare_day never publishes a half-built graph draft', () => {
  const pack = { lesson: { day: 34 }, items: [], pages: [] } as unknown as LessonPack;
  const draft: SavedLesson = {
    day: 34,
    target_lang: 'pt-PT',
    version: 2,
    status: 'draft',
    data: pack,
    meta: { text_ready: true, issues: [] },
  };
  function deps(over: Partial<PrepareDayDeps>, calls: { publish: number }): PrepareDayDeps {
    return {
      getPublished: async () => null,
      getLatest: async () => draft,
      generateDraft: async () => ({ saved: draft, pack }),
      publish: async () => {
        calls.publish += 1;
        return { lesson: { ...draft, status: 'published' } };
      },
      updateMeta: async () => {},
      authoredPackExists: () => true,
      enqueueConvo: async () => ({ jobId: 'j' }),
      waitConvoReady: async () => true,
      warmLesson: async () => undefined,
      isDevAllowed: () => true,
      ...over,
    };
  }

  it('new draft whose graph did not finish → needs_review, even with dev force', async () => {
    const calls = { publish: 0 };
    let latest: SavedLesson | null = null;
    const res = await runPrepareDayChain({
      day: 34,
      deps: deps(
        {
          getLatest: async () => latest,
          generateDraft: async () => {
            latest = draft;
            return { saved: draft, pack, complete: false };
          },
        },
        calls,
      ),
    });
    assert.equal(res.status, 'needs_review');
    assert.equal(calls.publish, 0);
  });

  it('existing draft with an unfinished graph → needs_review', async () => {
    const calls = { publish: 0 };
    const res = await runPrepareDayChain({
      day: 34,
      deps: deps({ ensureDraftComplete: async () => false }, calls),
    });
    assert.equal(res.status, 'needs_review');
    assert.equal(calls.publish, 0);
  });

  it('complete draft still publishes', async () => {
    const calls = { publish: 0 };
    const res = await runPrepareDayChain({
      day: 34,
      deps: deps({ ensureDraftComplete: async () => true }, calls),
    });
    assert.equal(res.status, 'ready');
    assert.equal(calls.publish, 1);
  });
});


describe('question planner keeps skill minimums', () => {
  const ph = (id: string, tl: string): Item =>
    ({ type: 'phrase', id, tl, ar: 'x', context_eg: 'x', cloze: tl.split(' ')[0]!.replace(/[!?.]/g, '') }) as Item;
  const w = (id: string, tl: string): Item => ({ type: 'word', id, tl, ar: 'x' }) as Item;
  const pat = (id: string, tl: string, exTl: string[]): Item[] => [
    { type: 'pattern', id, tl, ar: 'x', examples: exTl.map((_, i) => `${id}.ex.${i + 1}`) } as Item,
    ...exTl.map((t, i) => ({ ...ph(`${id}.ex.${i + 1}`, t), derived: true }) as Item),
  ];
  // Day 7 (story day) bank from the failing run: recycle only, no core ids.
  const day7: Item[] = [
    ph('phrase.hello', 'Olá!'),
    ph('phrase.my_name_is', 'Chamo-me Omar.'),
    ph('phrase.how_are_you', 'Tudo bem?'),
    ph('phrase.how_are_you_formal', 'Como está?'),
    ph('phrase.anything_else', 'Mais alguma coisa?'),
    ph('phrase.youre_welcome', 'De nada.'),
    w('word.coffee', 'o café'),
    w('word.galao', 'o galão'),
    w('word.water', 'a água'),
    w('word.milk', 'o leite'),
    ...pat('pattern.chamo_me', 'Chamo-me', ['Chamo-me Omar.', 'Chamo-me Inês.', 'Chamo-me Rita.', 'Chamo-me Manuel.']),
    ...pat('pattern.article_gender', 'o café', ['o café', 'o galão', 'a água', 'o leite']),
  ];
  const outline = {
    items: day7,
    pages: [
      { index: 0, page_id: 'p0', preset: 'story', mode: 'static', role: 'intro', title: 's', purpose: 's', introduces: [], assumes: [], handoff: '' },
    ],
  } as unknown as OutlineResult;

  it('story day: recycle patterns get 1 question each, speaking ≥3 (day 7 failure)', () => {
    const { slots } = planQuestionSlots({ outline, items: day7, priorityIds: [], preferBuildSentenceFor: ['pattern.chamo_me'] });
    const asQ = slots.map((s, i) => ({ id: `q${i}`, type: s.type, skill: s.skill, tests: [s.tests] })) as unknown as Question[];
    const quota = validateDayQuestionQuotas(asQ, [], { items: day7, plannedCount: slots.length });
    assert.deepEqual(quota.fatals, []);
    assert.ok(slots.filter((s) => s.skill === 'speaking').length >= 3);
    assert.ok(slots.filter((s) => s.skill === 'grammar').length <= 3);
  });
});
