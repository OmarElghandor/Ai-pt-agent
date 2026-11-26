import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyVisionBoxes,
  boxToPixels,
  canPublishSceneLines,
  fallbackBoxForIndex,
  iconKeyForConcept,
  isValidFractionBox,
  locateSceneRegions,
  normaliseBox,
  planIcon,
} from '../lib/v2/micro/images';

describe('M3 · icons', () => {
  it('reuses a ready icon key at no cost', async () => {
    const key = iconKeyForConcept('cake');
    const ready = new Set([key]);
    const plan = await planIcon({ concept_en: 'cake', readyKeys: ready });
    assert.equal(plan.reused, true);
    assert.equal(plan.cost, 0);
    assert.equal(plan.key, 'icon.cake');
  });

  it('charges when icon is missing', async () => {
    const plan = await planIcon({
      concept_en: 'new_thing',
      readyKeys: new Set(),
    });
    assert.equal(plan.reused, false);
    assert.equal(plan.cost, 1);
  });
});

describe('M3 · scene boxes', () => {
  it('stores boxes as fractions between 0 and 1', () => {
    const box = normaliseBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.25 });
    assert.ok(isValidFractionBox(box));
    assert.ok(box.x >= 0 && box.x <= 1);
    assert.ok(box.y >= 0 && box.y <= 1);
    assert.ok(box.w >= 0 && box.w <= 1);
    assert.ok(box.h >= 0 && box.h <= 1);
  });

  it('flags a missing box and blocks publish', () => {
    const results = applyVisionBoxes(
      ['cake under finger', 'coffee cup'],
      [{ hint: 'cake under finger', box: { x: 0.2, y: 0.3, w: 0.2, h: 0.2 } }],
    );
    assert.equal(results[0]?.flagged, false);
    assert.equal(results[1]?.flagged, true);
    assert.equal(results[1]?.box, null);
    assert.equal(
      canPublishSceneLines([
        { box: results[0]!.box, box_flagged: false },
        { box: null, box_flagged: true },
      ]),
      false,
    );
  });

  it('same fractions land on proportional spots at 360 and 430 widths', () => {
    const box = { x: 0.25, y: 0.4, w: 0.2, h: 0.15 };
    const a = boxToPixels(box, 360, 270);
    const b = boxToPixels(box, 430, 322.5);
    assert.ok(Math.abs(a.left / 360 - b.left / 430) < 1e-9);
    assert.ok(Math.abs(a.top / 270 - b.top / 322.5) < 1e-9);
  });

  it('fallback box stays within 0–1', () => {
    for (let i = 0; i < 8; i++) {
      const box = fallbackBoxForIndex(i, 8);
      assert.ok(isValidFractionBox(box), `index ${i}`);
    }
  });

  it('locateSceneRegions maps stub vision into boxes', async () => {
    const results = await locateSceneRegions({
      imageUrl: 'https://example.com/x.png',
      hints: ['cake under finger', 'coffee cup'],
      callVision: async () => [
        { hint: 'cake under finger', box: { x: 0.2, y: 0.3, w: 0.2, h: 0.2 } },
      ],
    });
    assert.equal(results.length, 2);
    assert.equal(results[0]?.flagged, false);
    assert.ok(results[0]?.box);
    assert.equal(results[1]?.flagged, true);
    assert.equal(results[1]?.box, null);
  });
});
