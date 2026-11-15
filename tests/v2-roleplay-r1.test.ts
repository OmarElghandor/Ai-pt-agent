import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearRoleplayLoadCache,
  listRoleplaySituationFiles,
  loadAllRoleplaySituations,
  loadRoleplayIndex,
  loadRoleplaySituation,
  validateAllRoleplaySituations,
  validateRoleplaySituation,
} from '../lib/v2/roleplay';

describe('roleplay R1 loader', () => {
  it('loads the index with 5 levels, 3 tiers, and 15 situations', () => {
    clearRoleplayLoadCache();
    const index = loadRoleplayIndex();
    assert.equal(index.target_lang, 'pt-PT');
    assert.equal(index.tiers.length, 3);
    assert.equal(index.levels.length, 5);
    const ids = index.levels.flatMap((l) => l.scenarios.map((s) => s.id));
    assert.equal(ids.length, 15);
    assert.equal(new Set(ids).size, 15);
  });

  it('loads all 15 situation files', () => {
    clearRoleplayLoadCache();
    const files = listRoleplaySituationFiles();
    assert.equal(files.length, 15);
    const situations = loadAllRoleplaySituations();
    assert.equal(situations.length, 15);
    for (const s of situations) {
      assert.ok(s.steps.length > 0, `${s.id} has steps`);
      assert.equal(typeof s.closing.tl, 'string');
      assert.equal(typeof s.summary_eg, 'string');
    }
    // Spot-check café.
    const cafe = loadRoleplaySituation('rp.cafe');
    assert.equal(cafe.steps[0].id, 'order_drink');
    assert.ok(cafe.steps[0].says);
  });

  it('validator runs on all situations and reports issues without throwing', () => {
    clearRoleplayLoadCache();
    const situations = loadAllRoleplaySituations();
    const issues = validateAllRoleplaySituations(situations);
    assert.ok(Array.isArray(issues));
    // Content is authored — do not auto-fix. Just ensure café validates if_slot.
    const cafe = loadRoleplaySituation('rp.cafe');
    const cafeIssues = validateRoleplaySituation(cafe);
    const ifSlotIssues = cafeIssues.filter((i) => i.path.includes('if_slot'));
    assert.equal(ifSlotIssues.length, 0);
  });
});
