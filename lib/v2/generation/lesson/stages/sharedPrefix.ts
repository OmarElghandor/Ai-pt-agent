import type { ClaudeSystemBlock } from '@/lib/generation/claudeClient';
import { JSON_OUTPUT_RULES } from '@/lib/generation/claudeClient';
import type { Item } from '@/lib/v2/content/items';
import { formatExamplesForPrompt } from '../examples';
import { buildSystemPrompt } from '../systemPrompt';

/**
 * Shared Anthropic system blocks with prompt caching on the fixed prefix
 * (system prompt + optional gold examples + DAY header + item bank when provided).
 *
 * Skip gold examples on page/questions/continuity calls — they bloat the
 * cache (~30k tokens) and are only needed for outline shape.
 */
export function buildCachedSystemBlocks(opts?: {
  items?: Item[];
  /** Compact DAY header (page / questions / continuity). */
  dayHeader?: string;
  extraCachedText?: string;
  /** Include gold day JSON examples (outline only). Default false. */
  includeExamples?: boolean;
}): ClaudeSystemBlock[] {
  const system = buildSystemPrompt();
  const examples = opts?.includeExamples ? formatExamplesForPrompt() : '';
  const dayHeader = opts?.dayHeader?.trim() || '';
  const itemBank =
    opts?.items && opts.items.length > 0
      ? `ITEM_BANK (authoritative; pages may only use ids from introduces∪assumes of their plan entry)\n${JSON.stringify(opts.items, null, 0)}`
      : '';

  const cachedParts = [system];
  if (examples) cachedParts.push(examples);
  if (dayHeader) cachedParts.push(dayHeader);
  if (itemBank) cachedParts.push(itemBank);
  if (opts?.extraCachedText) cachedParts.push(opts.extraCachedText);

  return [
    {
      type: 'text',
      text: cachedParts.join('\n\n'),
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: JSON_OUTPUT_RULES,
    },
  ];
}
