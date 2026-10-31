import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PageJobSchema,
  hydratePageToolResult,
  pageJobSchemaFor,
} from '@/lib/v2/generation/lesson/schemas/page';
import {
  allowIdsForPage,
  fillEmptyDetailAssumes,
} from '@/lib/v2/generation/lesson/pageAllow';
import { applyDeterminedBlocks } from '@/lib/v2/generation/lesson/pageCodeFill';
import type { OutlinePagePlan } from '@/lib/v2/generation/lesson/stages/types';

const tip = {
  id: 'b1',
  type: 'tip' as const,
  kind: 'rule' as const,
  title: [{ text: 'قاعدة', lang: 'eg' as const }],
  body: [{ text: 'احفظ الجملة مع الموقف', lang: 'eg' as const }],
};

function plan(partial: Partial<OutlinePagePlan> & Pick<OutlinePagePlan, 'preset' | 'page_id' | 'index'>): OutlinePagePlan {
  return {
    mode: partial.preset === 'pattern' || partial.preset === 'compare' ? 'guided' : 'static',
    title: partial.page_id,
    purpose: 'غرض',
    introduces: [],
    assumes: [],
    handoff: '',
    ...partial,
  };
}

describe('page tool schema', () => {
  it('rejects a page with no blocks', () => {
    const parsed = PageJobSchema.safeParse({
      page: {
        title: [{ text: 'التحيات', lang: 'eg' }],
        blocks: [],
      },
    });
    assert.equal(parsed.success, false);
  });

  it('rejects a guided page that omits steps', () => {
    const parsed = pageJobSchemaFor('guided').safeParse({
      page: {
        title: [{ text: 'Chamo-me', lang: 'tl' }],
        blocks: [tip],
      },
    });
    assert.equal(parsed.success, false);
  });

  it('rejects an explore page that omits controls', () => {
    const parsed = pageJobSchemaFor('explore').safeParse({
      page: {
        title: [{ text: 'الأفعال', lang: 'eg' }],
        blocks: [tip],
      },
    });
    assert.equal(parsed.success, false);
  });

  it('accepts a story pointer with no blocks', () => {
    const parsed = pageJobSchemaFor('static', { storyPointer: true }).safeParse({
      page: {
        title: [{ text: 'القصة', lang: 'eg' }],
      },
    });
    assert.equal(parsed.success, true);
  });
});

describe('determined blocks', () => {
  it('turns a title-only phrases payload into cards of the introduces ids', () => {
    const entry = plan({
      index: 1,
      page_id: 'p1_phrases',
      preset: 'phrases',
      introduces: ['phrase.hello', 'phrase.bye'],
    });
    const hydrated = hydratePageToolResult(
      { page: { title: [{ text: 'التحيات', lang: 'eg' }] } },
      entry,
      'static',
    );
    const filled = applyDeterminedBlocks(hydrated, {
      preset: 'phrases',
      introduces: entry.introduces,
      allowedIds: [],
    });
    const parsed = PageJobSchema.safeParse(filled);
    assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
    if (!parsed.success) return;
    const cards = parsed.data.page.blocks.find((block) => block.type === 'cards');
    assert.ok(cards && cards.type === 'cards');
    assert.deepEqual(cards.items, ['phrase.hello', 'phrase.bye']);
  });

  it('adds a formula block when a pattern page omits one', () => {
    const entry = plan({
      index: 2,
      page_id: 'p2_pattern',
      preset: 'pattern',
      mode: 'guided',
      introduces: ['pattern.chamo_me'],
    });
    const hydrated = hydratePageToolResult({ page: {} }, entry, 'guided');
    const filled = applyDeterminedBlocks(hydrated, {
      preset: 'pattern',
      introduces: entry.introduces,
      allowedIds: [],
    });
    const blocks = (filled as { page: { blocks: { type: string; pattern?: string }[] } })
      .page.blocks;
    assert.equal(blocks[0]?.type, 'formula');
    assert.equal(blocks[0]?.pattern, 'pattern.chamo_me');
    assert.equal(pageJobSchemaFor('guided').safeParse(filled).success, false);
  });
});

describe('empty introduces allow-list', () => {
  const pages = [
    plan({
      index: 0,
      page_id: 'p0_story',
      preset: 'story',
      role: 'intro',
    }),
    plan({
      index: 1,
      page_id: 'p1_phrases',
      preset: 'phrases',
      introduces: ['phrase.hello'],
    }),
    plan({
      index: 2,
      page_id: 'p2_scene',
      preset: 'scene',
    }),
  ];

  it('lets a detail page with no introduces assume earlier ids', () => {
    const result = fillEmptyDetailAssumes(pages);
    assert.deepEqual(result.pages[0]?.assumes, []);
    assert.deepEqual(result.pages[1]?.assumes, []);
    assert.deepEqual(result.pages[2]?.assumes, ['phrase.hello']);
    assert.equal(result.filled.length, 1);
  });

  it('uses earlier ids when a saved outline still has empty assumes', () => {
    assert.deepEqual(allowIdsForPage(pages[2]!, pages), ['phrase.hello']);
    assert.deepEqual(allowIdsForPage(pages[1]!, pages), ['phrase.hello']);
  });
});
