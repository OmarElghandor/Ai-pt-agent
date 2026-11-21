import { z } from 'zod';
import {
  callClaudeJson,
  zodToolSchema,
} from '@/lib/generation/claudeClient';
import { isFlashcardItem } from '@/lib/v2/content/flashcards';
import type { Item } from '@/lib/v2/content/items';
import { findBrazilianLeak } from '@/lib/v2/convo/output/checks';
import { normaliseLemma } from './keys';
import { itemTargetText } from '@/lib/v2/render/speechTarget';

const ARABIC_RE = /[\u0600-\u06FF]/
const DEFAULT_MODEL =
  process.env.CUSTOM_DECK_MODEL?.trim() || 'claude-haiku-4-5-20251001';

const EnrichRowSchema = z.object({
  id: z.string().min(1),
  example: z.string().min(1),
  example_ar: z.string().min(1),
});

const EnrichOutputSchema = z.object({
  examples: z.array(EnrichRowSchema).min(1),
});

export type EnrichModelCaller = (args: {
  system: string;
  user: string;
  schema: z.ZodType;
  toolName: string;
  label: string;
}) => Promise<{ data: unknown }>;

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function exampleContainsLemma(example: string, tl: string): boolean {
  const lemma = normaliseLemma(tl);
  const ex = example.normalize('NFC').toLowerCase();
  return Boolean(lemma) && ex.includes(lemma);
}

function isInlineExampleSentence(
  example: string | undefined,
  head: string,
  itemsById: Map<string, Item>,
): boolean {
  const raw = example?.trim();
  if (!raw) return false;
  // Id ref — not an inline sentence for the card face string itself
  if (itemsById.has(raw)) return false;
  if (raw.localeCompare(head, undefined, { sensitivity: 'accent' }) === 0) {
    return false;
  }
  return wordCount(raw) >= 2;
}

function itemExampleAr(item: Item): string {
  if (
    'example_ar' in item &&
    typeof (item as { example_ar?: unknown }).example_ar === 'string'
  ) {
    return String((item as { example_ar: string }).example_ar).trim();
  }
  return '';
}

function itemExample(item: Item): string {
  if ('example' in item && typeof item.example === 'string') {
    return item.example.trim();
  }
  return '';
}

/** Word / verb-lemma flashcards that need example + example_ar. */
export function itemsNeedingExampleEnrichment(items: Item[]): Item[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: Item[] = [];
  for (const item of items) {
    const isVerbLemma =
      item.id.startsWith('verb.') && !item.id.includes(':');
    if (item.type !== 'word' && !isVerbLemma) continue;
    if (!isFlashcardItem(item) && !isVerbLemma) continue;

    const head =
      itemTargetText(item) ??
      ('tl' in item && typeof item.tl === 'string' ? item.tl : item.id);
    const example = itemExample(item);
    const exampleAr = itemExampleAr(item);
    const hasInline = isInlineExampleSentence(example, head, byId);
    const hasAr = Boolean(exampleAr) && ARABIC_RE.test(exampleAr);
    if (hasInline && hasAr) continue;
    out.push(item);
  }
  return out;
}

function validateEnrichRow(
  row: z.infer<typeof EnrichRowSchema>,
  head: string,
): { example: string; example_ar: string } | null {
  const example = row.example.trim();
  const example_ar = row.example_ar.trim();
  if (wordCount(example) > 8) return null;
  if (wordCount(example) < 2) return null;
  if (
    example.localeCompare(head, undefined, { sensitivity: 'accent' }) === 0
  ) {
    return null;
  }
  if (!exampleContainsLemma(example, head)) return null;
  if (findBrazilianLeak(example)) return null;
  if (!example_ar || !ARABIC_RE.test(example_ar)) return null;
  return { example, example_ar };
}

async function defaultCaller(args: {
  system: string;
  user: string;
  schema: z.ZodType;
  toolName: string;
  label: string;
}): Promise<{ data: unknown }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callClaudeJson(args.system, args.user, {
        label: args.label,
        model: DEFAULT_MODEL,
        maxTokens: 4096,
        skipProviderFork: true,
        tool: {
          name: args.toolName,
          description: 'Submit example sentences for flashcard words.',
          inputSchema: zodToolSchema(args.schema),
        },
      });
      return { data: result.data };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const SYSTEM = `You write short European Portuguese (pt-PT) example sentences for flashcard words, plus a simple Modern Standard Arabic translation.
Rules:
- example: at most 8 words, must contain the headword (lemma without article ok), pt-PT only, not Brazilian forms, not the bare headword alone.
- example_ar: required simple MSA translation of example (Arabic script only; not Egyptian dialect).
- Return one row per id given. Do not invent new ids.`;

/**
 * Fill inline example + example_ar on flashcard words missing them.
 * Leaves other items unchanged. On model failure, returns items as-is.
 */
export async function enrichFlashcardExamples(
  items: Item[],
  opts?: { callModel?: EnrichModelCaller },
): Promise<Item[]> {
  const needing = itemsNeedingExampleEnrichment(items);
  if (!needing.length) return items;

  const lines = needing.map((item) => {
    const tl =
      itemTargetText(item) ??
      ('tl' in item && typeof item.tl === 'string' ? item.tl : item.id);
    const ar = 'ar' in item && typeof item.ar === 'string' ? item.ar : '';
    return `- id: ${item.id} | tl: ${tl} | ar: ${ar}`;
  });

  const user = `Write example + example_ar for each word below.
Return { "examples": [ { "id", "example", "example_ar" }, ... ] } via submit_examples.

WORDS
${lines.join('\n')}
`;

  const call = opts?.callModel ?? defaultCaller;
  let data: unknown;
  try {
    const result = await call({
      system: SYSTEM,
      user,
      schema: EnrichOutputSchema,
      toolName: 'submit_examples',
      label: 'situation-card-examples',
    });
    data = result.data;
  } catch {
    return items;
  }

  const parsed = EnrichOutputSchema.safeParse(data);
  if (!parsed.success) return items;

  const byNeed = new Map(
    needing.map((item) => [
      item.id,
      itemTargetText(item) ??
        ('tl' in item && typeof item.tl === 'string' ? item.tl : item.id),
    ]),
  );
  const patch = new Map<string, { example: string; example_ar: string }>();
  for (const row of parsed.data.examples) {
    const head = byNeed.get(row.id);
    if (!head) continue;
    const ok = validateEnrichRow(row, head);
    if (!ok) continue;
    patch.set(row.id, ok);
  }
  if (!patch.size) return items;

  return items.map((item) => {
    const p = patch.get(item.id);
    if (!p) return item;
    return { ...item, example: p.example, example_ar: p.example_ar } as Item;
  });
}
