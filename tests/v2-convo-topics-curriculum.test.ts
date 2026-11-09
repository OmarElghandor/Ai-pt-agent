import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTopicsFromCurriculum,
  clearTopicsFileCache,
  loadTopicsFile,
  parseTopicsFile,
} from '@/lib/v2/convo/topics';
import { getCoreItemsDay } from '@/lib/v2/generation/lesson/coreItems';
import { loadConvoPack, loadConvoItemSurfaces } from '@/lib/v2/convo/pack';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('v2 convo topics · curriculum match', () => {
  it('Learn catalog pack_id is always pt-PT.day-<n> with core item_ids', () => {
    clearTopicsFileCache();
    const file = loadTopicsFile();
    const mismatches: string[] = [];

    for (const theme of file.themes) {
      for (const topic of theme.topics) {
        const expectedPack = `pt-PT.day-${topic.day}`;
        if (topic.pack_id !== expectedPack) {
          mismatches.push(
            `${topic.id}: pack_id ${topic.pack_id} !== ${expectedPack}`,
          );
        }
        let core;
        try {
          core = getCoreItemsDay(topic.day);
        } catch {
          mismatches.push(`${topic.id}: no core-items for day ${topic.day}`);
          continue;
        }
        const coreIds = core.core_items.map((c) => c.id).sort();
        const topicIds = [...topic.item_ids].sort();
        if (JSON.stringify(coreIds) !== JSON.stringify(topicIds)) {
          mismatches.push(
            `${topic.id}: item_ids !== day ${topic.day} core items`,
          );
        }
      }
    }

    assert.deepEqual(mismatches, []);
  });

  it('fails when a topic pack uses items outside its day core/recycle', () => {
    clearTopicsFileCache();
    const file = loadTopicsFile();
    const surfaces = loadConvoItemSurfaces();
    const mismatches: string[] = [];

    for (const theme of file.themes) {
      for (const topic of theme.topics) {
        const result = loadConvoPack(topic.pack_id, { itemSurfaces: surfaces });
        if (!result.ok || !result.pack) continue;

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
        // L1: pack items must equal that day's core items.
        const coreIds = new Set(day.core_items.map((c) => c.id));
        for (const id of packIds) {
          if (!coreIds.has(id)) {
            mismatches.push(
              `${topic.id}: pack item "${id}" not in day ${topic.day} core`,
            );
          }
        }
        for (const id of coreIds) {
          if (!packIds.includes(id)) {
            mismatches.push(
              `${topic.id}: core item "${id}" missing from pack`,
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

  it('keeps theme grouping from topics.pt-PT.json overrides', () => {
    const overridesPath = path.join(
      process.cwd(),
      'content/v2/convo/topics.pt-PT.json',
    );
    const overrides = parseTopicsFile(
      JSON.parse(readFileSync(overridesPath, 'utf8')) as unknown,
    );
    const built = buildTopicsFromCurriculum({ overridesFile: overrides });
    const directions = built.themes.find((t) => t.id === 'directions');
    assert.ok(directions);
    assert.ok(directions!.topics.some((t) => t.day === 33));
    const day33 = directions!.topics.find((t) => t.day === 33)!;
    assert.equal(day33.pack_id, 'pt-PT.day-33');
    assert.ok(day33.subtitle_eg);
    assert.equal(day33.character_id, 'ines');
  });
});
