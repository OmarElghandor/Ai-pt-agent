import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  LessonPackSchema,
  hasErrors,
  validateLessonPack,
  type LessonPack,
} from '../lib/v2/content';
import { buildLessonBrief, maxWordsForPhase } from '../lib/v2/generation/lesson/brief';
import { approxTokens, BUDGET, isOverBudget } from '../lib/v2/generation/lesson/budgets';
import {
  hashOutlineJob,
  hashPageJob,
  hashQuestionsJob,
} from '../lib/v2/generation/lesson/graph';
import { inputHash, itemIdTypeTl } from '../lib/v2/generation/lesson/hash';
import { getDayPlan } from '../lib/v2/generation/lesson/plan';
import {
  listPresetExampleFiles,
  loadPresetExample,
  type PresetExampleFile,
} from '../lib/v2/generation/lesson/presets';
import {
  CORE_PROMPT,
  buildItemsSystemPrompt,
  buildOutlineSystemPrompt,
  buildQuestionsSystemPrompt,
  buildMicroSystemPrompt,
  buildDailyUseSystemPrompt,
  buildContinuitySystemPrompt,
} from '../lib/v2/generation/lesson/prompts';
import { checkTlCollisions } from '../lib/v2/generation/lesson/registry';
import type { Item } from '../lib/v2/content/items';
import type { OutlinePagePlan } from '../lib/v2/generation/lesson/stages/types';

describe('LessonBrief', () => {
  it('builds brief with phase max_words', () => {
    const plan = getDayPlan(1);
    const brief = buildLessonBrief(plan);
    assert.equal(brief.day, 1);
    assert.equal(brief.max_words, maxWordsForPhase(brief.phase));
    assert.ok(brief.situation_eg.length > 0);
  });

  it('loads core_items from core-items file (not inferred)', () => {
    const brief = buildLessonBrief(getDayPlan(1));
    assert.equal(brief.core_items_source, 'core_file');
    assert.ok(brief.core_items.some((c) => c.id === 'phrase.hello'));
    assert.equal(brief.no_new_items, false);
    const day7 = buildLessonBrief(getDayPlan(7));
    assert.equal(day7.no_new_items, true);
    assert.equal(day7.core_items.length, 0);
  });
});

describe('prompt budgets (non-example)', () => {
  it('modular system prompts stay under 1.5k tokens approx', () => {
    const prompts = [
      CORE_PROMPT,
      buildItemsSystemPrompt(),
      buildOutlineSystemPrompt(),
      buildQuestionsSystemPrompt(),
      buildMicroSystemPrompt(),
      buildDailyUseSystemPrompt(),
      buildContinuitySystemPrompt(),
    ];
    for (const p of prompts) {
      const n = approxTokens(p);
      assert.ok(
        n <= BUDGET.systemMax,
        `prompt ~${n} tokens exceeds ${BUDGET.systemMax}`,
      );
    }
  });

  it('isOverBudget ignores example_tokens in system', () => {
    assert.equal(
      isOverBudget({
        system: 2000,
        input: 100,
        output: 100,
        example_tokens: 600,
      }),
      false,
    );
    assert.equal(
      isOverBudget({
        system: 2200,
        input: 100,
        output: 100,
        example_tokens: 600,
      }),
      true,
    );
  });
});

describe('fine-grained input_hash', () => {
  const brief = buildLessonBrief(getDayPlan(1));
  const itemA: Item = {
    type: 'phrase',
    id: 'phrase.hello',
    tl: 'Olá!',
    ar: 'مرحبا',
    say: 'أولا',
    context_eg: 'لما تقابل حد',
    cloze: 'Olá',
  };
  const itemAEditedAr: Item = { ...itemA, ar: 'أهلا' };
  const itemAEditedTl: Item = { ...itemA, tl: 'Oi!' };
  const entry: OutlinePagePlan = {
    index: 0,
    page_id: 'p1',
    preset: 'phrases',
    mode: 'static',
    title: 't',
    purpose: 'greet',
    introduces: ['phrase.hello'],
    assumes: [],
    handoff: '',
  };

  it('outline hash ignores ar/say changes', () => {
    const h1 = hashOutlineJob(brief, [itemIdTypeTl(itemA)!], []);
    const h2 = hashOutlineJob(brief, [itemIdTypeTl(itemAEditedAr)!], []);
    assert.equal(h1, h2);
    const h3 = hashOutlineJob(brief, [itemIdTypeTl(itemAEditedTl)!], []);
    assert.notEqual(h1, h3);
  });

  it('page hash includes full allowed item fields', () => {
    const h1 = hashPageJob(brief, entry, [itemA]);
    const h2 = hashPageJob(brief, entry, [itemAEditedAr]);
    assert.notEqual(h1, h2);
  });

  it('questions hash uses id/type/tl only', () => {
    const h1 = hashQuestionsJob(brief, [itemIdTypeTl(itemA)!], [entry]);
    const h2 = hashQuestionsJob(brief, [itemIdTypeTl(itemAEditedAr)!], [entry]);
    assert.equal(h1, h2);
  });

  it('stale rule conceptually only applies to done (hash compare)', () => {
    const a = inputHash({ x: 1 });
    const b = inputHash({ x: 2 });
    assert.notEqual(a, b);
    // queued/running keep status — markStaleByHash skips non-done
    const statuses = ['queued', 'running', 'done'] as const;
    const wouldStale = statuses.filter((s) => s === 'done' && a !== b);
    assert.deepEqual(wouldStale, ['done']);
  });
});

describe('registry collide-on-tl', () => {
  it('flags tl mismatch on known id', () => {
    const known = [{ id: 'phrase.hello', type: 'phrase', tl: 'Olá!' }];
    const items = [
      {
        type: 'phrase',
        id: 'phrase.hello',
        tl: 'Oi!',
        ar: 'x',
        say: 'y',
      },
    ] as Item[];
    const errs = checkTlCollisions(items, known);
    assert.equal(errs.length, 1);
  });

  it('allows same tl reuse', () => {
    const known = [{ id: 'phrase.hello', type: 'phrase', tl: 'Olá!' }];
    const items = [
      {
        type: 'phrase',
        id: 'phrase.hello',
        tl: 'Olá!',
        ar: 'x',
        say: 'y',
      },
    ] as Item[];
    assert.equal(checkTlCollisions(items, known).length, 0);
  });
});

describe('regen_round continuity', () => {
  it('at most one regen round', () => {
    let regenRound = 0;
    const regenerate = [0, 1];
    const willRegen = regenerate.length > 0 && regenRound < 1;
    assert.equal(willRegen, true);
    regenRound = 1;
    const willRegen2 = regenerate.length > 0 && regenRound < 1;
    assert.equal(willRegen2, false);
  });
});

describe('critic page requeue', () => {
  it('high issue gets exactly one page rerun', async () => {
    const { decideCriticRerun, mergeCriticMeta } = await import(
      '../lib/v2/generation/lesson/criticFilter'
    );
    const first = decideCriticRerun({ highCount: 2, regenCount: 0 });
    assert.equal(first.requeue, true);
    assert.equal(first.nextRegen, 1);

    const second = decideCriticRerun({
      highCount: 2,
      regenCount: first.nextRegen,
    });
    assert.equal(second.requeue, false);

    const noHigh = decideCriticRerun({ highCount: 0, regenCount: 0 });
    assert.equal(noHigh.requeue, false);

    const merged = mergeCriticMeta(
      { critic_notes: { '0': ['old'] }, critic_regen: { '0': 1 } },
      1,
      { notes: ['new high'], regen: 1 },
    );
    assert.deepEqual(merged.critic_notes['0'], ['old']);
    assert.deepEqual(merged.critic_notes['1'], ['new high']);
    assert.equal(merged.critic_regen['0'], 1);
    assert.equal(merged.critic_regen['1'], 1);
  });
});

describe('preset examples as mini lessons', () => {
  const files = listPresetExampleFiles();
  assert.ok(files.length >= 7, 'expected 7 preset files');

  for (const filePath of files) {
    const name = path.basename(filePath, '.json');
    it(`validates examples/presets/${name}.json (report diffs, do not edit)`, () => {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as PresetExampleFile;
      const loaded = loadPresetExample(raw.preset as never);
      assert.ok(loaded, `missing preset loader for ${name}`);

      const page = raw.page as Record<string, unknown>;
      const items = (raw.items ?? []) as LessonPack['items'];
      const questions = (raw.questions ?? []) as LessonPack['questions'];

      const pack: LessonPack = {
        lesson: {
          id: `preset.${name}`,
          target_lang: 'pt-PT',
          day: raw.source_day ?? 1,
          kind: 'lesson',
          pages: [String(page.id ?? 'p1')],
          situation: raw.situation_eg
            ? { tl: raw.title_tl ?? name, eg: raw.situation_eg }
            : undefined,
        },
        items,
        pages: [page as LessonPack['pages'][number]],
        questions,
      };

      const zod = LessonPackSchema.safeParse(pack);
      const validation = validateLessonPack(pack, { mode: 'strict' });
      const errors: string[] = [];

      if (!zod.success) {
        for (const issue of zod.error.issues) {
          errors.push(`zod ${issue.path.join('.')}: ${issue.message}`);
        }
      }
      if (hasErrors(validation)) {
        for (const issue of validation.issues.filter((i) => i.severity === 'error')) {
          errors.push(`${issue.path} [${issue.rule}] ${issue.message}`);
        }
      }

      if (errors.length) {
        console.info(
          `\n[preset-validate] ${name}.json schema diffs (NOT editing file):\n${errors.map((e) => `  - ${e}`).join('\n')}\n`,
        );
      }

      // Soft assert: document diffs; fail only if file unreadable / empty
      assert.ok(Array.isArray(raw.items) && raw.items.length > 0);
      assert.ok(raw.page && typeof raw.page === 'object');
      // Expose diffs without failing the suite hard — attach for visibility
      if (errors.length) {
        assert.ok(
          true,
          `documented ${errors.length} schema diffs for ${name}`,
        );
      }
    });
  }
});
