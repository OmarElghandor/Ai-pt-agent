import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  checkScript,
  lineAnchor,
  warningAnchor,
  type ScriptCheckContext,
} from '../lib/v2/library/scriptChecks';
import {
  enqueueJob,
  memoryJobStore,
  markJobRunning,
} from '../lib/v2/library/jobs';
import {
  applyLineReplacements,
  buildRewriteWindow,
  targetIndices,
} from '../lib/v2/library/scriptRewrite';
import { callWithRetry, type CallModel } from '../lib/v2/library/scriptModel';
import type { EpisodeLine } from '../lib/v2/library/scriptGenerate';

const sampleLines = Array.from({ length: 16 }, (_, i) => ({
  speaker: i % 2 === 0 ? 'yassin' : 'sofia',
  tl: `linha ${i}`,
  ar: `معنى ${i}`,
  scene: 1,
  moment: i === 5 || i === 6 ? 'm1' : '',
}));

const ctx: ScriptCheckContext = {
  cast_keys: ['yassin', 'sofia'],
  moments: [
    { id: 'm1', direction: 'يسأل', must_say: '' },
    { id: 'm2', direction: 'يتسأل', must_say: '' },
    { id: 'm3', direction: 'يسمع', must_say: '' },
  ],
  target_level: 2,
};

describe('LA3 · script checks', () => {
  it('warnings link to lines via #line-N', () => {
    const raw = {
      title_tl: 't',
      title_ar: 'ع',
      lines: sampleLines.map((l, i) =>
        i === 2 ? { ...l, tl: 'a / b', ar: '' } : l,
      ),
      notes: [],
    };
    const r = checkScript(raw, ctx);
    assert.ok(r.ok);
    const slash = r.warnings.find((w) => w.code === 'tl_slash');
    const ar = r.warnings.find((w) => w.code === 'ar_missing');
    assert.equal(slash?.line_index, 2);
    assert.equal(ar?.line_index, 2);
    assert.equal(warningAnchor(slash!), `#${lineAnchor(2)}`);
  });

  it('fatal under 15 lines', () => {
    const r = checkScript(
      {
        title_tl: 't',
        title_ar: 'ع',
        lines: sampleLines.slice(0, 5),
        notes: [],
      },
      ctx,
    );
    assert.equal(r.ok, false);
    assert.ok(r.fatal.some((f) => f.code === 'too_few_lines'));
  });
});

describe('LA3 · line rewrite pure', () => {
  it('changes only the target line and marks audio/tokens stale', () => {
    const lines: EpisodeLine[] = sampleLines.map((l) => ({
      ...l,
      tokens: [{ surface: 'x' }],
      audio_stale: false,
      audio_key: 'old',
    }));
    const targets = targetIndices(lines, { mode: 'line', line_index: 3 });
    assert.deepEqual(targets, [3]);
    const { context } = buildRewriteWindow(lines, targets);
    assert.ok(context.some((c) => c.index === 0));
    assert.ok(context.some((c) => c.index === 3));

    const merged = applyLineReplacements(
      lines,
      [3],
      [{ speaker: 'sofia', tl: 'novo', ar: 'جديد', scene: 1, moment: '' }],
      ['yassin', 'sofia'],
    );
    assert.equal(merged.error, undefined);
    assert.equal(merged.lines[3].tl, 'novo');
    assert.equal(merged.lines[3].audio_stale, true);
    assert.equal(merged.lines[3].tokens, undefined);
    assert.equal(merged.lines[2].tl, sampleLines[2].tl);
    assert.equal(merged.lines[2].audio_stale, false);
    assert.ok(merged.lines[2].tokens);
  });

  it('moment rewrite targets every line of that moment', () => {
    const idx = targetIndices(sampleLines, { mode: 'moment', moment_id: 'm1' });
    assert.deepEqual(idx, [5, 6]);
  });
});

describe('LA3 · job concurrency + retry', () => {
  it('second enqueue while running is refused', async () => {
    const store = memoryJobStore();
    const a = await enqueueJob('library_script', 'ginasio-dia', {}, store);
    assert.equal(a.ok, true);
    if (!a.ok) return;
    await markJobRunning(store, a.job.id);
    const b = await enqueueJob('library_script', 'ginasio-dia', {}, store);
    assert.equal(b.ok, false);
    if (b.ok) return;
    assert.equal(b.conflict, true);
  });

  it('fatal output retries once then keeps raw', async () => {
    let calls = 0;
    const callModel: CallModel = async () => {
      calls += 1;
      return { data: { not: 'a script' }, text: `RAW_ATTEMPT_${calls}` };
    };
    const result = await callWithRetry({
      callModel,
      system: 's',
      user: 'u',
      maxTokens: 100,
      label: 'test',
      parse: (data) => {
        const checked = checkScript(data, ctx);
        if (!checked.ok || !checked.script) return { fatal: checked.fatal };
        return { value: checked.script };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 2);
    if (result.ok) return;
    assert.equal(result.attempts.length, 2);
    assert.match(result.attempts[0].raw, /RAW_ATTEMPT_1/);
    assert.match(result.attempts[1].raw, /RAW_ATTEMPT_2/);
  });
});

describe('LA3 · routes gate', () => {
  it('script routes call denyUnlessV2Admin', () => {
    const root = path.join(process.cwd(), 'app/api/v2/admin/library');
    const files = [
      'episodes/[slug]/script/route.ts',
      'episodes/[slug]/script/generate/route.ts',
      'episodes/[slug]/script/rewrite/route.ts',
      'jobs/[jobId]/route.ts',
    ];
    for (const f of files) {
      const src = readFileSync(path.join(root, f), 'utf8');
      assert.match(src, /denyUnlessV2Admin/, f);
    }
  });

  it('library admin API tree still gates every route', () => {
    const root = path.join(process.cwd(), 'app/api/v2/admin/library');
    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, name.name);
        if (name.isDirectory()) out.push(...walk(p));
        else if (name.name === 'route.ts') out.push(p);
      }
      return out;
    }
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8');
      assert.match(src, /denyUnlessV2Admin/, file);
    }
  });
});
