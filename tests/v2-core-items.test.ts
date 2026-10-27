import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateLessonPack, type LessonPack } from '../lib/v2/content';
import { buildLessonBrief } from '../lib/v2/generation/lesson/brief';
import {
  getCoreItemsDay,
  nonVerbCoreIds,
} from '../lib/v2/generation/lesson/coreItems';
import { getDayPlan } from '../lib/v2/generation/lesson/plan';

describe('core-items file', () => {
  it('loads day 1 and day 2 with stable ids', () => {
    const d1 = getCoreItemsDay(1);
    assert.ok(d1.core_items.some((c) => c.id === 'phrase.hello'));
    assert.deepEqual(d1.recycle_ids, []);
    const d2 = getCoreItemsDay(2);
    assert.ok(d2.core_items.some((c) => c.id === 'word.coffee'));
    assert.ok(d2.recycle_ids.includes('phrase.hello'));
  });

  it('story day 7 and day 30 have no new items', () => {
    assert.equal(getCoreItemsDay(7).core_items.length, 0);
    assert.equal(getCoreItemsDay(30).core_items.length, 0);
    assert.equal(buildLessonBrief(getDayPlan(7)).no_new_items, true);
    assert.equal(buildLessonBrief(getDayPlan(30)).no_new_items, true);
  });
});

describe('validateLessonPack core + allowed', () => {
  const phrase = {
    type: 'phrase' as const,
    id: 'phrase.hello',
    tl: 'Olá!',
    ar: 'مرحبا',
    context_eg: 'لما تقابل حد',
    cloze: 'Olá',
  };

  it('errors when a core id is missing from the draft', () => {
    const pack = {
      lesson: {
        id: 'd01',
        target_lang: 'pt-PT',
        day: 1,
        kind: 'lesson',
        pages: [],
      },
      items: [],
      pages: [],
      questions: [],
    } as LessonPack;
    const result = validateLessonPack(pack, {
      mode: 'strict',
      coreIds: ['phrase.hello'],
    });
    assert.ok(
      result.issues.some(
        (i) => i.rule === 'core_id_missing' && i.message.includes('phrase.hello'),
      ),
    );
  });

  it('errors when a page refs an id outside core ∪ recycle ∪ KNOWN', () => {
    const pack = {
      lesson: {
        id: 'd01',
        target_lang: 'pt-PT',
        day: 1,
        kind: 'lesson',
        pages: ['p1'],
      },
      items: [
        phrase,
        {
          type: 'phrase',
          id: 'phrase.invented',
          tl: 'X',
          ar: 'س',
          context_eg: 'س',
          cloze: 'X',
          extra: true,
        },
      ],
      pages: [
        {
          id: 'p1',
          preset: 'phrases',
          mode: 'static',
          title: [{ text: 't', lang: 'eg' }],
          blocks: [
            {
              id: 'b1',
              type: 'cards',
              items: ['phrase.invented'],
            },
          ],
        },
      ],
      questions: [],
    } as unknown as LessonPack;
    const result = validateLessonPack(pack, {
      mode: 'strict',
      coreIds: nonVerbCoreIds(getCoreItemsDay(1).core_items).slice(0, 1),
      allowedIds: ['phrase.hello'],
    });
    assert.ok(
      result.issues.some((i) => i.rule === 'ref_not_in_core_recycle_known'),
    );
  });
});
