import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { zodToolSchema } from '@/lib/generation/claudeClient';
import {
  JOB_SCHEMAS,
  clozeAppearsInTl,
  type JobSchemaKind,
} from '@/lib/v2/generation/lesson/schemas';
import day06 from '../examples/day06-example.json';

const ajv = new Ajv2020({ allErrors: true, strict: false });

function stripSayAndMeta(item: Record<string, unknown>) {
  const {
    say: _s,
    introduced_on_page: _i,
    ...rest
  } = item;
  return rest;
}

function asItemsPayload(rawItems: unknown[]) {
  return {
    items: rawItems
      .filter((it) => {
        const t = (it as { type?: string }).type;
        return t !== 'form';
      })
      .map((it) => stripSayAndMeta(it as Record<string, unknown>)),
  };
}

/** Schema + cloze-in-tl (JSON Schema cannot encode the refine). */
function itemsContractOk(
  data: unknown,
  validate: (d: unknown) => boolean,
): { zodOk: boolean; ajvOk: boolean } {
  const zodOk = JOB_SCHEMAS.items.safeParse(data).success;
  let ajvOk = validate(data);
  if (ajvOk && data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    for (const it of (data as { items: Array<{ type?: string; tl?: string; cloze?: string }> }).items) {
      if (it.type === 'phrase' && it.tl && it.cloze && !clozeAppearsInTl(it.tl, it.cloze)) {
        ajvOk = false;
        break;
      }
    }
  }
  return { zodOk, ajvOk };
}

function phraseBranchRequired(jsonSchema: Record<string, unknown>): string[] {
  const items = (jsonSchema as { properties?: { items?: { items?: { oneOf?: unknown[]; anyOf?: unknown[] } } } })
    .properties?.items?.items;
  const branches = (items?.oneOf ?? items?.anyOf ?? []) as Array<{
    properties?: { type?: { const?: string } };
    required?: string[];
  }>;
  const phrase = branches.find((b) => b.properties?.type?.const === 'phrase');
  assert.ok(phrase, 'phrase branch missing from items JSON Schema');
  return phrase.required ?? [];
}

describe('v2 job schemas · registry', () => {
  it('exports every job kind with a non-passthrough schema', () => {
    const kinds: JobSchemaKind[] = [
      'items',
      'outline',
      'page',
      'critic',
      'questions',
      'micro',
      'daily_use',
      'continuity',
      'lang_check',
    ];
    for (const kind of kinds) {
      assert.ok(JOB_SCHEMAS[kind], kind);
      const js = zodToolSchema(JOB_SCHEMAS[kind]);
      assert.equal(js.type, 'object');
      // Must not be a naked passthrough { type, id } blob.
      assert.ok(js.properties, `${kind} has properties`);
    }
  });

  it('phrase branch JSON Schema requires context_eg and cloze', () => {
    const js = zodToolSchema(JOB_SCHEMAS.items) as Record<string, unknown>;
    const required = phraseBranchRequired(js);
    assert.ok(required.includes('context_eg'), required.join(','));
    assert.ok(required.includes('cloze'), required.join(','));
  });

  it('word branch JSON Schema requires gender', () => {
    const js = zodToolSchema(JOB_SCHEMAS.items) as Record<string, unknown>;
    const items = (js as { properties?: { items?: { items?: { oneOf?: unknown[] } } } })
      .properties?.items?.items?.oneOf as Array<{
      properties?: { type?: { const?: string } };
      required?: string[];
    }>;
    const word = items.find((b) => b.properties?.type?.const === 'word');
    assert.ok(word);
    assert.ok(word.required?.includes('gender'));
  });
});

describe('v2 job schemas · zod ↔ Ajv parity', () => {
  for (const kind of Object.keys(JOB_SCHEMAS) as JobSchemaKind[]) {
    it(`${kind}: zodToolSchema compiles in Ajv`, () => {
      const schema = zodToolSchema(JOB_SCHEMAS[kind]);
      assert.doesNotThrow(() => ajv.compile(schema));
    });
  }

  it('items: day06 + presets accept on zod and Ajv', () => {
    const validate = ajv.compile(zodToolSchema(JOB_SCHEMAS.items));
    const payloads = [asItemsPayload(day06.items as unknown[])];
    const presetDir = join(process.cwd(), 'examples/presets');
    for (const file of readdirSync(presetDir).filter((f) => f.endsWith('.json'))) {
      const raw = JSON.parse(readFileSync(join(presetDir, file), 'utf8')) as {
        items?: unknown[];
      };
      if (raw.items?.length) payloads.push(asItemsPayload(raw.items));
    }
    for (const data of payloads) {
      const { zodOk, ajvOk } = itemsContractOk(data, validate);
      assert.equal(zodOk, true, `zod failed on fixture`);
      assert.equal(ajvOk, true, `ajv failed on fixture`);
    }
  });

  it('items: broken fixtures reject on zod and Ajv', () => {
    const validate = ajv.compile(zodToolSchema(JOB_SCHEMAS.items));

    const missingContext = {
      items: [
        {
          type: 'phrase',
          id: 'p1',
          tl: 'Queria um café',
          ar: 'أريد قهوة',
          cloze: 'Queria',
        },
      ],
    };
    const missingCloze = {
      items: [
        {
          type: 'phrase',
          id: 'p1',
          tl: 'Queria um café',
          ar: 'أريد قهوة',
          context_eg: 'عايز تطلب عند الكاونتر',
        },
      ],
    };
    const missingGender = {
      items: [
        {
          type: 'word',
          id: 'w1',
          tl: 'café',
          ar: 'قهوة',
        },
      ],
    };
    const clozeNotInTl = {
      items: [
        {
          type: 'phrase',
          id: 'p1',
          tl: 'Queria um café',
          ar: 'أريد قهوة',
          context_eg: 'عايز تطلب عند الكاونتر',
          cloze: 'Porque',
        },
      ],
    };

    for (const [label, data] of [
      ['missing context_eg', missingContext],
      ['missing cloze', missingCloze],
      ['missing gender', missingGender],
      ['cloze not in tl', clozeNotInTl],
    ] as const) {
      const { zodOk, ajvOk } = itemsContractOk(data, validate);
      assert.equal(zodOk, false, `zod should reject ${label}`);
      assert.equal(ajvOk, false, `ajv should reject ${label}`);
    }
  });

  it('page: preset pages accept on zod and Ajv', () => {
    const validate = ajv.compile(zodToolSchema(JOB_SCHEMAS.page));
    const presetDir = join(process.cwd(), 'examples/presets');
    for (const file of readdirSync(presetDir).filter((f) => f.endsWith('.json'))) {
      const raw = JSON.parse(readFileSync(join(presetDir, file), 'utf8')) as {
        page?: unknown;
      };
      if (!raw.page) continue;
      const data = { page: raw.page };
      const zodOk = JOB_SCHEMAS.page.safeParse(data).success;
      const ajvOk = validate(data);
      assert.equal(zodOk, true, `zod page ${file}`);
      assert.equal(ajvOk, true, `ajv page ${file}`);
    }
  });

  it('critic / continuity / outline minimal fixtures match', () => {
    const cases: Array<{ kind: JobSchemaKind; good: unknown; bad: unknown }> = [
      {
        kind: 'critic',
        good: { issues: [] },
        bad: { issues: [{ severity: 'nope', message: 'x' }] },
      },
      {
        kind: 'continuity',
        good: { regenerate: [] },
        bad: { regenerate: 'all' },
      },
      {
        kind: 'outline',
        good: {
          pages: [
            {
              index: 0,
              page_id: 'p1',
              preset: 'phrases',
              title: 'Olá',
              purpose: 'greet',
              introduces: [],
              assumes: [],
            },
          ],
        },
        bad: { pages: [] },
      },
    ];
    for (const { kind, good, bad } of cases) {
      const validate = ajv.compile(zodToolSchema(JOB_SCHEMAS[kind]));
      assert.equal(JOB_SCHEMAS[kind].safeParse(good).success, true, `${kind} good zod`);
      assert.equal(validate(good), true, `${kind} good ajv`);
      assert.equal(JOB_SCHEMAS[kind].safeParse(bad).success, false, `${kind} bad zod`);
      assert.equal(validate(bad), false, `${kind} bad ajv`);
    }
  });
});
