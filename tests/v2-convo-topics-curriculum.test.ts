import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadTopicsFile } from '@/lib/v2/convo/topics';
import { getCoreItemsDay } from '@/lib/v2/generation/lesson/coreItems';
import { loadConvoPack, loadConvoItemSurfaces } from '@/lib/v2/convo/pack';

/**
 * Every topic with a pack on disk must use only that day's core (+ recycle) items.
 */
describe('v2 convo topics · curriculum match', () => {
  it('fails when a topic pack uses items outside its day core/recycle', () => {
    const file = loadTopicsFile();
    const surfaces = loadConvoItemSurfaces();
    const mismatches: string[] = [];

    for (const theme of file.themes) {
      for (const topic of theme.topics) {
        const result = loadConvoPack(topic.pack_id, { itemSurfaces: surfaces });
        if (!result.ok || !result.pack) continue; // pack not generated yet (e.g. day 34)

        const day = getCoreItemsDay(topic.day);
        const allowed = new Set([
          ...day.core_items.map((c) => c.id),
          ...day.recycle_ids,
        ]);
        const packIds = Object.keys(result.pack.items);
        for (const id of packIds) {
          if (!allowed.has(id)) {
            mismatches.push(
              `${topic.id}: pack item "${id}" not in day ${topic.day} core/recycle`,
            );
          }
        }
        // Topic catalog item_ids must also stay inside the day.
        for (const id of topic.item_ids) {
          if (!allowed.has(id)) {
            mismatches.push(
              `${topic.id}: topic item_ids "${id}" not in day ${topic.day} core/recycle`,
            );
          }
        }
      }
    }

    assert.deepEqual(mismatches, []);
  });

  it('directions day-33 pack validates and matches core items', () => {
    const surfaces = loadConvoItemSurfaces();
    const result = loadConvoPack('pt-PT.day-33', { itemSurfaces: surfaces });
    assert.equal(result.ok, true, result.issues.map((i) => i.message).join('; '));
    assert.ok(result.pack);
    assert.equal(result.pack!.day, 33);
    assert.equal(result.pack!.authored, true);

    const day = getCoreItemsDay(33);
    const coreIds = new Set(day.core_items.map((c) => c.id));
    for (const id of Object.keys(result.pack!.items)) {
      assert.ok(coreIds.has(id), `unexpected pack item ${id}`);
    }
  });
});
