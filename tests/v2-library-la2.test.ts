import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  BRIEF_STALE_REASON,
  BriefValidationError,
  checkApprovable,
  countBriefMoments,
  markScriptStaleOnBriefEdit,
  momentMinimum,
  normalizeBriefInput,
  stagesAfterApprove,
  stagesAfterBriefSave,
} from '../lib/v2/library/briefRules';
import { nextBankMomentId, usedInCounts } from '../lib/v2/library/moments';
import { defaultStages } from '../lib/v2/library/stages';
import type { EpisodeStages } from '../lib/v2/library/types';

const root = join(__dirname, '..');

function moment(id: string, bank_id: string | null = null) {
  return { id, eg: `لحظة ${id}`, direction: 'يسأل', must_say: '', bank_id };
}

function briefWith(level: number, n: number) {
  return {
    target_level: level,
    intro_eg: 'موقف',
    cast: [{ voice_key: 'k', role_eg: 'دور', learner: true }],
    beats: ['beat'],
    moments: Array.from({ length: n }, (_, i) => moment(`m${i + 1}`)),
  };
}

function builtStages(): EpisodeStages {
  const s = defaultStages(new Date('2026-01-01'));
  return {
    ...s,
    brief: { ...s.brief, status: 'approved' },
    script: { ...s.script, status: 'ready' },
    tokens: { ...s.tokens, status: 'ready' },
  };
}

describe('moment minimum', () => {
  it('is 2 on level 1 and 3 on levels 2-5', () => {
    assert.equal(momentMinimum(1), 2);
    for (const l of [2, 3, 4, 5]) assert.equal(momentMinimum(l), 3);
  });

  it('approve is refused below the minimum, allowed at it', () => {
    const l1 = checkApprovable(briefWith(1, 1));
    assert.deepEqual(l1, { ok: false, reason: 'moments_below_minimum', have: 1, need: 2 });
    assert.deepEqual(checkApprovable(briefWith(1, 2)), { ok: true });
    const l3 = checkApprovable(briefWith(3, 2));
    assert.deepEqual(l3, { ok: false, reason: 'moments_below_minimum', have: 2, need: 3 });
    assert.deepEqual(checkApprovable(briefWith(3, 3)), { ok: true });
    assert.deepEqual(checkApprovable(briefWith(5, 4)), { ok: true });
  });

  it('approveBrief enforces the check before any write', () => {
    const src = readFileSync(join(root, 'lib/v2/library/brief.ts'), 'utf8');
    const check = src.indexOf('checkApprovable(');
    const write = src.indexOf("status: 'approved'");
    assert.ok(check > 0 && write > check);
    assert.match(src, /throw new BriefError\(approveRefusalMessage\(check\), 422/);
  });
});

describe('editing an approved brief', () => {
  it('marks Script (and later built stages) stale, keeps output', () => {
    const next = markScriptStaleOnBriefEdit(builtStages(), new Date('2026-02-01'));
    assert.equal(next.script.stale, true);
    assert.equal(next.script.status, 'ready');
    assert.equal(next.script.stale_reason, BRIEF_STALE_REASON);
    assert.equal(next.tokens.stale, true);
    // Stages with no output are not flagged; images/publish untouched.
    assert.equal(next.audio.stale, false);
    assert.equal(next.images.stale, false);
    assert.equal(next.publish.stale, false);
  });

  it('brief goes back to draft; unapproved edits do not touch stages', () => {
    const edited = stagesAfterBriefSave(builtStages(), true);
    assert.equal(edited.brief.status, 'draft');
    assert.equal(edited.script.stale, true);
    const draft = builtStages();
    draft.brief.status = 'draft';
    assert.equal(stagesAfterBriefSave(draft, false), draft);
  });

  it('approve sets the brief stage approved', () => {
    const s = stagesAfterApprove(defaultStages());
    assert.equal(s.brief.status, 'approved');
  });

  it('save asks for confirmation on an approved brief', () => {
    const src = readFileSync(join(root, 'lib/v2/library/brief.ts'), 'utf8');
    assert.match(src, /confirm_edit_approved/);
    assert.match(src, /wasApproved && !opts\.confirmEditApproved/);
    assert.match(src, /admin_edited: true/);
  });
});

describe('archived moments', () => {
  it('stay on an existing brief and still count', () => {
    const moments = [moment('x_m1', 'cafe_1'), moment('x_m2', 'cafe_2'), moment('x_m3')];
    // Archiving cafe_1 in the bank does not change the brief's list.
    assert.equal(countBriefMoments(moments), 3);
    assert.deepEqual(checkApprovable({ ...briefWith(2, 0), moments }), { ok: true });
    const used = usedInCounts([{ moments }, { moments: [moment('y_m1', 'cafe_1')] }]);
    assert.equal(used.get('cafe_1'), 2);
    assert.equal(used.get('cafe_2'), 1);
  });

  it('archiveMoment only flips the bank row and never writes briefs', () => {
    const src = readFileSync(join(root, 'lib/v2/library/moments.ts'), 'utf8');
    assert.match(src, /export function archiveMoment/);
    assert.doesNotMatch(src, /V2LibraryBriefModel\(\)\s*\.\s*(update|delete|find\w*AndUpdate)/);
    assert.doesNotMatch(src, /\$pull/);
    assert.doesNotMatch(src, /\.deleteOne|\.deleteMany|\.findOneAndDelete/);
  });

  it('bank ids are the next free number per place', () => {
    assert.equal(nextBankMomentId('cafe', []), 'cafe_1');
    assert.equal(nextBankMomentId('cafe', ['cafe_1', 'cafe_7', 'gym_9']), 'cafe_8');
  });
});

describe('brief input validation', () => {
  const base = {
    type: 'story',
    target_level: 2,
    intro_eg: ' موقف ',
    cast: [{ voice_key: ' k ', role_eg: 'دور', learner: 1 }],
    places: ['cafe', ' '],
    beats: ['a'],
    must_have_phrases: [],
    moments: [{ id: 'm1', eg: 'لحظة', direction: 'يسمع', must_say: '', bank_id: '' }],
    linked_episode: '',
  };

  it('trims and normalizes', () => {
    const n = normalizeBriefInput(base);
    assert.equal(n.intro_eg, 'موقف');
    assert.equal(n.cast[0].voice_key, 'k');
    assert.equal(n.cast[0].learner, true);
    assert.deepEqual(n.places, ['cafe']);
    assert.equal(n.moments[0].bank_id, null);
    assert.equal(n.linked_episode, null);
  });

  it('rejects bad type, level, direction, duplicate moment ids', () => {
    assert.throws(() => normalizeBriefInput({ ...base, type: 'x' }), BriefValidationError);
    assert.throws(() => normalizeBriefInput({ ...base, target_level: 6 }), BriefValidationError);
    assert.throws(
      () =>
        normalizeBriefInput({
          ...base,
          moments: [{ ...base.moments[0], direction: 'bad' }],
        }),
      BriefValidationError,
    );
    assert.throws(
      () => normalizeBriefInput({ ...base, moments: [base.moments[0], base.moments[0]] }),
      BriefValidationError,
    );
  });

  it('accepts none direction for podcasts', () => {
    const n = normalizeBriefInput({
      ...base,
      type: 'podcast',
      moments: [{ ...base.moments[0], direction: 'none' }],
    });
    assert.equal(n.moments[0].direction, 'none');
  });
});

describe('LA2 admin routes', () => {
  it('every route calls denyUnlessV2Admin first', () => {
    const routes = [
      'app/api/v2/admin/library/episodes/[slug]/brief/route.ts',
      'app/api/v2/admin/library/episodes/[slug]/brief/approve/route.ts',
      'app/api/v2/admin/library/moments/route.ts',
      'app/api/v2/admin/library/moments/[id]/route.ts',
      'app/api/v2/admin/library/voices/route.ts',
    ];
    for (const r of routes) {
      const src = readFileSync(join(root, r), 'utf8');
      assert.match(src, /denyUnlessV2Admin/, r);
      const handlers = src.match(/export async function (GET|POST|PATCH)\b/g) ?? [];
      const gates = src.match(/await denyUnlessV2Admin\(\)/g) ?? [];
      assert.equal(gates.length, handlers.length, `${r}: one gate per handler`);
      const gate = src.indexOf('await denyUnlessV2Admin()');
      for (const marker of [
        'mongoConfigured()',
        'req.json()',
        'getBrief(',
        'saveBrief(',
        'approveBrief(',
        'listMoments(',
        'createMoment(',
        'updateMoment(',
        'listVoiceRegistry(',
      ]) {
        const at = src.indexOf(marker);
        if (at > 0) assert.ok(gate < at, `${r}: gate before ${marker}`);
      }
    }
  });
});
