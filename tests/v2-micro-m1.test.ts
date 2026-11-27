import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { USER_KEYED_V2_COLLECTIONS } from '../lib/v2/auth/userKeyedCollections';
import {
  countOutlineClips,
  loadMicroOutline,
  MicroOutlineError,
  parseMicroOutline,
} from '../lib/v2/micro/outline';
import {
  V2MicroClipModel,
  V2MicroDailyModel,
  V2MicroProgressModel,
  V2MicroSeriesModel,
} from '../lib/v2/mongo/microModels';

describe('M1 · micro models', () => {
  it('exports model factories as functions', () => {
    assert.equal(typeof V2MicroSeriesModel, 'function');
    assert.equal(typeof V2MicroClipModel, 'function');
    assert.equal(typeof V2MicroProgressModel, 'function');
    assert.equal(typeof V2MicroDailyModel, 'function');
  });
});

describe('M1 · A5 user-keyed collections', () => {
  it('includes v2_micro_progress and v2_micro_daily', () => {
    assert.ok(
      (USER_KEYED_V2_COLLECTIONS as readonly string[]).includes(
        'v2_micro_progress',
      ),
    );
    assert.ok(
      (USER_KEYED_V2_COLLECTIONS as readonly string[]).includes(
        'v2_micro_daily',
      ),
    );
  });
});

describe('M1 · outline loader', () => {
  it('loads 63 series and 146 clips for pt-PT', () => {
    const outline = loadMicroOutline();
    assert.equal(outline.target_lang, 'pt-PT');
    assert.equal(outline.series.length, 63);
    assert.equal(countOutlineClips(outline), 146);
    assert.ok(outline.series.every((s) => s.clips.every((c) => c.layout)));
    assert.ok(outline.series.every((s) => s.clips.every((c) => c.level >= 1)));
    const layouts = new Set(
      outline.series.flatMap((s) => s.clips.map((c) => c.layout)),
    );
    assert.ok(layouts.has('list'));
    assert.ok(layouts.has('pairs'));
    assert.ok(layouts.has('scene'));
    assert.ok(layouts.has('rule'));
  });

  it('rejects a clip without layout', () => {
    assert.throws(
      () =>
        parseMicroOutline({
          target_lang: 'pt-PT',
          series: [
            {
              slug: 's',
              order: 1,
              title_ar: 'س',
              title_tl: 's',
              clips: [
                {
                  slug: 'c',
                  order: 1,
                  level: 1,
                  title_ar: 'ك',
                  title_tl: 'c',
                },
              ],
            },
          ],
        }),
      (err: unknown) =>
        err instanceof MicroOutlineError &&
        /missing layout/i.test(err.message),
    );
  });

  it('rejects a clip without level', () => {
    assert.throws(
      () =>
        parseMicroOutline({
          target_lang: 'pt-PT',
          series: [
            {
              slug: 's',
              order: 1,
              title_ar: 'س',
              title_tl: 's',
              clips: [
                {
                  slug: 'c',
                  order: 1,
                  layout: 'list',
                  title_ar: 'ك',
                  title_tl: 'c',
                },
              ],
            },
          ],
        }),
      (err: unknown) =>
        err instanceof MicroOutlineError && /missing level/i.test(err.message),
    );
  });
});
