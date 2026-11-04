import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ANGLE_MAX_COUNT,
  ANGLE_MIN_COUNT,
  filterValidAngles,
  freeTopicById,
  listAngleTopicIdsFromFiles,
  loadFreeTopicsFile,
  loadTopicAngles,
  parseFreeTopicsFile,
  requireTopicAngles,
  validateTopicAngles,
} from '@/lib/v2/convo/topics';

describe('v2 free topics · T7.1 content', () => {
  it('loads exactly 6 free topics', () => {
    const file = loadFreeTopicsFile();
    assert.equal(file.target_lang, 'pt-PT');
    assert.equal(file.topics.length, 6);
    const ids = file.topics.map((t) => t.id).sort();
    assert.deepEqual(ids, [
      'day',
      'egypt',
      'food',
      'home',
      'weekend',
      'work',
    ]);
    for (const t of file.topics) {
      assert.ok(t.word_set.length >= 5, `${t.id} needs a word_set`);
      assert.ok(t.character_id, `${t.id} needs character_id`);
      assert.ok(t.title_ar, `${t.id} needs title_ar`);
    }
    assert.equal(freeTopicById('day')?.character_id, 'nour');
    assert.equal(freeTopicById('food')?.character_id, 'ines');
  });

  it('rejects a bad free-topics file', () => {
    assert.throws(() => parseFreeTopicsFile({ topics: [] }));
  });

  it('has angle banks for all 6 topics (8–12 each)', () => {
    const file = loadFreeTopicsFile();
    const fromFiles = listAngleTopicIdsFromFiles();
    assert.deepEqual(fromFiles.sort(), file.topics.map((t) => t.id).sort());
    for (const t of file.topics) {
      const doc = requireTopicAngles(t.id);
      assert.equal(doc.topic_id, t.id);
      assert.ok(
        doc.angles.length >= ANGLE_MIN_COUNT &&
          doc.angles.length <= ANGLE_MAX_COUNT,
        `${t.id}: ${doc.angles.length} angles`,
      );
      for (const a of doc.angles) {
        assert.ok(a.tl.endsWith('?') || a.tl.includes('?'), a.id);
        assert.ok(a.item_hints.length >= 1, a.id);
      }
    }
  });
});

describe('v2 free topics · angle validation', () => {
  const base = {
    target_lang: 'pt-PT',
    topic_id: 'food',
    angles: Array.from({ length: 8 }, (_, i) => ({
      id: `food.a${String(i + 1).padStart(2, '0')}`,
      tl: 'Gosta de arroz?',
      item_hints: ['arroz'],
    })),
  };

  it('accepts a valid minimal bank', () => {
    const r = validateTopicAngles(base);
    assert.equal(r.ok, true);
    assert.equal(r.doc?.angles.length, 8);
  });

  it('fails count when fewer than 8', () => {
    const r = validateTopicAngles({
      ...base,
      angles: base.angles.slice(0, 3),
    });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.rule === 'count'));
  });

  it('fails brazilian leak', () => {
    const angles = [...base.angles];
    angles[0] = {
      id: 'food.a01',
      tl: 'Você gosta de ônibus?',
      item_hints: ['ônibus'],
    };
    const r = validateTopicAngles({ ...base, angles });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.rule === 'brazilian'));
  });

  it('fails english leak', () => {
    const angles = [...base.angles];
    angles[0] = {
      id: 'food.a01',
      tl: 'Do you like rice please?',
      item_hints: ['rice'],
    };
    const r = validateTopicAngles({ ...base, angles });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.rule === 'english'));
  });

  it('fails length over max words', () => {
    const angles = [...base.angles];
    angles[0] = {
      id: 'food.a01',
      tl: 'Pode dizer-me por favor o que é que costuma comer todos os dias ao almoço em casa?',
      item_hints: ['almoço'],
    };
    const r = validateTopicAngles({ ...base, angles });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.rule === 'length'));
  });

  it('fails duplicate ids', () => {
    const angles = [...base.angles];
    angles[1] = { ...angles[0]! };
    const r = validateTopicAngles({ ...base, angles });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.rule === 'id'));
  });

  it('filterValidAngles drops bad lines and keeps good ones', () => {
    const { kept, dropped } = filterValidAngles([
      { id: 'ok', tl: 'Gosta de peixe?', item_hints: ['peixe'] },
      { id: 'br', tl: 'Você come trem?', item_hints: [] },
      {
        id: 'long',
        tl: 'Pode dizer-me por favor o que é que costuma comer todos os dias ao almoço em casa?',
        item_hints: [],
      },
    ]);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]!.id, 'ok');
    assert.equal(dropped.length, 2);
  });

  it('loadTopicAngles returns the food bank', () => {
    const doc = loadTopicAngles('food');
    assert.equal(doc.topic_id, 'food');
    assert.ok(doc.angles.length >= 8);
  });
});
