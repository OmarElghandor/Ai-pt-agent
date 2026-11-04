import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ConvoPackData } from '@/lib/v2/convo/pack/schema';

const PATH = path.join(process.cwd(), 'content/v2/convo/pt-PT.day-18.json');

let cached: ConvoPackData | null = null;

/** Hand-written day 18 pack — gold shape for convo_items prompts. */
export function loadDay18ConvoExample(): ConvoPackData {
  if (cached) return cached;
  cached = JSON.parse(readFileSync(PATH, 'utf8')) as ConvoPackData;
  return cached;
}

/** Trimmed example: one group + its item banks for the prompt. */
export function day18ItemsExampleSnippet(): string {
  const pack = loadDay18ConvoExample();
  const group = pack.groups[0]!;
  const items: Record<string, unknown> = {};
  for (const id of group.item_ids) {
    if (pack.items[id]) items[id] = pack.items[id];
  }
  return JSON.stringify(
    {
      group_id: group.id,
      items,
      note: {
        visual_type: pack.visual.type,
        map_steps:
          pack.visual.type === 'map'
            ? pack.visual.route.map((s) => s.step_id)
            : [],
      },
    },
    null,
    2,
  );
}
