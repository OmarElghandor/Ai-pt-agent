import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDayDigest,
  buildItemDigest,
  buildPageDigest,
  selectKnownForDay,
} from '@/lib/v2/generation/lesson/handoffs';
import {
  minCacheableTokens,
  parseModelSpec,
  resolveJobModel,
  setModelProfile,
  shouldCachePrefix,
} from '@/lib/v2/generation/lesson/models';
import { forcedToolChoiceUnsupported } from '@/lib/generation/claudeClient';
import { priceForModel } from '@/lib/v2/generation/lesson/prices';
import { getBudget, isOverBudget } from '@/lib/v2/generation/lesson/budgets';
import type { Page } from '@/lib/v2/content/page';
import type { Item } from '@/lib/v2/content/items';

describe('selectKnownForDay', () => {
  it('returns recycle ids and tl matches only', () => {
    const pool = [
      { id: 'a', type: 'word', tl: 'olá' },
      { id: 'b', type: 'word', tl: 'queijo' },
      { id: 'c', type: 'phrase', tl: 'bom dia' },
      { id: 'd', type: 'word', tl: 'água' },
    ];
    const known = selectKnownForDay({
      pool,
      coreWords: ['queijo'],
      earlyChunks: ['bom dia'],
      recycleIds: ['a'],
    });
    const ids = known.map((k) => k.id).sort();
    assert.deepEqual(ids, ['a', 'b', 'c']);
  });
});

describe('buildItemDigest', () => {
  it('assigns roles', () => {
    const items = [
      { id: 'w1', type: 'word', tl: 'pão', ar: 'خبز' },
      { id: 'p1', type: 'phrase', tl: 'bom dia', ar: 'صباح الخير' },
      { id: 'r1', type: 'phrase', tl: 'olá', ar: 'مرحبا' },
    ] as Item[];
    const digest = buildItemDigest({
      items,
      earlyChunks: ['bom dia'],
      recycleIds: ['r1'],
      knownIds: new Set(['r1']),
    });
    assert.equal(digest.find((d) => d.id === 'w1')?.role, 'new');
    assert.equal(digest.find((d) => d.id === 'p1')?.role, 'chunk');
    assert.equal(digest.find((d) => d.id === 'r1')?.role, 'recycle');
  });
});

describe('buildPageDigest', () => {
  it('extracts tip heads and asks', () => {
    const page = {
      id: 'p1',
      preset: 'phrases',
      mode: 'static',
      blocks: [{ type: 'cards', id: 'b1', items: ['w1'] }],
      steps: [
        {
          kind: 'reveal',
          tip: [{ text: 'one two three four five six seven eight nine', lang: 'eg' }],
          target: 'b1',
        },
        {
          kind: 'ask',
          ask: {
            prompt: [{ text: 'What is bread?', lang: 'eg' }],
            options: ['a'],
            answer: 0,
          },
        },
      ],
    } as unknown as Page;
    const d = buildPageDigest({
      index: 0,
      page,
      taught_eg: 'اتعلمنا الخبز',
    });
    assert.equal(d.taught_eg, 'اتعلمنا الخبز');
    assert.ok(d.tip_heads[0]?.includes('one'));
    assert.ok(d.asks[0]?.includes('What'));
    assert.deepEqual(d.example_ids, ['w1']);
  });
});

describe('buildDayDigest', () => {
  it('includes new items and rule', () => {
    const d = buildDayDigest({
      items: [{ id: 'x', type: 'word', tl: 'sim', ar: 'نعم' }] as Item[],
      rule: 'rule',
      micro_step: 's:1',
      story_beats: ['a'],
      introduced_ids: ['x'],
    });
    assert.equal(d.rule, 'rule');
    assert.deepEqual(d.introduced_ids, ['x']);
    assert.equal(d.new_items[0]?.tl, 'sim');
  });
});

describe('budgets', () => {
  it('has per-kind rows', () => {
    assert.deepEqual(getBudget('items'), {
      system: 600,
      input: 1000,
      output: 3000,
    });
    assert.deepEqual(getBudget('continuity'), {
      system: 300,
      input: 800,
      output: 100,
    });
  });

  it('flags over budget for kind', () => {
    assert.equal(
      isOverBudget({ system: 100, input: 100, output: 100 }, 'continuity'),
      false,
    );
    assert.equal(
      isOverBudget({ system: 100, input: 100, output: 200 }, 'continuity'),
      true,
    );
  });
});

describe('models', () => {
  const ENV_KEYS = [
    'V2_MODEL_ITEMS',
    'V2_MODEL_PAGE',
    'V2_MODEL_OUTLINE',
    'V2_GEN_PROVIDER',
    'V2_KIMI_MODEL',
    'V2_GEN_MODEL',
    'DEEPINFRA_MODEL',
  ] as const;

  function withoutModelEnv(run: () => void) {
    const prev = new Map<string, string | undefined>();
    for (const key of ENV_KEYS) prev.set(key, process.env[key]);
    for (const key of ENV_KEYS) delete process.env[key];
    setModelProfile(null);
    try {
      run();
    } finally {
      setModelProfile(null);
      for (const [key, value] of prev) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it('defaults kimi for every model job', () => {
    withoutModelEnv(() => {
      assert.deepEqual(resolveJobModel('items'), {
        provider: 'kimi',
        model: 'moonshotai/Kimi-K3',
      });
      assert.equal(resolveJobModel('page').model, 'moonshotai/Kimi-K3');
      assert.equal(resolveJobModel('outline').provider, 'kimi');
      assert.equal(resolveJobModel('outline').model, 'moonshotai/Kimi-K3');
    });
  });

  it('parses provider:model specs', () => {
    assert.deepEqual(parseModelSpec('openai-compatible:Qwen/Qwen3-32B'), {
      provider: 'openai-compatible',
      model: 'Qwen/Qwen3-32B',
    });
    assert.deepEqual(parseModelSpec('kimi:moonshotai/Kimi-K3'), {
      provider: 'kimi',
      model: 'moonshotai/Kimi-K3',
    });
    assert.deepEqual(parseModelSpec('anthropic:claude-sonnet-5-5'), {
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
    });
    assert.deepEqual(parseModelSpec('moonshotai/Kimi-K3'), {
      provider: 'kimi',
      model: 'moonshotai/Kimi-K3',
    });
    assert.deepEqual(parseModelSpec('claude-haiku-5-5'), {
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    });
  });

  it('qwen-light overrides light jobs only', () => {
    withoutModelEnv(() => {
      setModelProfile('qwen-light');
      assert.equal(resolveJobModel('items').provider, 'kimi');
      assert.equal(resolveJobModel('outline').provider, 'openai-compatible');
    });
  });

  it('claude profile and V2_GEN_PROVIDER restore the sonnet/haiku split', () => {
    withoutModelEnv(() => {
      setModelProfile('claude');
      assert.equal(resolveJobModel('items').provider, 'anthropic');
      assert.equal(resolveJobModel('items').model, 'claude-sonnet-5-5');
      assert.equal(resolveJobModel('page').model, 'claude-sonnet-5-5');
      assert.equal(resolveJobModel('outline').model, 'claude-haiku-5-5');
      setModelProfile(null);
      process.env.V2_GEN_PROVIDER = 'anthropic';
      assert.equal(resolveJobModel('items').model, 'claude-sonnet-5-5');
      assert.equal(resolveJobModel('critic').model, 'claude-haiku-5-5');
      process.env.V2_GEN_PROVIDER = 'claude';
      assert.equal(resolveJobModel('page').model, 'claude-sonnet-5-5');
      process.env.V2_KIMI_MODEL = 'moonshotai/Kimi-K2.6';
      delete process.env.V2_GEN_PROVIDER;
      assert.equal(resolveJobModel('items').model, 'moonshotai/Kimi-K2.6');
      assert.equal(resolveJobModel('items').provider, 'kimi');
    });
  });

  it('prices Kimi K3 and unknown kimi models at DeepInfra rates', () => {
    assert.deepEqual(priceForModel('kimi', 'moonshotai/Kimi-K3'), {
      input: 2.85,
      output: 14.25,
      cache_read: 0.285,
    });
    assert.equal(priceForModel('kimi', 'moonshotai/Kimi-K2.6').input, 2.85);
    assert.equal(priceForModel('anthropic', 'claude-sonnet-5-5').input, 3);
  });

  it('cache gate uses 512 for sonnet-5-5', () => {
    assert.equal(minCacheableTokens('claude-sonnet-5-5'), 512);
    assert.equal(shouldCachePrefix('claude-sonnet-5-5', 400), false);
    assert.equal(shouldCachePrefix('claude-sonnet-5-5', 600), true);
  });

  it('does not embed dated anthropic model ids in resolve defaults', () => {
    withoutModelEnv(() => {
      const src = resolveJobModel('items').model;
      assert.ok(!/\d{8}/.test(src), `unexpected dated id: ${src}`);
    });
  });

  it('detects 5.5 models that reject forced tool_choice', () => {
    assert.equal(forcedToolChoiceUnsupported('claude-sonnet-5-5'), true);
    assert.equal(forcedToolChoiceUnsupported('claude-haiku-5-5'), true);
    assert.equal(forcedToolChoiceUnsupported('claude-sonnet-4-5'), false);
  });
});
