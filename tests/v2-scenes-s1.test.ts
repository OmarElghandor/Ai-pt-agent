import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  askTlEndsOpen,
  clearSceneLoadCache,
  listSceneBankFiles,
  listSceneIdsFromIndex,
  loadAllSceneBanks,
  loadSceneBank,
  loadSceneIndex,
  validateSceneBank,
} from '@/lib/v2/convo/scenes';
import { listTopicCatalog } from '@/lib/v2/convo/topics/allowed';

describe('scenes S1 · loader (batch-rp-3 path)', () => {
  it('path index lists only the café', () => {
    clearSceneLoadCache();
    const index = loadSceneIndex();
    assert.equal(index.target_lang, 'pt-PT');
    assert.equal(index.path.length, 1);
    assert.equal(index.path[0].id, 'cena-cafe');
    assert.equal(index.path[0].n, 1);
    assert.equal(index.path[0].emoji, '☕');
    assert.deepEqual(listSceneIdsFromIndex(), ['cena-cafe']);
  });

  it('other scene bank files stay on disk but out of the path', () => {
    clearSceneLoadCache();
    const files = listSceneBankFiles();
    assert.ok(files.length >= 15);
    assert.ok(files.includes('cena-cafe'));
    assert.ok(files.includes('cena-mercado'));
    const banks = loadAllSceneBanks();
    assert.equal(banks.length, 1);
    assert.equal(banks[0].topic_id, 'cena-cafe');
  });

  it('loads and validates format-3 cena-cafe', () => {
    clearSceneLoadCache();
    const cafe = loadSceneBank('cena-cafe');
    assert.equal(cafe.kind, 'scene');
    assert.equal(cafe.format, 3);
    assert.equal(cafe.topic_id, 'cena-cafe');
    assert.ok(cafe.opening?.tl?.includes('Bom dia'));
    assert.ok(cafe.closing?.tl?.includes('Até amanhã'));
    assert.equal(cafe.scene?.character_id, 'manuel');
    assert.ok(cafe.global?.greeting?.react?.length);
    assert.equal(cafe.goals[0].id, 'order_drink');
    assert.ok(cafe.goals[0].ask?.length);
    assert.ok(cafe.goals[0].options?.length);
    assert.ok(cafe.goals[0].suggest?.length === 2);
    assert.ok(cafe.goals[0].hints?.what_eg?.trim());
    assert.ok(cafe.goals[0].hints?.words_eg?.trim());
    assert.ok(cafe.goals[0].hints?.frame_tl?.trim());
    assert.equal(cafe.goals[cafe.goals.length - 1]?.farewell, true);
    for (const g of cafe.goals) {
      if (g.farewell) continue;
      for (const a of g.ask ?? []) {
        assert.equal(
          askTlEndsOpen(a.tl),
          true,
          `${g.id} ask ends open: ${a.tl}`,
        );
      }
    }
    const { ok, issues } = validateSceneBank(cafe);
    assert.equal(ok, true, JSON.stringify(issues));
  });

  it('format-2 banks on disk still parse', () => {
    clearSceneLoadCache();
    const mercado = loadSceneBank('cena-mercado');
    assert.equal(mercado.kind, 'scene');
    assert.notEqual(mercado.format, 3);
    assert.ok(mercado.scene?.place?.trim());
    assert.ok(mercado.opening?.tl?.trim());
  });

  it('scenes are not in the free-talk topic catalog', () => {
    const ids = new Set(listTopicCatalog().map((t) => t.id));
    assert.equal(ids.has('cena-cafe'), false);
  });
});
