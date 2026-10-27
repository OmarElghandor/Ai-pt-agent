import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  LessonPackSchema,
  hasErrors,
  validateLessonPack,
  type LessonPack,
} from '../lib/v2/content';
import { modeForPreset } from '../lib/v2/content/page';

describe('modeForPreset', () => {
  it('derives mode from preset', () => {
    assert.equal(modeForPreset('phrases'), 'static');
    assert.equal(modeForPreset('dictionary'), 'static');
    assert.equal(modeForPreset('scene'), 'static');
    assert.equal(modeForPreset('compare'), 'guided');
    assert.equal(modeForPreset('pattern'), 'guided');
    assert.equal(modeForPreset('story'), 'guided');
    assert.equal(modeForPreset('conjugation'), 'explore');
  });
});

describe('bN/item:i on formula and panel', () => {
  it('pattern preset steps targeting formula examples validate', () => {
    const raw = JSON.parse(
      readFileSync(path.join(process.cwd(), 'examples/presets/pattern.json'), 'utf8'),
    ) as {
      items: LessonPack['items'];
      page: LessonPack['pages'][number];
      questions?: LessonPack['questions'];
    };
    const page = {
      ...raw.page,
      mode: modeForPreset(raw.page.preset ?? 'pattern'),
    };
    const pack: LessonPack = {
      lesson: {
        id: 'preset.pattern',
        target_lang: 'pt-PT',
        day: 1,
        kind: 'lesson',
        pages: [String(page.id)],
      },
      items: raw.items,
      pages: [page as LessonPack['pages'][number]],
      questions: raw.questions ?? [],
    };
    const zod = LessonPackSchema.safeParse(pack);
    const validation = validateLessonPack(pack, { mode: 'strict' });
    const targetErrors = validation.issues.filter(
      (i) => i.rule === 'bad_target' && i.message.includes('formula'),
    );
    assert.equal(
      targetErrors.length,
      0,
      targetErrors.map((e) => e.message).join('; '),
    );
    // pages_count still expected for mini packs
    void zod;
    void hasErrors;
  });

  it('story preset steps targeting panel lines validate', () => {
    const raw = JSON.parse(
      readFileSync(path.join(process.cwd(), 'examples/presets/story.json'), 'utf8'),
    ) as {
      items: LessonPack['items'];
      page: LessonPack['pages'][number];
    };
    const page = {
      ...raw.page,
      mode: modeForPreset(raw.page.preset ?? 'story'),
    };
    const pack: LessonPack = {
      lesson: {
        id: 'preset.story',
        target_lang: 'pt-PT',
        day: 7,
        kind: 'lesson',
        pages: [String(page.id)],
      },
      items: raw.items,
      pages: [page as LessonPack['pages'][number]],
      questions: [],
    };
    const validation = validateLessonPack(pack, { mode: 'strict' });
    const targetErrors = validation.issues.filter(
      (i) => i.rule === 'bad_target' && i.message.includes('panel'),
    );
    assert.equal(
      targetErrors.length,
      0,
      targetErrors.map((e) => e.message).join('; '),
    );
  });
});
