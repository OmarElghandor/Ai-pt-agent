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
  it('loads the index path with 15 situations and no tiers/levels', () => {
    clearRoleplayLoadCache();
    const index = loadRoleplayIndex();
    assert.equal(index.target_lang, 'pt-PT');
    assert.equal(index.path.length, 15);
    assert.equal(new Set(index.path.map((p) => p.id)).size, 15);
    assert.equal(index.path[0].id, 'rp.cafe');
    assert.equal(index.path[0].n, 1);
    assert.equal(index.path[0].round, 1);
    assert.equal(index.path[14].id, 'rp.financas');
    assert.equal(index.path[14].n, 15);
    assert.equal('tiers' in index, false);
    assert.equal('levels' in index, false);
  });

  it('loads all 15 situation files', () => {
    clearRoleplayLoadCache();
    const files = listRoleplaySituationFiles();
    assert.equal(files.length, 15);
    const situations = loadAllRoleplaySituations();
    assert.equal(situations.length, 15);
    for (const s of situations) {
      assert.ok(s.steps.length > 0, `${s.id} has steps`);
      assert.equal(typeof s.round, 'number', `${s.id} has round`);
      assert.equal(typeof s.closing.tl, 'string');
      assert.equal(typeof s.summary_eg, 'string');
      for (const step of s.steps) {
        assert.equal(
          'min_tier' in step,
          false,
          `${s.id}.${step.id} has no min_tier`,
        );
        assert.equal(
          'says_alt' in step,
          false,
          `${s.id}.${step.id} has no says_alt`,
        );
        assert.equal(
          'coach_eg' in step,
          false,
          `${s.id}.${step.id} has no coach_eg`,
        );
      }
    }
    const cafe = loadRoleplaySituation('rp.cafe');
    assert.equal(cafe.steps[0].id, 'order_drink');
    assert.ok(cafe.steps[0].says);
    assert.ok(typeof cafe.steps[0].hint_eg === 'string');
  });

  it('validator runs on all situations and reports issues without throwing', () => {
    clearRoleplayLoadCache();
    const situations = loadAllRoleplaySituations();
    const issues = validateAllRoleplaySituations(situations);
    assert.ok(Array.isArray(issues));
    const cafe = loadRoleplaySituation('rp.cafe');
    const cafeIssues = validateRoleplaySituation(cafe);
    const ifSlotIssues = cafeIssues.filter((i) => i.path.includes('if_slot'));
    assert.equal(ifSlotIssues.length, 0);
  });
});
