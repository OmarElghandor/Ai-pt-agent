import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { USER_KEYED_V2_COLLECTIONS } from '../lib/v2/auth/userKeyedCollections';
import { loadLibrarySeed } from '../lib/v2/library/importFromContent';
import {
  applyImportPlan,
  emptyImportExisting,
  importPlanHasChanges,
  planImport,
  summarizeImportPlan,
} from '../lib/v2/library/mergeImport';
import {
  buildEpisodeRow,
  filterEpisodeRows,
  parseEpisodeFilters,
  sortEpisodeRows,
  stageBucket,
} from '../lib/v2/library/listEpisodes';
import { planReorder, ReorderError } from '../lib/v2/library/reorderEpisodes';
import { defaultStages, markStale } from '../lib/v2/library/stages';
import {
  V2LibraryBriefModel,
  V2LibraryEpisodeModel,
} from '../lib/v2/mongo/libraryModels';

const root = join(__dirname, '..');
const seed = loadLibrarySeed(join(root, 'content', 'v2', 'library'));

describe('libraryModels export', () => {
  it('exports model factories as functions', () => {
    assert.equal(typeof V2LibraryEpisodeModel, 'function');
    assert.equal(typeof V2LibraryBriefModel, 'function');
  });
});

describe('library seed content', () => {
  it('loads 20 briefs in order, plus voices, moments and settings', () => {
    assert.equal(seed.briefs.length, 20);
    assert.deepEqual(
      seed.briefs.map((b) => b.sort_order),
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    assert.equal(new Set(seed.briefs.map((b) => b.slug)).size, 20);
    assert.ok(seed.voices.some((v) => v.key === 'narrator' && v.kind === 'narrator'));
    assert.ok(seed.voices.some((v) => v.key === 'learner_f' && v.kind === 'learner_f'));
    assert.ok(seed.voices.some((v) => v.key === 'pool_f_1' && v.kind === 'pool'));
    assert.ok(seed.moments.length > 0);
    assert.equal(new Set(seed.moments.map((m) => m.id)).size, seed.moments.length);
    assert.equal(seed.settings.target_lang, 'pt-PT');
  });
});

describe('mergeImport', () => {
  it('creates missing briefs as draft with an episode skeleton each', () => {
    const plan = planImport(seed, emptyImportExisting());
    assert.equal(plan.briefs.create.length, 20);
    assert.ok(plan.briefs.create.every((b) => b.status === 'draft' && !b.admin_edited));
    assert.equal(plan.episodes.create.length, 20);
    for (const e of plan.episodes.create) {
      assert.equal(e.version, 1);
      assert.equal(e.stages.brief.status, 'draft');
      assert.equal(e.stages.script.status, 'none');
    }
    assert.equal(plan.voices.create.length, seed.voices.length);
    assert.equal(plan.moments.create.length, seed.moments.length);
    assert.ok(plan.settings.create);
  });

  it('skips admin-edited and approved briefs, never overwrites them', () => {
    const base = applyImportPlan(
      emptyImportExisting(),
      planImport(seed, emptyImportExisting()),
    );
    const [a, b, c] = seed.briefs;
    const existing = {
      ...base,
      briefs: base.briefs.map((x) => {
        if (x.slug === a.slug) return { ...x, admin_edited: true, source_hash: 'old' };
        if (x.slug === b.slug) return { ...x, status: 'approved', source_hash: 'old' };
        if (x.slug === c.slug) return { ...x, source_hash: 'old' };
        return x;
      }),
    };
    const plan = planImport(seed, existing);
    assert.deepEqual(plan.briefs.skipped, [
      { slug: a.slug, reason: 'admin_edited' },
      { slug: b.slug, reason: 'approved' },
    ]);
    // A plain draft with a changed seed is refreshed.
    assert.deepEqual(
      plan.briefs.update.map((x) => x.slug),
      [c.slug],
    );
    assert.equal(plan.briefs.create.length, 0);
  });

  it('keeps existing voices and moments, adding only new keys', () => {
    const existing = {
      ...emptyImportExisting(),
      voices: [{ key: seed.voices[0].key }],
      moments: [{ id: seed.moments[0].id }],
    };
    const plan = planImport(seed, existing);
    assert.deepEqual(plan.voices.kept, [seed.voices[0].key]);
    assert.equal(plan.voices.create.length, seed.voices.length - 1);
    assert.deepEqual(plan.moments.kept, [seed.moments[0].id]);
    assert.equal(plan.moments.create.length, seed.moments.length - 1);
  });

  it('a second import changes nothing', () => {
    const first = planImport(seed, emptyImportExisting());
    const state = applyImportPlan(emptyImportExisting(), first);
    const second = planImport(seed, state);
    assert.equal(importPlanHasChanges(second), false);
    const s = summarizeImportPlan(second);
    assert.equal(s.briefs_created + s.briefs_updated + s.episodes_created, 0);
    assert.equal(s.briefs_unchanged, 20);
  });
});

describe('stages', () => {
  it('markStale flags only later stages that have output', () => {
    const s = defaultStages();
    s.script.status = 'ready';
    s.tokens.status = 'ready';
    s.audio.status = 'ready';
    const next = markStale(s, 'script', 'السكريبت اتغير');
    assert.equal(next.tokens.stale, true);
    assert.equal(next.audio.stale, true);
    assert.equal(next.review.stale, false);
    assert.equal(next.images.stale, false);
    assert.equal(next.script.stale, false);
    assert.equal(next.tokens.status, 'ready');
  });
});

describe('episode list', () => {
  const ep = (slug: string, level: number, order: number, type: 'story' | 'podcast') =>
    buildEpisodeRow({
      slug,
      version: 1,
      status: 'draft',
      type,
      target_level: level,
      sort_order: order,
      stages: defaultStages(),
    });

  it('sorts by level then order and filters by type, level and bucket', () => {
    const rows = [
      ep('c', 2, 3, 'story'),
      ep('a', 1, 2, 'podcast'),
      ep('b', 1, 1, 'story'),
    ];
    assert.deepEqual(
      sortEpisodeRows(rows).map((r) => r.slug),
      ['b', 'a', 'c'],
    );
    assert.deepEqual(
      filterEpisodeRows(rows, { type: 'story' }).map((r) => r.slug),
      ['c', 'b'],
    );
    assert.deepEqual(
      filterEpisodeRows(rows, { level: 1 }).map((r) => r.slug),
      ['a', 'b'],
    );
  });

  it('buckets by stage and parses query filters', () => {
    const st = defaultStages();
    assert.equal(stageBucket(st), null);
    st.script.status = 'ready';
    assert.equal(stageBucket(st), 'needs_review');
    st.review.status = 'approved';
    assert.equal(stageBucket(st), 'needs_audio');
    st.brief.status = 'approved';
    st.voices.status = 'ok';
    st.audio.status = 'ready';
    assert.equal(stageBucket(st), 'ready_to_publish');
    st.publish.status = 'published';
    assert.equal(stageBucket(st), 'published');
    const f = parseEpisodeFilters(
      new URLSearchParams('type=podcast&level=3&stage=needs_audio'),
    );
    assert.deepEqual(f, { type: 'podcast', level: 3, bucket: 'needs_audio' });
    assert.deepEqual(parseEpisodeFilters(new URLSearchParams('type=x&level=9')), {});
  });
});

describe('reorder within a level', () => {
  const rows = [
    { slug: 'a', sort_order: 5 },
    { slug: 'b', sort_order: 6 },
    { slug: 'c', sort_order: 7 },
  ];
  it('reuses the level pool of sort orders in the new order', () => {
    const out = planReorder(rows, ['c', 'a', 'b']);
    const map = Object.fromEntries(
      rows.map((r) => [r.slug, out.find((o) => o.slug === r.slug)?.sort_order ?? r.sort_order]),
    );
    assert.deepEqual(map, { c: 5, a: 6, b: 7 });
  });
  it('rejects slugs from another level or duplicates', () => {
    assert.throws(() => planReorder(rows, ['a', 'b']), ReorderError);
    assert.throws(() => planReorder(rows, ['a', 'b', 'x']), ReorderError);
    assert.throws(() => planReorder(rows, ['a', 'a', 'b']), ReorderError);
  });
});

describe('A5 and admin routes', () => {
  it('v2_library_progress is user-keyed', () => {
    assert.ok(USER_KEYED_V2_COLLECTIONS.includes('v2_library_progress'));
  });

  it('every library admin route calls denyUnlessV2Admin first', () => {
    const routes = [
      'app/api/v2/admin/library/episodes/route.ts',
      'app/api/v2/admin/library/import/route.ts',
      'app/api/v2/admin/library/episodes/reorder/route.ts',
      'app/api/v2/admin/library/episodes/[slug]/route.ts',
    ];
    for (const r of routes) {
      const src = readFileSync(join(root, r), 'utf8');
      assert.match(src, /denyUnlessV2Admin/, r);
      const gate = src.indexOf('await denyUnlessV2Admin()');
      assert.ok(gate > 0, `${r} awaits the gate`);
      for (const marker of ['mongoConfigured()', 'req.json()', 'listEpisodes(', 'importFromContent(', 'reorderEpisodes(', 'getEpisodeWithBrief(']) {
        const at = src.lastIndexOf(marker);
        if (at > 0) assert.ok(gate < at, `${r}: gate before ${marker}`);
      }
    }
  });
});
