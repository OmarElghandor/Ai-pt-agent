import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  clearEnsureLocks,
  ensureMicroSeriesContent,
  isSeriesEnsuring,
  markEnsureLock,
  mergeSeriesListing,
} from '../lib/v2/micro/ensure';
import type { ModelCaller } from '../lib/v2/micro/generate';
import { planIcon, iconKeyForConcept } from '../lib/v2/micro/images';
import { loadMicroOutline } from '../lib/v2/micro/outline';

const root = join(__dirname, '..');

describe('footer tab لقطات', () => {
  it('TabBar includes /micro لقطات', () => {
    const src = readFileSync(
      join(root, 'components/v2/TabBar.tsx'),
      'utf8',
    );
    assert.match(src, /href: '\/micro'/);
    assert.match(src, /label: 'لقطات'/);
  });

  it('topics list page exists under (tabs)/micro', () => {
    const src = readFileSync(
      join(root, 'app/(v2)/(tabs)/micro/page.tsx'),
      'utf8',
    );
    assert.match(src, /MicroTopicsHome/);
  });

  it('player lives under (flow)/micro/[seriesSlug]', () => {
    const src = readFileSync(
      join(root, 'app/(v2)/(flow)/micro/[seriesSlug]/page.tsx'),
      'utf8',
    );
    assert.match(src, /ClipSheet/);
  });
});

describe('mergeSeriesListing', () => {
  it('marks outline-only series as missing', () => {
    const rows = mergeSeriesListing({
      outline: [
        {
          slug: 'demonstratives',
          order: 1,
          title_ar: 'إشارة',
          title_tl: 'este',
          clip_count: 5,
        },
      ],
      db: [],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.status, 'missing');
  });

  it('marks published DB series with ready clips as ready', () => {
    const rows = mergeSeriesListing({
      outline: [
        {
          slug: 'demonstratives',
          order: 1,
          title_ar: 'إشارة',
          title_tl: 'este',
          clip_count: 5,
        },
      ],
      db: [
        {
          id: 's1',
          slug: 'demonstratives',
          title_ar: 'إشارة',
          title_tl: 'este',
          order: 1,
          clip_count: 5,
          finished_count: 1,
          in_progress: true,
          official_deck_id: 'd1',
          levels: [1],
          status: 'published',
          ready_clip_count: 5,
        },
      ],
    });
    assert.equal(rows[0]!.status, 'ready');
    assert.equal(rows[0]!.in_progress, true);
  });

  it('marks ensuring slugs as generating', () => {
    const rows = mergeSeriesListing({
      outline: [
        {
          slug: 'demonstratives',
          order: 1,
          title_ar: 'إشارة',
          title_tl: 'este',
          clip_count: 5,
        },
      ],
      db: [],
      ensuringSlugs: new Set(['demonstratives']),
    });
    assert.equal(rows[0]!.status, 'generating');
  });
});

describe('ensure locks', () => {
  it('returns generating when lock is held', async () => {
    clearEnsureLocks();
    markEnsureLock('pt-PT', 'demonstratives');
    assert.equal(isSeriesEnsuring('pt-PT', 'demonstratives'), true);
    const result = await ensureMicroSeriesContent({
      seriesSlug: 'demonstratives',
      forceGenerating: true,
      skipImages: true,
    });
    assert.equal(result.status, 'generating');
    clearEnsureLocks();
  });
});

describe('ensureMicroSeriesContent idempotent (stub model)', () => {
  it('does not call model when all clips already ready', async () => {
    clearEnsureLocks();
    const outline = loadMicroOutline();
    const series = outline.series.find((s) => s.slug === 'demonstratives');
    assert.ok(series);
    let calls = 0;
    const callModel: ModelCaller = async () => {
      calls += 1;
      throw new Error('model should not run');
    };
    const ready = new Set(series!.clips.map((c) => c.slug));
    const result = await ensureMicroSeriesContent({
      seriesSlug: 'demonstratives',
      callModel,
      dryRun: true,
      skipImages: true,
      alreadyReadySlugs: ready,
    });
    assert.equal(result.status, 'ready');
    assert.equal(result.generated, 0);
    assert.equal(calls, 0);
    // Second tap same state
    const again = await ensureMicroSeriesContent({
      seriesSlug: 'demonstratives',
      callModel,
      dryRun: true,
      skipImages: true,
      alreadyReadySlugs: ready,
    });
    assert.equal(again.generated, 0);
    assert.equal(calls, 0);
  });

  it('missing series triggers exactly one generate path per clip', async () => {
    clearEnsureLocks();
    const outline = loadMicroOutline();
    const series = outline.series.find((s) => s.slug === 'demonstratives');
    assert.ok(series);
    const n = series!.clips.length;
    let calls = 0;
    const callModel: ModelCaller = async () => {
      calls += 1;
      // Minimal invalid payload — generate fails, but path was invoked once per clip
      return { data: { lines: [] }, latency_ms: 1 };
    };
    const result = await ensureMicroSeriesContent({
      seriesSlug: 'demonstratives',
      callModel,
      dryRun: true,
      skipImages: true,
      alreadyReadySlugs: new Set(),
    });
    assert.equal(calls, n);
    assert.equal(result.clip_count, n);
  });

  it('failed ensure returns clip_errors shape', async () => {
    clearEnsureLocks();
    const callModel: ModelCaller = async () => ({
      data: { lines: [] },
      latency_ms: 1,
    });
    const result = await ensureMicroSeriesContent({
      seriesSlug: 'demonstratives',
      callModel,
      dryRun: true,
      skipImages: true,
      alreadyReadySlugs: new Set(),
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.error, 'no_ready_clips');
    assert.ok(result.clip_errors?.length);
    assert.ok(result.clip_errors![0]!.slug);
    assert.ok(result.clip_errors![0]!.reason);
    assert.ok(result.clip_errors![0]!.message);
  });

  it('per-clip throw is recorded without aborting the series', async () => {
    clearEnsureLocks();
    const outline = loadMicroOutline();
    const series = outline.series.find((s) => s.slug === 'demonstratives');
    assert.ok(series);
    let i = 0;
    const callModel: ModelCaller = async () => {
      i += 1;
      if (i === 1) throw new Error('boom_first');
      return { data: { lines: [] }, latency_ms: 1 };
    };
    const result = await ensureMicroSeriesContent({
      seriesSlug: 'demonstratives',
      callModel,
      dryRun: true,
      skipImages: true,
      alreadyReadySlugs: new Set(),
    });
    assert.equal(result.status, 'failed');
    assert.ok(result.clip_errors?.some((e) => e.message === 'boom_first'));
    assert.equal(result.clip_errors?.length, series!.clips.length);
  });
});

describe('icon reuse (M3)', () => {
  it('ready icon key reused at cost 0', async () => {
    const key = iconKeyForConcept('cake');
    const plan = await planIcon({
      concept_en: 'cake',
      readyKeys: new Set([key]),
    });
    assert.equal(plan.reused, true);
    assert.equal(plan.cost, 0);
  });
});
