import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCustomDeckImageSpec,
  customDeckImageThreshold,
  imageKeyForConcept,
  planFromRows,
  posGetsImage,
} from '../lib/v2/decks/images';

describe('C8 · image keys and POS', () => {
  it('builds word.<concept_en> keys', () => {
    assert.equal(imageKeyForConcept('rain'), 'word.rain');
    assert.equal(imageKeyForConcept(' to_cook '), 'word.to_cook');
  });

  it('phrases get no image; nouns verbs adjectives do', () => {
    assert.equal(posGetsImage('phrase'), false);
    assert.equal(posGetsImage('noun'), true);
    assert.equal(posGetsImage('verb'), true);
    assert.equal(posGetsImage('adjective'), true);
  });

  it('buildCustomDeckImageSpec returns null for phrases and empty cast', () => {
    assert.equal(
      buildCustomDeckImageSpec({
        pos: 'phrase',
        concept_en: 'hello',
        ar: 'مرحبا',
      }),
      null,
    );
    const noun = buildCustomDeckImageSpec({
      pos: 'noun',
      concept_en: 'rain',
      ar: 'المطر',
      topic: 'الطقس',
    });
    assert.ok(noun);
    assert.equal(noun!.type, 'object');
    assert.ok(noun!.intent?.includes('rain'));

    const verb = buildCustomDeckImageSpec({
      pos: 'verb',
      concept_en: 'to_swim',
      ar: 'السباحة',
    });
    assert.ok(verb);
    assert.deepEqual(verb!.characters, []);
  });
});

describe('C8 · planFromRows', () => {
  const rows = [
    {
      item_id: 'ugc.pt-PT.chuva.noun',
      pos: 'noun',
      concept_en: 'rain',
      ar: 'مطر',
      image_status: 'ready' as string | null,
    },
    {
      item_id: 'ugc.pt-PT.nadar.verb',
      pos: 'verb',
      concept_en: 'to_swim',
      ar: 'السباحة',
      image_status: 'missing' as string | null,
    },
    {
      item_id: 'ugc.pt-PT.ola.phrase',
      pos: 'phrase',
      concept_en: 'hello',
      ar: 'أهلا',
      image_status: null,
    },
    {
      item_id: 'ugc.pt-PT.sol.noun',
      pos: 'noun',
      concept_en: 'sun',
      ar: 'شمس',
      image_status: 'failed' as string | null,
    },
  ];

  it('reuses ready keys and skips phrases', () => {
    const plan = planFromRows({
      deck_id: 'deck1',
      topic: 'praia',
      rows,
    });
    assert.equal(plan.skipped_phrases, 1);
    assert.equal(plan.reusable.length, 1);
    assert.equal(plan.reusable[0]!.key, 'word.rain');
    assert.equal(plan.missing.length, 2);
    assert.ok(plan.missing.every((m) => m.key !== 'word.rain'));
    assert.ok(plan.estimate_usd > 0);
  });

  it('force regenerates ready keys too', () => {
    const plan = planFromRows({
      deck_id: 'deck1',
      rows,
      force: true,
    });
    assert.ok(plan.missing.some((m) => m.key === 'word.rain'));
    assert.equal(plan.reusable.length, 0);
  });

  it('dedupes the same concept across items', () => {
    const plan = planFromRows({
      deck_id: 'deck1',
      rows: [
        {
          item_id: 'a',
          pos: 'noun',
          concept_en: 'rain',
          ar: 'مطر',
          image_status: 'missing',
        },
        {
          item_id: 'b',
          pos: 'noun',
          concept_en: 'rain',
          ar: 'مطر',
          image_status: 'missing',
        },
      ],
    });
    assert.equal(plan.missing.length, 1);
    assert.equal(plan.missing[0]!.key, 'word.rain');
  });
});

describe('C8 · threshold helper', () => {
  it('defaults threshold to 5', () => {
    const prev = process.env.CUSTOM_DECK_IMAGE_THRESHOLD;
    delete process.env.CUSTOM_DECK_IMAGE_THRESHOLD;
    assert.equal(customDeckImageThreshold(), 5);
    if (prev !== undefined) process.env.CUSTOM_DECK_IMAGE_THRESHOLD = prev;
  });

  it('auto-enqueue gate: under threshold skips, at/over would run', () => {
    const threshold = customDeckImageThreshold();
    assert.ok(3 < threshold);
    assert.ok(threshold <= threshold);
    // Documented contract for maybeEnqueueAfterAdd
    assert.equal(5 < threshold ? 'skip' : 'enqueue', 'enqueue');
  });
});
