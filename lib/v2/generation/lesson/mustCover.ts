import type { CoreItem } from './coreItems';
import { resolveGrammarFocusPatternIds } from './grammarFocus';

const TOD_GREETING_GROUP = 'greeting.time_of_day';

/** Lisbon wall-clock → which time-of-day greeting to put in MUST_COVER. */
export function pickTimeOfDayGreetingId(
  members: CoreItem[],
  now: Date = new Date(),
): string | null {
  if (!members.length) return null;
  // Europe/Lisbon hour without pulling a TZ library: UTC+0/+1 approx via offset.
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      hour: 'numeric',
      hour12: false,
    }).format(now),
  );
  const prefer =
    hour >= 5 && hour < 12
      ? 'phrase.good_morning'
      : hour >= 12 && hour < 19
        ? 'phrase.good_afternoon'
        : 'phrase.good_night';
  const hit = members.find((m) => m.id === prefer);
  return (hit ?? members[0]!).id;
}

/**
 * One member per variant_group. Time-of-day greetings use Lisbon clock;
 * other groups take the first member in file order.
 */
export function pickVariantGroupMembers(
  coreItems: CoreItem[],
  now: Date = new Date(),
): Map<string, string> {
  const byGroup = new Map<string, CoreItem[]>();
  for (const c of coreItems) {
    if (c.kind !== 'phrase' || !c.variant_group) continue;
    const list = byGroup.get(c.variant_group) ?? [];
    list.push(c);
    byGroup.set(c.variant_group, list);
  }
  const picks = new Map<string, string>();
  for (const [group, members] of byGroup) {
    if (group === TOD_GREETING_GROUP) {
      const id = pickTimeOfDayGreetingId(members, now);
      if (id) picks.set(group, id);
    } else if (members[0]) {
      picks.set(group, members[0].id);
    }
  }
  return picks;
}

export type MustCoverEntry = {
  id: string;
  kind: 'phrase' | 'pattern';
  tl: string;
  /** Set when this id was the chosen member of a variant_group. */
  variant_group?: string;
};

/**
 * Code-owned MUST_COVER list for the story prompt:
 * today's phrases + grammar pattern(s) + exactly one member per variant_group.
 * Words are optional and never listed.
 */
export function buildMustCover(opts: {
  coreItems: CoreItem[];
  grammarFocusId?: string;
  now?: Date;
}): MustCoverEntry[] {
  const { coreItems, grammarFocusId } = opts;
  const now = opts.now ?? new Date();
  const variantPicks = pickVariantGroupMembers(coreItems, now);
  const pickedIds = new Set(variantPicks.values());
  const out: MustCoverEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: MustCoverEntry) => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    out.push(entry);
  };

  for (const c of coreItems) {
    if (c.kind !== 'phrase') continue;
    if (c.variant_group) {
      // Only the chosen member of each group.
      if (!pickedIds.has(c.id)) continue;
      push({
        id: c.id,
        kind: 'phrase',
        tl: c.tl,
        variant_group: c.variant_group,
      });
      continue;
    }
    push({ id: c.id, kind: 'phrase', tl: c.tl });
  }

  const patternIds = grammarFocusId
    ? resolveGrammarFocusPatternIds(grammarFocusId, coreItems)
    : coreItems.filter((c) => c.kind === 'pattern').map((c) => c.id);

  for (const pid of patternIds) {
    const core = coreItems.find((c) => c.id === pid);
    push({
      id: pid,
      kind: 'pattern',
      tl: core?.tl ?? pid,
    });
  }

  return out;
}

export function formatMustCoverBlock(entries: MustCoverEntry[]): string {
  if (!entries.length) return '(none)';
  return entries
    .map((e) =>
      e.variant_group
        ? `${e.id} (${e.kind}, ${e.variant_group}): ${e.tl}`
        : `${e.id} (${e.kind}): ${e.tl}`,
    )
    .join('\n');
}
