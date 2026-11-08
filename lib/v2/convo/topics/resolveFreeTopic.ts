import { loadGoalsForDay } from '@/lib/v2/convo/goals/fromLesson';
import { getCachedLessonDayBankSync } from '@/lib/v2/convo/goals/loadLessonDay';
import { loadAuthoredTopicBank } from '@/lib/v2/convo/goals/loadTopicBank';
import type { ConvoGoalBank } from '@/lib/v2/convo/goals/types';
import { isOpenTopicId, OPEN_TOPIC } from './openTopic';
import {
  loadFreeTopicsFile,
  loadThreadTopicFromFile,
} from './threadLoad';
import type { FreeTopic, FreeTopicsFile } from './threadTypes';

/** Parse `day-1` / `day-12` → day number; otherwise null. */
export function parseLessonDayTopicId(topicId: string): number | null {
  const m = /^day-(\d+)$/i.exec(topicId.trim());
  if (!m) return null;
  const day = Number(m[1]);
  return Number.isInteger(day) && day > 0 ? day : null;
}

/** Build a FreeTopic row from a goal bank (authored / lesson / generated). */
export function freeTopicFromGoalBank(
  topicId: string,
  bank: ConvoGoalBank,
): FreeTopic {
  const titleTl = bank.title_tl?.trim() || topicId;
  const titleAr = bank.title_ar?.trim() || topicId;
  const characterId =
    bank.scene?.character_id?.trim() || OPEN_TOPIC.character_id;
  const introEg =
    bank.intro_eg?.trim() ||
    bank.scene_eg?.trim() ||
    OPEN_TOPIC.intro_eg;
  const openingTl =
    bank.opening?.tl?.trim() || OPEN_TOPIC.opening_tl;
  const openingAr =
    bank.opening?.ar?.trim() || OPEN_TOPIC.opening_ar;
  const wordSet = [
    ...new Set(
      bank.goals.flatMap((g) => [
        ...(g.keywords ?? []),
        ...(g.examples_tl ?? []),
      ]),
    ),
  ];
  return {
    id: topicId,
    title_tl: titleTl,
    title_ar: titleAr,
    title_in_sentence_tl: titleTl.toLowerCase(),
    character_id: characterId,
    intro_eg: introEg,
    opening_tl: openingTl,
    opening_ar: openingAr,
    related_topic_ids: [],
    word_set: wordSet,
  };
}

function threadTopicById(
  topicId: string,
  file: FreeTopicsFile,
): FreeTopic | null {
  if (isOpenTopicId(topicId)) return OPEN_TOPIC;
  const fromCatalog = file.topics.find((t) => t.id === topicId);
  if (fromCatalog) return fromCatalog;
  try {
    return freeTopicFromThreadSafe(topicId);
  } catch {
    return null;
  }
}

function freeTopicFromThreadSafe(topicId: string): FreeTopic | null {
  try {
    const doc = loadThreadTopicFromFile(topicId);
    return {
      id: doc.topic.id,
      title_tl: doc.topic.title_tl,
      title_ar: doc.topic.title_ar,
      title_in_sentence_tl: doc.topic.title_in_sentence_tl,
      character_id: doc.topic.character_id,
      intro_eg: doc.topic.intro_eg,
      opening_tl: doc.topic.opening_tl,
      opening_ar: doc.topic.opening_ar,
      related_topic_ids: [...doc.topic.related],
      word_set: [],
    };
  } catch {
    return null;
  }
}

/**
 * Resolve any free-talk topic id to a FreeTopic row.
 * Order: open → thread → authored topic bank → lesson-day bank → generated cache.
 */
export function resolveFreeTopic(
  topicId: string,
  file: FreeTopicsFile = loadFreeTopicsFile(),
): FreeTopic | null {
  const id = topicId.trim();
  if (!id) return null;
  if (isOpenTopicId(id)) return OPEN_TOPIC;

  const thread = threadTopicById(id, file);
  if (thread && !isOpenTopicId(thread.id)) return thread;

  const authored = loadAuthoredTopicBank(id);
  if (authored) return freeTopicFromGoalBank(id, authored);

  const day = parseLessonDayTopicId(id);
  if (day != null) {
    try {
      const bank = loadGoalsForDay(day);
      return freeTopicFromGoalBank(id, bank);
    } catch {
      const cached = getCachedLessonDayBankSync(day);
      if (cached) return freeTopicFromGoalBank(id, cached);
    }
  }

  // Generated cache keyed by numeric day when id is plain digits.
  if (/^\d+$/.test(id)) {
    const n = Number(id);
    const cached = getCachedLessonDayBankSync(n);
    if (cached) return freeTopicFromGoalBank(`day-${n}`, cached);
  }

  return null;
}

/**
 * Public catalogue lookup used by start, turn, header, and golden tests.
 * Same as resolveFreeTopic (threads ∪ lesson-day ∪ authored ∪ generated).
 */
export function freeTopicById(
  topicId: string,
  file: FreeTopicsFile = loadFreeTopicsFile(),
): FreeTopic | null {
  return resolveFreeTopic(topicId, file);
}

export function requireFreeTopic(topicId: string): FreeTopic {
  const t = freeTopicById(topicId);
  if (!t) throw new Error(`free topic not found: ${topicId}`);
  return t;
}
