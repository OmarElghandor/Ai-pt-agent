import type { ConvoPackData } from '@/lib/v2/convo/pack';
import type { ConvoRung, ConvoSession } from '@/lib/v2/convo/session';

export type ConvoResultItem = {
  item_id: string;
  tl: string;
  /** بتقولها */
  bucket: 'said' | 'understood' | 'extra';
};

export type ConvoResultStats = {
  /** Items at 🗣 said. */
  said: ConvoResultItem[];
  /** Assisted or understood (not said) — هتيجي كارت بكرة. */
  understood: ConvoResultItem[];
  /** Extra words heard (heard rung but not in said/understood buckets). */
  extra: ConvoResultItem[];
  /** بتفهم +N */
  understand_count: number;
  /** بتقول +M */
  say_count: number;
  /** Headline: بتفهم +N · بتقول +M */
  headline_eg: string;
  survival_used: number;
};

function packItemIds(pack: ConvoPackData): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const g of pack.groups) {
    for (const id of g.item_ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Build the end-of-lesson result card stats (09 §4.4).
 * Pure — no DB.
 */
export function buildConvoResultStats(input: {
  session: Pick<
    ConvoSession,
    'rungs' | 'struggled' | 'said_once' | 'survival_used'
  >;
  pack: ConvoPackData;
  /** id → tl for display. */
  surfaceTl: (itemId: string) => string;
}): ConvoResultStats {
  const { session, pack, surfaceTl } = input;
  const said: ConvoResultItem[] = [];
  const understood: ConvoResultItem[] = [];
  const extra: ConvoResultItem[] = [];

  for (const item_id of packItemIds(pack)) {
    const rung: ConvoRung = session.rungs[item_id] ?? 'taught';
    const tl = surfaceTl(item_id);
    if (rung === 'said') {
      said.push({ item_id, tl, bucket: 'said' });
    } else if (rung === 'assisted' || rung === 'understood') {
      understood.push({ item_id, tl, bucket: 'understood' });
    } else if (rung === 'heard') {
      extra.push({ item_id, tl, bucket: 'extra' });
    }
  }

  const say_count = said.length;
  // بتفهم counts assisted + understood + said (everything they can understand)
  const understand_count = said.length + understood.length;
  const survival_used = session.survival_used ?? 0;

  return {
    said,
    understood,
    extra,
    understand_count,
    say_count,
    headline_eg: `بتفهم +${understand_count} · بتقول +${say_count}`,
    survival_used,
  };
}
