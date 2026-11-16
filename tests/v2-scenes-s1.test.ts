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
  parseSceneBankJson,
  validateSceneBank,
} from '@/lib/v2/convo/scenes';
import { listOpeningChips, listTopicCatalog } from '@/lib/v2/convo/topics/allowed';

describe('scenes S1 · loader', () => {
  it('loads the path index with 15 scenes', () => {
    clearSceneLoadCache();
    const index = loadSceneIndex();
    assert.equal(index.target_lang, 'pt-PT');
    assert.equal(index.path.length, 15);
    assert.equal(new Set(index.path.map((p) => p.id)).size, 15);
    assert.equal(index.path[0].id, 'cena-cafe');
    assert.equal(index.path[0].n, 1);
    assert.equal(index.path[0].emoji, '☕');
    assert.equal(index.path[14].id, 'cena-financas');
    assert.equal(index.path[14].n, 15);
  });

  it('loads and validates all 15 scene banks', () => {
    clearSceneLoadCache();
    const files = listSceneBankFiles();
    assert.equal(files.length, 15);
    assert.deepEqual(files, listSceneIdsFromIndex().slice().sort());

    const banks = loadAllSceneBanks();
    assert.equal(banks.length, 15);

    for (const bank of banks) {
      assert.equal(bank.kind, 'scene', `${bank.topic_id} kind`);
      assert.equal(bank.source, 'topic');
      assert.ok(bank.topic_id?.startsWith('cena-'), bank.topic_id);
      assert.ok(bank.opening?.tl?.trim(), `${bank.topic_id} opening`);
      assert.ok(bank.closing?.tl?.trim(), `${bank.topic_id} closing`);
      assert.ok(bank.scene?.character_id, `${bank.topic_id} character`);
      assert.ok(bank.scene?.place?.trim(), `${bank.topic_id} place`);
      assert.ok(bank.goals.length >= 2, `${bank.topic_id} goals`);
      assert.equal(
        bank.goals[bank.goals.length - 1]?.farewell,
        true,
        `${bank.topic_id} last farewell`,
      );

      for (const g of bank.goals) {
        assert.ok(g.ask_tl?.trim(), `${bank.topic_id}.${g.id} ask_tl`);
        assert.ok(g.ask_ar?.trim(), `${bank.topic_id}.${g.id} ask_ar`);
        assert.ok(g.examples_tl.length >= 1, `${bank.topic_id}.${g.id} examples`);
        assert.ok(g.keywords.length >= 1, `${bank.topic_id}.${g.id} keywords`);
        assert.ok(g.help.frame_tl.trim(), `${bank.topic_id}.${g.id} help`);
        if (!g.farewell) {
          assert.equal(
            askTlEndsOpen(g.ask_tl!),
            true,
            `${bank.topic_id}.${g.id} ask ends open: ${g.ask_tl}`,
          );
        }
      }

      const { ok, issues } = validateSceneBank(bank);
      assert.equal(ok, true, `${bank.topic_id}: ${JSON.stringify(issues)}`);
    }

    const cafe = loadSceneBank('cena-cafe');
    assert.equal(cafe.goals[0].id, 'cafe.order_drink');
    assert.equal(cafe.goals[0].ask_tl, 'Bom dia! Diga.');
    const askPrice = cafe.goals.find((g) => g.id === 'cafe.ask_price');
    assert.ok(askPrice?.cue_eg?.includes('الحساب'));
    const pay = cafe.goals.find((g) => g.id === 'cafe.pay');
    // pay ask embeds the price; no separate facts_tl on cafe — mercado has facts
    assert.ok(pay?.ask_tl?.includes('dois euros'));

    const mercado = loadSceneBank('cena-mercado');
    const mercadoPay = mercado.goals.find((g) => g.id === 'mercado.pay');
    assert.ok(mercadoPay?.facts_tl?.some((f) => /dinheiro/i.test(f)));

    const food = cafe.goals.find((g) => g.id === 'cafe.order_food');
    assert.ok(food?.help.chips_f?.some((c) => /obrigada/i.test(c)));
  });

  it('rejects non-scene JSON through the scene parser', () => {
    assert.throws(
      () =>
        parseSceneBankJson({
          source: 'topic',
          kind: 'topic',
          goals: [],
        }),
      /kind must be "scene"/,
    );
  });
});

describe('scenes S1 · stay out of free-talk catalog', () => {
  it('no scene id appears in the topic catalog or opening chips', () => {
    clearSceneLoadCache();
    const sceneIds = new Set(listSceneIdsFromIndex());
    assert.equal(sceneIds.size, 15);

    const catalog = listTopicCatalog();
    for (const entry of catalog) {
      assert.equal(
        sceneIds.has(entry.id),
        false,
        `catalog must not include scene ${entry.id}`,
      );
      assert.notEqual(
        (entry as { kind?: string }).kind,
        'scene',
      );
    }

    const chips = listOpeningChips(54);
    for (const chip of chips) {
      assert.equal(
        sceneIds.has(chip.id),
        false,
        `opening chips must not include scene ${chip.id}`,
      );
    }

    // File ids themselves never collide with authored topic stems.
    for (const id of sceneIds) {
      assert.match(id, /^cena-/);
    }
  });
});
