import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import {
  StoryDocSchema,
  normalizeStoryForSave,
  parseStoryDoc,
  storyIdFor,
  type StoryDoc,
} from '../lib/v2/content/story';
import { StoryToolSchema } from '../lib/v2/generation/lesson/jobs/runStory';
import { zodToolSchema } from '../lib/generation/claudeClient';
import { PageSchema } from '../lib/v2/content/page';
import { V2_JOB_KINDS } from '../lib/v2/mongo/models';
import type { CoreItem } from '../lib/v2/generation/lesson/coreItems';
import {
  autoFixStoryLines,
  checkStory,
  formatStoryRetryHints,
  scanStoryExtras,
} from '../lib/v2/generation/lesson/storyChecks';
import {
  buildSceneImageSpec,
  enrichStoryDocument,
  sideForSpeaker,
} from '../lib/v2/generation/lesson/storyCodeEnrich';
import {
  buildStoryAllowedVocab,
  buildStoryItemDigestLines,
} from '../lib/v2/generation/lesson/storyAllowed';
import { coreItemsThroughDay } from '../lib/v2/generation/lesson/coreItems';
import { buildStoryHandoff } from '../lib/v2/generation/lesson/handoffs';
import { buildStorySystemPrompt } from '../lib/v2/generation/lesson/prompts/story';
import { approxTokens, BUDGET } from '../lib/v2/generation/lesson/budgets';
import { clearLineAudioOnTlChange } from '../lib/v2/storyAudio';
import { normToken } from '../lib/v2/generation/lesson/functionWords';

function word(id: string, tl: string): Item {
  return {
    type: 'word',
    id,
    tl,
    ar: 'x',
    say: 'x',
  } as Item;
}

function phrase(id: string, tl: string, role?: 'heard' | 'said'): Item {
  return {
    type: 'phrase',
    id,
    tl,
    ar: 'x',
    say: 'x',
    role: role ?? 'said',
  } as Item;
}

function baseStory(overrides: Partial<StoryDoc> = {}): StoryDoc {
  const lines = [
    {
      speaker: 'ines',
      tl: 'Bom dia!',
      ar: 'صباح الخير!',
      ids: ['phrase.good_morning'],
    },
    {
      speaker: 'learner',
      tl: 'Bom dia!',
      ar: 'صباح الخير!',
      ids: ['phrase.good_morning'],
      replies_to: 0,
    },
    {
      speaker: 'ines',
      tl: 'Quanto custa?',
      ar: 'بكم؟',
      ids: ['phrase.how_much'],
    },
    {
      speaker: 'learner',
      tl: 'Queria pão, por favor.',
      ar: 'أريد خبزاً من فضلك.',
      ids: ['phrase.queria', 'food.bread', 'pattern.queria_noun'],
      replies_to: 2,
    },
    {
      speaker: 'ines',
      tl: 'São dois euros.',
      ar: 'يوروَين.',
      ids: ['phrase.two_euros'],
    },
    {
      speaker: 'learner',
      tl: 'Obrigado!',
      ar: 'شكراً!',
      ids: ['phrase.thanks'],
      replies_to: 4,
    },
  ];
  return StoryDocSchema.parse({
    id: storyIdFor(3),
    day: 3,
    target_lang: 'pt-PT',
    version: 1,
    status: 'draft',
    cast: [
      { id: 'learner', name: 'أنت', role: 'learner' },
      { id: 'ines', name: 'Inês', role: 'character' },
    ],
    setting: 'padaria in Lisbon',
    lines,
    ...overrides,
  });
}

const day3Items: Item[] = [
  phrase('phrase.good_morning', 'Bom dia!'),
  phrase('phrase.queria', 'Queria pão, por favor.'),
  word('food.bread', 'pão'),
  phrase('phrase.how_much', 'Quanto custa?', 'heard'),
  phrase('phrase.two_euros', 'São dois euros.', 'heard'),
  phrase('phrase.thanks', 'Obrigado!'),
  {
    type: 'pattern',
    id: 'pattern.queria_noun',
    tl: 'Queria …',
    kind: 'quero_noun',
    slots: [{ name: 'noun', fills: ['food.bread'] }],
    examples: ['pattern.queria_noun.ex.1'],
  } as unknown as Item,
];

const day3Core: CoreItem[] = [
  { id: 'phrase.good_morning', kind: 'phrase', tl: 'Bom dia!', eg: 'x' },
  { id: 'phrase.queria', kind: 'phrase', tl: 'Queria pão, por favor.', eg: 'x' },
  { id: 'food.bread', kind: 'word', tl: 'pão', eg: 'x' },
  { id: 'phrase.how_much', kind: 'phrase', tl: 'Quanto custa?', eg: 'x' },
  { id: 'phrase.two_euros', kind: 'phrase', tl: 'São dois euros.', eg: 'x' },
  { id: 'phrase.thanks', kind: 'phrase', tl: 'Obrigado!', eg: 'x' },
  { id: 'pattern.queria_noun', kind: 'pattern', tl: 'Queria …', eg: 'x' },
];

function day3Allowed(extraItems: Item[] = []): Set<string> {
  const prior = coreItemsThroughDay(2);
  const knownById = new Map<string, Item>();
  for (const c of prior) {
    knownById.set(c.id, {
      type: c.kind === 'word' ? 'word' : c.kind === 'pattern' ? 'pattern' : 'phrase',
      id: c.id,
      tl: c.tl,
      ar: '',
    } as Item);
  }
  return buildStoryAllowedVocab({
    day: 3,
    coreItems: day3Core,
    recycleIds: [],
    items: [...day3Items, ...extraItems],
    knownById,
  });
}

function checkDay3(
  story: StoryDoc,
  overrides: Partial<Parameters<typeof checkStory>[0]> = {},
) {
  return checkStory({
    story,
    coreItems: day3Core,
    items: day3Items,
    allowedTokens: day3Allowed(),
    chatCharacter: 'ines',
    ...overrides,
  }).filter((i) => i.tier === 'fatal');
}

describe('story builder schema', () => {
  it('accepts a story pointer page with story_id and empty blocks', () => {
    const page = PageSchema.parse({
      id: 'p0_story',
      preset: 'story',
      mode: 'static',
      role: 'intro',
      story_id: storyIdFor(3),
      title: [{ text: 'القصة', lang: 'eg' }],
      blocks: [],
    });
    assert.equal(page.story_id, 'pt-PT.day-03');
  });

  it('rejects non-story pages with empty blocks', () => {
    const r = PageSchema.safeParse({
      id: 'p1',
      preset: 'phrases',
      mode: 'static',
      title: [{ text: 'x', lang: 'eg' }],
      blocks: [],
    });
    assert.equal(r.success, false);
  });

  it('includes story in V2_JOB_KINDS after items', () => {
    assert.ok(V2_JOB_KINDS.includes('story'));
    assert.ok(V2_JOB_KINDS.indexOf('story') > V2_JOB_KINDS.indexOf('items'));
    assert.ok(V2_JOB_KINDS.indexOf('story') < V2_JOB_KINDS.indexOf('outline'));
  });

  it('parses Mongo/model null extra and replies_to as undefined', () => {
    const parsed = parseStoryDoc({
      id: storyIdFor(3),
      day: 3,
      target_lang: 'pt-PT',
      version: 1,
      status: 'ready',
      cast: [
        { id: 'learner', name: 'أنت', role: 'learner' },
        { id: 'ines', name: 'Inês', role: 'character' },
      ],
      setting: 'padaria',
      lines: [
        {
          speaker: 'ines',
          tl: 'Bom dia!',
          ids: ['phrase.good_morning'],
          extra: null,
          replies_to: null,
          ar: null,
          side: null,
          audio: null,
          options: null,
        },
      ],
      image_spec: null,
      scenes: null,
      is_weekly: null,
    });
    assert.equal(parsed.lines[0]!.extra, undefined);
    assert.equal(parsed.lines[0]!.replies_to, undefined);
    assert.equal(parsed.lines[0]!.ar, undefined);
    assert.equal(parsed.image_spec, undefined);
    assert.equal(parsed.scenes, undefined);
    assert.equal(parsed.is_weekly, undefined);

    const saved = normalizeStoryForSave(parsed);
    assert.ok(!('extra' in saved.lines[0]!));
    assert.ok(!('replies_to' in saved.lines[0]!));
  });

  it('StoryToolSchema converts to JSON Schema (no transforms)', () => {
    const json = zodToolSchema(StoryToolSchema);
    assert.equal(typeof json, 'object');
    assert.ok(json.properties || json.type === 'object');
    // Also accepts null optionals
    const ok = StoryToolSchema.safeParse({
      cast: [
        { id: 'learner', name: 'أنت', role: 'learner' },
        { id: 'ines', name: 'Inês', role: 'character' },
      ],
      setting: 'padaria',
      lines: [
        {
          speaker: 'ines',
          tl: 'Bom dia!',
          ids: null,
          extra: null,
          replies_to: null,
        },
      ],
      scenes: null,
    });
    assert.equal(ok.success, true);
  });
});

describe('story checks', () => {
  it('Day 3 fixture with days 1–2 known passes extras', () => {
    let story = baseStory();
    // Second use of grammar focus (line 3 already has pattern id in baseStory).
    story.lines[0]!.ids = [
      ...(story.lines[0]!.ids ?? []),
      'pattern.queria_noun',
    ];
    story.lines[0]!.tl = 'Queria pão, por favor.';
    story.lines[0]!.ar = 'أريد خبزاً من فضلك.';
    story.lines[0]!.ids = ['phrase.queria', 'food.bread', 'pattern.queria_noun'];
    // Code owns Arabic — enrich before ar_sentence_gap checks.
    story = enrichStoryDocument(story, day3Items, []);
    const fatals = checkDay3(story, {
      grammarFocusId: 'pattern.queria_noun',
    });
    assert.deepEqual(
      fatals,
      [],
      fatals.map((f) => `${f.rule}: ${f.message}`).join('; '),
    );
    assert.ok((story.after_questions?.length ?? 0) >= 3);
  });

  it('"Sim, o pão é aqui." counts 0 extras', () => {
    const allowed = day3Allowed();
    assert.ok(allowed.has(normToken('pão')));
    const scan = scanStoryExtras({
      lines: [{ tl: 'Sim, o pão é aqui.' }],
      allowedTokens: allowed,
    });
    assert.equal(scan.extraOccurrenceCount, 0);
    assert.equal(scan.extraTokens.length, 0);
  });

  it('core plural_tl surfaces are allowed (maçãs, ovos)', () => {
    const allowed = buildStoryAllowedVocab({
      day: 3,
      coreItems: [
        {
          id: 'word.apple',
          kind: 'word',
          tl: 'a maçã',
          eg: 'x',
          plural_tl: 'as maçãs',
        },
        {
          id: 'word.egg',
          kind: 'word',
          tl: 'o ovo',
          eg: 'x',
          plural_tl: 'os ovos',
        },
      ],
      recycleIds: [],
      // Draft item without plural_tl must not shrink the set
      items: [word('word.apple', 'a maçã'), word('word.egg', 'o ovo')],
      knownById: new Map(),
    });
    assert.ok(allowed.has(normToken('maçãs')));
    assert.ok(allowed.has(normToken('ovos')));
    const scan = scanStoryExtras({
      lines: [{ tl: 'As maçãs e os ovos.' }],
      allowedTokens: allowed,
    });
    assert.equal(
      scan.extraOccurrenceCount,
      0,
      `unexpected extras: ${scan.extraTokens.join(', ')}`,
    );
  });

  it('retry message lists offending extra tokens', () => {
    const story = baseStory();
    story.lines[0] = {
      ...story.lines[0]!,
      tl: 'Bom dia! Queria pão e prateleira na caixa.',
      ids: ['phrase.good_morning', 'phrase.queria', 'food.bread'],
    };
    const fatals = checkDay3(story, {
      grammarFocusId: 'pattern.queria_noun',
      coreItems: day3Core,
    });
    // Force over-budget if not already (prateleira/caixa should trigger)
    const over = fatals.find((f) => f.rule === 'extra_over_budget');
    if (!over) {
      // Inject many extras to guarantee budget fail
      story.lines.push(
        {
          speaker: 'ines',
          tl: 'prateleira caixa geladeira mercado loja',
          ids: [],
        },
        {
          speaker: 'learner',
          tl: 'prateleira caixa geladeira',
          ids: [],
          replies_to: 0,
        },
      );
    }
    const fatals2 = checkDay3(story, { grammarFocusId: 'pattern.queria_noun' });
    const msg = formatStoryRetryHints(fatals2);
    assert.ok(
      /prateleira|caixa|geladeira|mercado|loja/.test(msg),
      `retry missing tokens: ${msg}`,
    );
    assert.ok(msg.includes('extra tokens:') || fatals2.some((f) => f.rule === 'extra_over_budget'));
  });

  it('fails when a core phrase is missing', () => {
    const story = baseStory({
      lines: baseStory().lines.map((l) => ({
        ...l,
        ids: (l.ids ?? []).filter((id) => id !== 'phrase.thanks'),
        tl: l.tl.replace('Obrigado!', 'Ok.'),
      })),
    });
    const fatals = checkDay3(story, { grammarFocusId: 'pattern.queria_noun' });
    assert.ok(fatals.some((f) => f.rule === 'core_not_in_story'));
    assert.ok(formatStoryRetryHints(fatals).includes('missing:'));
  });

  it('fails on bare nouns', () => {
    const story = baseStory();
    story.lines[1] = {
      speaker: 'learner',
      tl: 'pão',
      ids: ['food.bread'],
      replies_to: 0,
    };
    const fatals = checkDay3(story);
    assert.ok(fatals.some((f) => f.rule === 'bare_noun'));
  });

  it('fails when replies_to is not before the line', () => {
    const story = baseStory();
    story.lines[1] = { ...story.lines[1]!, replies_to: 5 };
    const fatals = checkDay3(story);
    assert.ok(fatals.some((f) => f.rule === 'replies_to_order'));
  });

  it('fails on wrong line count', () => {
    const story = baseStory({
      lines: baseStory().lines.slice(0, 3),
    });
    const fatals = checkStory({
      story,
      coreItems: [],
      items: day3Items,
      allowedTokens: day3Allowed(),
      chatCharacter: 'ines',
    }).filter((i) => i.tier === 'fatal');
    assert.ok(fatals.some((f) => f.rule === 'line_count'));
  });

  it('fails when cast is not learner + character', () => {
    const story = baseStory({
      cast: [
        { id: 'ines', name: 'Inês', role: 'character' },
        { id: 'rita', name: 'Rita', role: 'character' },
      ],
    });
    const fatals = checkDay3(story, { coreItems: [] });
    assert.ok(fatals.some((f) => f.rule === 'cast_shape'));
  });

  it('fails when grammar focus appears fewer than twice', () => {
    const story = baseStory({
      lines: [
        {
          speaker: 'ines',
          tl: 'Bom dia!',
          ids: ['phrase.good_morning'],
        },
        {
          speaker: 'learner',
          tl: 'Bom dia!',
          ids: ['phrase.good_morning'],
          replies_to: 0,
        },
        {
          speaker: 'ines',
          tl: 'Quanto custa?',
          ids: ['phrase.how_much'],
        },
        {
          speaker: 'learner',
          tl: 'O pão.',
          ids: ['food.bread'],
          replies_to: 2,
        },
        {
          speaker: 'ines',
          tl: 'São dois euros.',
          ids: ['phrase.two_euros'],
        },
        {
          speaker: 'learner',
          tl: 'Obrigado!',
          ids: ['phrase.thanks'],
          replies_to: 4,
        },
      ],
    });
    const fatals = checkStory({
      story,
      coreItems: day3Core.filter((c) => c.kind !== 'pattern'),
      items: day3Items.filter((i) => i.type !== 'pattern'),
      allowedTokens: day3Allowed(),
      grammarFocusId: 'pattern.xyz_unused',
      chatCharacter: 'ines',
    }).filter((i) => i.tier === 'fatal');
    assert.ok(fatals.some((f) => f.rule === 'grammar_focus_twice'));
  });

  it('fails when extras are unglossed', () => {
    const story = baseStory();
    story.lines[0] = {
      ...story.lines[0]!,
      extra: [{ tl: 'pastel', ar: '' }],
    };
    const fatals = checkDay3(story, { coreItems: [] });
    assert.ok(fatals.some((f) => f.rule === 'extra_unglossed'));
  });

  it('auto-fix drops ids not in the line', () => {
    const itemsById = new Map(day3Items.map((i) => [i.id, i]));
    const { lines, fixes } = autoFixStoryLines(
      [
        {
          speaker: 'ines',
          tl: 'Bom dia!',
          ids: ['phrase.good_morning', 'food.bread'],
        },
      ],
      itemsById,
    );
    assert.deepEqual(lines[0]!.ids, ['phrase.good_morning']);
    assert.ok(fixes.some((f) => f.rule === 'id_not_in_line'));
  });

  it('promotes pattern.*.ex.N to parent pattern id', () => {
    const itemsById = new Map(day3Items.map((i) => [i.id, i]));
    const { lines, fixes } = autoFixStoryLines(
      [
        {
          speaker: 'ines',
          tl: 'O pão está ali.',
          ids: ['pattern.article_gender.ex.1', 'food.bread'],
        },
      ],
      itemsById,
      {
        coreItems: [
          {
            id: 'pattern.article_gender',
            kind: 'pattern',
            tl: 'o + مذكر · a + مؤنث',
            eg: 'x',
            pattern_kind: 'article_def',
          },
          {
            id: 'food.bread',
            kind: 'word',
            tl: 'o pão',
            eg: 'x',
            plural_tl: 'os pães',
          },
        ],
      },
    );
    assert.ok(lines[0]!.ids.includes('pattern.article_gender'));
    assert.ok(!lines[0]!.ids.some((id) => id.includes('.ex.')));
    assert.ok(fixes.some((f) => f.rule === 'pattern_ex_promote'));
  });

  it('PT surfaces cover Arabic-template patterns and articles.definite focus', () => {
    const articleCores: CoreItem[] = [
      {
        id: 'word.milk',
        kind: 'word',
        tl: 'o leite',
        eg: 'x',
        plural_tl: 'os leites',
      },
      {
        id: 'word.apple',
        kind: 'word',
        tl: 'a maçã',
        eg: 'x',
        plural_tl: 'as maçãs',
      },
      {
        id: 'phrase.what_is_this',
        kind: 'phrase',
        tl: 'O que é isto?',
        eg: 'x',
      },
      {
        id: 'phrase.how_much',
        kind: 'phrase',
        tl: 'Quanto custa?',
        eg: 'x',
      },
      {
        id: 'phrase.thanks',
        kind: 'phrase',
        tl: 'Obrigado!',
        eg: 'x',
      },
      {
        id: 'phrase.good_morning',
        kind: 'phrase',
        tl: 'Bom dia!',
        eg: 'x',
      },
      {
        id: 'pattern.article_gender',
        kind: 'pattern',
        tl: 'o + مذكر · a + مؤنث',
        eg: 'x',
        pattern_kind: 'article_def',
      },
      {
        id: 'pattern.plural_s',
        kind: 'pattern',
        tl: 'os/as + اسم + s',
        eg: 'x',
        pattern_kind: 'plural_def',
      },
    ];
    const items: Item[] = [
      word('word.milk', 'o leite'),
      word('word.apple', 'a maçã'),
      phrase('phrase.what_is_this', 'O que é isto?'),
      phrase('phrase.how_much', 'Quanto custa?'),
      phrase('phrase.thanks', 'Obrigado!'),
      phrase('phrase.good_morning', 'Bom dia!'),
      {
        type: 'pattern',
        id: 'pattern.article_gender',
        tl: 'o + مذكر · a + مؤنث',
        kind: 'article_def',
      } as unknown as Item,
      {
        type: 'pattern',
        id: 'pattern.plural_s',
        tl: 'os/as + اسم + s',
        kind: 'plural_def',
      } as unknown as Item,
    ];
    const allowed = buildStoryAllowedVocab({
      day: 3,
      coreItems: articleCores,
      recycleIds: [],
      items,
      knownById: new Map(),
    });

    const rawLines = [
      { speaker: 'rita', tl: 'Bom dia!', ids: [] as string[] },
      {
        speaker: 'learner',
        tl: 'Bom dia! O leite?',
        ids: [] as string[],
        replies_to: 0,
      },
      {
        speaker: 'rita',
        tl: 'As maçãs estão ali.',
        ids: [] as string[],
      },
      {
        speaker: 'learner',
        tl: 'O que é isto?',
        ids: [] as string[],
        replies_to: 2,
      },
      {
        speaker: 'rita',
        tl: 'Quanto custa?',
        ids: [] as string[],
      },
      {
        speaker: 'learner',
        tl: 'Obrigado!',
        ids: [] as string[],
        replies_to: 4,
      },
    ];
    const itemsById = new Map(items.map((i) => [i.id, i]));
    const { lines, fixes } = autoFixStoryLines(rawLines, itemsById, {
      allowedTokens: allowed,
      coreItems: articleCores,
    });
    assert.ok(
      fixes.some((f) => f.rule === 'pattern_auto_tag'),
      'expected pattern auto-tag',
    );
    assert.ok(
      lines.some((l) => (l.ids ?? []).includes('pattern.article_gender')),
    );
    assert.ok(lines.some((l) => (l.ids ?? []).includes('pattern.plural_s')));

    const story = StoryDocSchema.parse({
      id: storyIdFor(3),
      day: 3,
      target_lang: 'pt-PT',
      version: 1,
      status: 'draft',
      cast: [
        { id: 'learner', name: 'أنت', role: 'learner' },
        { id: 'rita', name: 'Rita', role: 'character' },
      ],
      setting: 'supermercado',
      lines,
    });
    const fatals = checkStory({
      story,
      coreItems: articleCores,
      items,
      allowedTokens: allowed,
      grammarFocusId: 'articles.definite',
      chatCharacter: 'rita',
    }).filter((i) => i.tier === 'fatal');
    assert.deepEqual(
      fatals.filter(
        (f) =>
          f.rule === 'core_not_in_story' || f.rule === 'grammar_focus_twice',
      ),
      [],
      fatals.map((f) => `${f.rule}: ${f.message}`).join('; '),
    );
  });

  it('ITEM_DIGEST skips pattern.*.ex.N and shows pattern template', () => {
    const withEx: Item[] = [
      ...day3Items,
      {
        type: 'phrase',
        id: 'pattern.queria_noun.ex.1',
        tl: 'Queria pão.',
        ar: 'x',
        say: 'x',
        context_eg: 'x',
        cloze: 'pão',
      } as Item,
    ];
    const lines = buildStoryItemDigestLines(withEx);
    assert.ok(!lines.some((l) => l.includes('.ex.')));
    assert.ok(lines.some((l) => l.startsWith('pattern.queria_noun') && l.includes('Queria')));
  });
});

describe('story code enrich', () => {
  it('sets bubble sides and after_questions', () => {
    const story = enrichStoryDocument(baseStory(), day3Items, []);
    assert.equal(sideForSpeaker(story.cast, 'learner'), 'left');
    assert.equal(sideForSpeaker(story.cast, 'ines'), 'right');
    assert.ok((story.after_questions?.length ?? 0) >= 3);
    assert.ok(
      story.after_questions?.every((q) => (q.options?.length ?? 0) >= 2),
    );
    assert.ok(story.lines.every((l) => !l.options?.length));
    assert.ok(story.image_spec?.type === 'scene');
  });

  it('builds scene image spec with both cast sheets', () => {
    const spec = buildSceneImageSpec({
      setting: 'padaria',
      cast: baseStory().cast,
    });
    assert.equal(spec.type, 'scene');
    assert.ok(spec.characters?.includes('learner'));
    assert.ok(spec.characters?.includes('ines'));
  });
});

describe('story handoff + prompt', () => {
  it('buildStoryHandoff tracks first item appearance', () => {
    const h = buildStoryHandoff(baseStory());
    assert.equal(h.story_id, 'pt-PT.day-03');
    assert.ok(h.item_first_index.some((e) => e.id === 'food.bread' && e.line === 3));
  });

  it('story system prompt stays under budget', () => {
    const n = approxTokens(buildStorySystemPrompt());
    assert.ok(n <= BUDGET.systemMax, `story prompt ~${n}`);
  });
});

describe('story audio key hygiene', () => {
  it('clears audio when tl changes', () => {
    const cleared = clearLineAudioOnTlChange(
      { tl: 'Bom dia!', audio: { normal: 'k1' } },
      'Boa tarde!',
    );
    assert.equal(cleared, undefined);
    const kept = clearLineAudioOnTlChange(
      { tl: 'Bom dia!', audio: { normal: 'k1' } },
      'Bom dia!',
    );
    assert.equal(kept?.normal, 'k1');
  });
});
