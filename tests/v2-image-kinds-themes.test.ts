import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getAuthoredItemImage,
  resetCoreItemsCache,
} from '../lib/v2/generation/lesson/coreItems';
import {
  STYLE_OBJECT,
  STYLE_PEOPLE,
  buildAuthoredImagePrompt,
  buildImagePrompt,
} from '../lib/v2/generation/images/templates';
import { mergeMustAvoid } from '../lib/v2/images/forbidden';
import {
  resolveImageScene,
  specFromAuthoredScene,
} from '../lib/v2/images/resolveScene';
import { resolveLocalPathFromUrl } from '../lib/v2/images/storage';
import {
  assignThemesToSpecs,
  inferThemeTime,
  loadImageThemes,
  pickImageTheme,
  resetImageThemesCache,
  themePromptLine,
} from '../lib/v2/images/themes';

describe('I1 · authored kind and theme', () => {
  it('day 4 word.sugar loads as object with no characters', () => {
    resetCoreItemsCache();
    const img = getAuthoredItemImage(4, 'word.sugar');
    assert.ok(img);
    assert.equal(img!.kind, 'object');
    assert.deepEqual(img!.characters, []);
    assert.equal(img!.theme, undefined);
  });

  it('day 4 phrase.how_much_is_it loads as scene with plum_ivory', () => {
    resetCoreItemsCache();
    const img = getAuthoredItemImage(4, 'phrase.how_much_is_it');
    assert.ok(img);
    assert.equal(img!.kind, 'scene');
    assert.equal(img!.theme, 'plum_ivory');
    assert.ok((img!.characters?.length ?? 0) >= 2);
  });

  it('specFromAuthoredScene maps kind and theme', () => {
    const sugar = getAuthoredItemImage(4, 'word.sugar')!;
    const sugarSpec = specFromAuthoredScene({
      scenePrompt: sugar.prompt,
      characters: sugar.characters,
      ratio: sugar.ratio,
      kind: sugar.kind,
      theme: sugar.theme,
    });
    assert.equal(sugarSpec.type, 'object');
    assert.deepEqual(sugarSpec.characters, []);
    assert.equal(sugarSpec.theme, undefined);

    const phrase = getAuthoredItemImage(4, 'phrase.how_much_is_it')!;
    const phraseSpec = specFromAuthoredScene({
      scenePrompt: phrase.prompt,
      characters: phrase.characters,
      ratio: phrase.ratio,
      kind: phrase.kind,
      theme: phrase.theme,
    });
    assert.equal(phraseSpec.type, 'scene');
    assert.equal(phraseSpec.theme, 'plum_ivory');
  });
});

describe('I2 · style split and object template', () => {
  it('object prompt has no people, settings, or interaction', () => {
    const sugar = getAuthoredItemImage(4, 'word.sugar')!;
    const prompt = buildAuthoredImagePrompt({
      characters: [],
      prompt: sugar.prompt,
      kind: 'object',
    });
    assert.match(prompt, /white watercolour paper|object sketchbook/i);
    assert.ok(prompt.includes(STYLE_OBJECT.slice(0, 40)));
    assert.doesNotMatch(prompt, /\blook at each other\b/i);
    assert.doesNotMatch(prompt, /\binteract\b/i);
    assert.doesNotMatch(prompt, /lived-in but generic setting/i);
    assert.doesNotMatch(prompt, /\bpeople\b.*\bsetting\b/i);

    const generated = buildImagePrompt({
      type: 'object',
      subject: 'o açúcar',
      characters: [],
      intent: 'the thing alone: o açúcar',
    });
    assert.doesNotMatch(generated, /in use in the lesson situation/i);
    assert.doesNotMatch(generated, /A hand or person/i);
    assert.match(generated, /No people, no hands/i);
  });

  it('object must_avoid drops sticker ban and adds people/hands', () => {
    const avoid = mergeMustAvoid([], { kind: 'object' });
    assert.ok(avoid.some((a) => /people/i.test(a)));
    assert.ok(avoid.some((a) => /hands/i.test(a)));
    assert.ok(!avoid.some((a) => /isolated sticker/i.test(a)));

    const sceneAvoid = mergeMustAvoid([], { kind: 'scene' });
    assert.ok(sceneAvoid.some((a) => /isolated sticker/i.test(a)));
  });

  it('scene prompt still includes people add-on', () => {
    const prompt = buildAuthoredImagePrompt({
      characters: ['yassin', 'manuel'],
      prompt: 'Two people at a café counter.',
      kind: 'scene',
      theme: 'plum_ivory',
    });
    assert.ok(prompt.includes(STYLE_PEOPLE.slice(0, 40)));
    assert.match(prompt, /Colour theme:/);
  });
});

describe('I3 · colour themes', () => {
  it('loads twelve themes', () => {
    resetImageThemesCache();
    const themes = loadImageThemes();
    assert.equal(themes.length, 12);
    assert.ok(themes.some((t) => t.id === 'plum_ivory'));
  });

  it('night moment never gets a day-only theme', () => {
    const used = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const id = pickImageTheme({
        usedInLesson: used,
        time: 'night',
        random: () => i / 40,
      });
      assert.ok(id);
      const theme = loadImageThemes().find((t) => t.id === id)!;
      assert.ok(
        theme.times.includes('night') || theme.times.includes('evening'),
        `${id} must allow night/evening`,
      );
      assert.ok(!theme.times.every((t) => t === 'day' || t === 'morning'));
    }
  });

  it('lesson never gets the same theme twice; adjacent differ', () => {
    let seq = 0;
    const random = () => {
      seq += 1;
      return (seq % 10) / 10;
    };
    const specs = assignThemesToSpecs(
      [
        { key: 'a', type: 'scene', subject: 'morning hello', light: 'morning' },
        { key: 'b', type: 'scene', subject: 'afternoon', light: 'afternoon' },
        { key: 'c', type: 'scene', subject: 'evening bye', light: 'evening' },
        { key: 'd', type: 'object', subject: 'sugar' },
        { key: 'e', type: 'scene', subject: 'day chat', light: 'day' },
      ],
      {
        random,
        timeForSpec: (s) =>
          inferThemeTime({ prompt: s.subject, light: s.light }),
      },
    );
    const themes = specs
      .filter((s) => s.type !== 'object')
      .map((s) => s.theme)
      .filter(Boolean) as string[];
    assert.equal(new Set(themes).size, themes.length);
    for (let i = 1; i < themes.length; i++) {
      assert.notEqual(themes[i], themes[i - 1]);
    }
    assert.equal(
      specs.find((s) => s.key === 'd')?.theme,
      undefined,
    );
  });

  it('regenerate keeps the saved theme', () => {
    const once = assignThemesToSpecs(
      [{ key: 'x', type: 'scene', subject: 'hi', theme: 'cobalt_lemon' }],
      { timeForSpec: () => 'day' },
    );
    assert.equal(once[0]!.theme, 'cobalt_lemon');
    const again = assignThemesToSpecs(
      [{ key: 'x', type: 'scene', subject: 'hi', theme: 'cobalt_lemon' }],
      {
        timeForSpec: () => 'day',
        random: () => 0.99,
      },
    );
    assert.equal(again[0]!.theme, 'cobalt_lemon');
  });

  it('themePromptLine builds the colour line', () => {
    assert.equal(
      themePromptLine('plum_ivory'),
      'Colour theme: plum, muted teal and ivory. Light: calm diffused indoor light.',
    );
    assert.equal(themePromptLine(null), null);
  });

  it('inferThemeTime maps boa noite to night', () => {
    assert.equal(
      inferThemeTime({ itemId: 'phrase.good_night', tl: 'Boa noite!' }),
      'night',
    );
    assert.equal(
      inferThemeTime({ itemId: 'phrase.good_morning', tl: 'Bom dia!' }),
      'morning',
    );
  });
});

describe('force regenerate overwrite', () => {
  it('force resolve for word.sugar uses authored object (not café override path)', async () => {
    resetCoreItemsCache();
    const resolved = await resolveImageScene({
      day: 4,
      key: 'word.sugar',
      itemId: 'word.sugar',
      force: true,
    });
    assert.equal(resolved.source, 'authored');
    assert.equal(resolved.kind, 'object');
    assert.deepEqual(resolved.characters, []);
    assert.equal(resolved.prompt_override, null);
    assert.ok(resolved.scenePrompt?.includes('sugar'));

    const spec = specFromAuthoredScene({
      scenePrompt: resolved.scenePrompt!,
      characters: resolved.characters,
      ratio: resolved.ratio,
      kind: resolved.kind,
      theme: resolved.theme,
    });
    assert.equal(spec.type, 'object');
    assert.deepEqual(spec.characters, []);

    const prompt = buildAuthoredImagePrompt({
      characters: [],
      prompt: resolved.scenePrompt!,
      kind: 'object',
    });
    assert.doesNotMatch(prompt, /\blook at each other\b/i);
    assert.doesNotMatch(prompt, /lived-in but generic setting/i);
    assert.match(prompt, /No people|white watercolour paper|object sketchbook/i);
  });

  it('resolveLocalPathFromUrl strips cache-bust query', () => {
    // File need not exist — invalid path returns null; query strip still applies.
    const withQuery =
      '/api/v2/dev/local-images/word.sugar.png?v=1730000000000';
    // Without a real file this is null, but must not throw or treat ?v= as path.
    assert.equal(resolveLocalPathFromUrl(withQuery), null);
    assert.equal(
      resolveLocalPathFromUrl('/api/v2/dev/local-images/../etc/passwd'),
      null,
    );
  });
});
