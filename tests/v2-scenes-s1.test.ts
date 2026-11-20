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

describe('scenes S1 · loader (batch-rp-4 path)', () => {
  it('path index lists all 15 scenes in order', () => {
    clearSceneLoadCache();
    const index = loadSceneIndex();
    assert.equal(index.target_lang, 'pt-PT');
    assert.equal(index.path.length, 15);
    assert.equal(index.path[0].id, 'cena-cafe');
    assert.equal(index.path[0].n, 1);
    assert.equal(index.path[0].emoji, '☕');
    assert.deepEqual(listSceneIdsFromIndex(), [
      'cena-cafe',
      'cena-mercado',
      'cena-supermercado',
      'cena-encomenda',
      'cena-restaurante',
      'cena-vizinha',
      'cena-telefone',
      'cena-comboio',
      'cena-direcoes',
      'cena-consulta',
      'cena-farmacia',
      'cena-roupa',
      'cena-quarto',
      'cena-avaria',
      'cena-financas',
    ]);
  });

  it('all path banks load as format 3', () => {
    clearSceneLoadCache();
    const files = listSceneBankFiles();
    assert.ok(files.length >= 15);
    const banks = loadAllSceneBanks();
    assert.equal(banks.length, 15);
    for (const bank of banks) {
      assert.equal(bank.format, 3);
      assert.equal(bank.kind, 'scene');
      const { ok, issues } = validateSceneBank(bank);
      assert.equal(ok, true, `${bank.topic_id}: ${JSON.stringify(issues)}`);
    }
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
    assert.ok(cafe.goals[0].hint_words?.trim());
    assert.equal(cafe.end_tips_eg?.length, 2);
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

  it('scenes are not in the free-talk topic catalog', () => {
    const ids = new Set(listTopicCatalog().map((t) => t.id));
    assert.equal(ids.has('cena-cafe'), false);
  });
});
