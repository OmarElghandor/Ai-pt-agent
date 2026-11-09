import { loadGoalsForDay } from '@/lib/v2/convo/goals/fromLesson';
import { loadGoalsForTopic } from '@/lib/v2/convo/goals/fromThreads';
import {
  listAuthoredTopicBankIds,
  loadAuthoredTopicBank,
} from '@/lib/v2/convo/goals/loadTopicBank';
import { ensureBankRequiredItems } from '@/lib/v2/convo/goals/requiredItems';
import type { ConvoGoalBank } from '@/lib/v2/convo/goals/types';
import { allItemsAtOrBelowLevel } from '@/lib/v2/convo/level/itemDays';
import {
  listThreadTopicIdsFromFiles,
  loadThreadTopicFromFile,
} from '@/lib/v2/convo/topics/threadLoad';

export const TEACH_CHIP_LABEL_EG = 'هنتعلمه';

/** Preferred above-level suggestion order for opening chips. */
export const ABOVE_LEVEL_CHIP_PRIORITY = ['direcoes'] as const;

export type ConvoTopicCatalogEntry = {
  id: string;
  title_tl: string;
  title_ar: string;
  /** One-line description for the router. */
  description: string;
  required_items: string[];
  /** Curriculum day of the lesson bank, when applicable. */
  day?: number;
  source: 'lesson' | 'thread' | 'topic' | 'generated';
};

export type OpeningTopicChip = ConvoTopicCatalogEntry & {
  /** True when the topic is above the learner's level (teaching mode). */
  above_level: boolean;
  /** Egyptian badge for above-level chips. */
  badge_eg?: string;
};

function bankToEntry(bank: ConvoGoalBank, id: string): ConvoTopicCatalogEntry {
  ensureBankRequiredItems(bank);
  return {
    id,
    title_tl: bank.title_tl?.trim() || id,
    title_ar: bank.title_ar?.trim() || id,
    description:
      bank.scene_eg?.trim() ||
      bank.intro_eg?.trim() ||
      bank.title_tl?.trim() ||
      id,
    required_items: [...(bank.required_items ?? [])],
    ...(typeof bank.day === 'number' ? { day: bank.day } : {}),
    source:
      bank.source === 'lesson'
        ? 'lesson'
        : bank.source === 'topic'
          ? 'topic'
          : bank.source === 'generated'
            ? 'generated'
            : 'thread',
  };
}

function tryLoadThreadBank(topicId: string): ConvoGoalBank | null {
  try {
    const bank = loadGoalsForTopic(topicId);
    bank.topic_id = bank.topic_id ?? topicId;
    return ensureBankRequiredItems(bank);
  } catch {
    return null;
  }
}

function withThreadTitles(
  bank: ConvoGoalBank,
  topicId: string,
): ConvoGoalBank {
  if (bank.title_tl && bank.title_ar) return bank;
  try {
    const doc = loadThreadTopicFromFile(topicId);
    bank.title_tl = bank.title_tl ?? doc.topic.title_tl;
    bank.title_ar = bank.title_ar ?? doc.topic.title_ar;
    bank.intro_eg = bank.intro_eg ?? doc.topic.intro_eg;
  } catch {
    // ignore
  }
  return bank;
}

/**
 * Full catalog candidates: lesson-day banks + authored topic banks + threads.
 * Generated banks can be appended by the caller later.
 */
export function listTopicCatalog(opts?: {
  targetLang?: string;
  generated?: ConvoTopicCatalogEntry[];
}): ConvoTopicCatalogEntry[] {
  const out: ConvoTopicCatalogEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: ConvoTopicCatalogEntry) => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    out.push(entry);
  };

  try {
    const day1 = loadGoalsForDay(1, { targetLang: opts?.targetLang });
    ensureBankRequiredItems(day1);
    push(
      bankToEntry(
        {
          ...day1,
          title_tl: day1.title_tl ?? 'Apresentar-se',
          title_ar: day1.title_ar ?? 'تقديم نفسك',
        },
        'day-1',
      ),
    );
  } catch {
    // no day-1 bank
  }

  for (const topicId of listAuthoredTopicBankIds({
    targetLang: opts?.targetLang,
  })) {
    const bank = loadAuthoredTopicBank(topicId, {
      targetLang: opts?.targetLang,
    });
    if (!bank) continue;
    push(bankToEntry(bank, topicId));
  }

  for (const topicId of listThreadTopicIdsFromFiles()) {
    let bank = tryLoadThreadBank(topicId);
    if (!bank) continue;
    bank = withThreadTitles(bank, topicId);
    push(bankToEntry(bank, topicId));
  }

  for (const g of opts?.generated ?? []) {
    push(g);
  }

  return out;
}

export function topicAllowedAtLevel(
  entry: ConvoTopicCatalogEntry,
  level: number,
): boolean {
  return allItemsAtOrBelowLevel(entry.required_items, level);
}

export function listAllowedTopics(
  level: number,
  opts?: { targetLang?: string; generated?: ConvoTopicCatalogEntry[] },
): ConvoTopicCatalogEntry[] {
  return listTopicCatalog(opts).filter((t) => topicAllowedAtLevel(t, level));
}

/**
 * Opening chips: exactly `maxTotal` (default 3) — fill with allowed first,
 * then above-level topics marked «هنتعلمه» (directions first).
 */
export function listOpeningChips(
  level: number,
  opts?: {
    targetLang?: string;
    generated?: ConvoTopicCatalogEntry[];
    /** Total chips including above-level (default 3). */
    maxTotal?: number;
    /** @deprecated Prefer maxTotal — kept for call-site compat. */
    maxAllowed?: number;
    /** @deprecated Prefer maxTotal. */
    maxAboveLevel?: number;
  },
): OpeningTopicChip[] {
  const maxTotal = opts?.maxTotal ?? 3;
  const catalog = listTopicCatalog(opts);
  const allowed = catalog.filter((t) => topicAllowedAtLevel(t, level));
  const above = catalog.filter((t) => !topicAllowedAtLevel(t, level));

  const priority = new Map(
    ABOVE_LEVEL_CHIP_PRIORITY.map((id, i) => [id, i] as const),
  );
  above.sort((a, b) => {
    const pa = priority.has(a.id) ? priority.get(a.id)! : 1000;
    const pb = priority.has(b.id) ? priority.get(b.id)! : 1000;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });

  const chips: OpeningTopicChip[] = [];
  for (const t of allowed) {
    if (chips.length >= maxTotal) break;
    chips.push({ ...t, above_level: false });
  }
  for (const t of above) {
    if (chips.length >= maxTotal) break;
    chips.push({
      ...t,
      above_level: true,
      badge_eg: TEACH_CHIP_LABEL_EG,
    });
  }
  return chips;
}
