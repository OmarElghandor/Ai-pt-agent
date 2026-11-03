import {
  CHARACTER_IDS,
  charactersForPlace,
  getCharacter,
  type CharacterRecord,
} from '@/lib/v2/characters/registry';
import {
  getAuthoredItemImage,
  getAuthoredStoryImage,
  getCoreItemsDay,
} from '@/lib/v2/generation/lesson/coreItems';
import { getDayPlan, loadPlan } from '@/lib/v2/generation/lesson/plan';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ImageModel } from '@/lib/v2/mongo/models';
import { storySceneKey } from './keys';

export type PairKey = string;

export function pairKey(chars: string[]): PairKey {
  return [...chars]
    .map((c) => (c === 'learner' ? 'yassin' : c.toLowerCase()))
    .sort()
    .join('+');
}

/** Pick 2–4 cast members for a lesson from place homes. Always includes yassin. */
export function pickLessonCast(opts: {
  place: string;
  chatCharacter?: string;
  max?: number;
}): string[] {
  const max = Math.min(4, Math.max(2, opts.max ?? 4));
  const placeHits = charactersForPlace(opts.place, { includeLearner: true });
  const prefer = (opts.chatCharacter ?? 'ines').toLowerCase();
  const ids: string[] = ['yassin'];
  const add = (id: string) => {
    if (!ids.includes(id) && getCharacter(id)) ids.push(id);
  };
  if (placeHits.some((c) => c.id === prefer)) add(prefer);
  for (const c of placeHits) {
    if (ids.length >= max) break;
    if (c.id === 'yassin') continue;
    add(c.id);
  }
  // Fill from office-ish defaults if place matching was thin.
  if (ids.length < 2) {
    for (const id of ['ines', 'tiago', 'rita', 'manuel']) {
      if (ids.length >= 2) break;
      add(id);
    }
  }
  return ids.slice(0, max);
}

function countMapIncrement(map: Map<string, number>, id: string, by = 1) {
  map.set(id, (map.get(id) ?? 0) + by);
}

/** Count character appearances from authored core-items for a day. */
export function authoredCharacterCounts(day: number): Map<string, number> {
  const counts = new Map<string, number>();
  try {
    const entry = getCoreItemsDay(day);
    const story = getAuthoredStoryImage(day);
    if (story) {
      for (const c of story.characters) countMapIncrement(counts, c);
    }
    for (const item of entry.core_items) {
      const img = getAuthoredItemImage(day, item.id);
      if (!img) continue;
      for (const c of img.characters) countMapIncrement(counts, c);
    }
  } catch {
    /* day missing */
  }
  return counts;
}

async function mongoCharacterCounts(keys: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!keys.length || !mongoConfigured()) return counts;
  await connectMongo();
  const docs = await V2ImageModel()
    .find({ key: { $in: keys }, 'spec.characters': { $exists: true } })
    .select({ key: 1, spec: 1 })
    .lean();
  for (const doc of docs) {
    const chars = (doc as { spec?: { characters?: string[] } }).spec?.characters;
    if (!Array.isArray(chars)) continue;
    for (const c of chars) countMapIncrement(counts, c === 'learner' ? 'yassin' : c);
  }
  return counts;
}

/** Days in the same curriculum week as `day`. */
export function weekDayNumbers(day: number): number[] {
  const plan = loadPlan();
  const row = plan.days.find((d) => d.day === day);
  if (!row) return [day];
  return plan.days.filter((d) => d.week === row.week).map((d) => d.day);
}

/**
 * Week character usage from authored images + stored specs
 * for other days in the week (excluding current day).
 */
export async function weekCharacterUsage(opts: {
  day: number;
  targetLang?: string;
}): Promise<{ counts: Map<string, number>; totalImages: number }> {
  const days = weekDayNumbers(opts.day).filter((d) => d !== opts.day);
  const counts = new Map<string, number>();
  let totalImages = 0;
  const mongoKeys: string[] = [];

  for (const d of days) {
    let authoredImages = 0;
    try {
      const entry = getCoreItemsDay(d);
      const story = getAuthoredStoryImage(d);
      if (story) {
        authoredImages += 1;
        for (const c of story.characters) countMapIncrement(counts, c);
      }
      for (const item of entry.core_items) {
        const img = getAuthoredItemImage(d, item.id);
        if (!img) continue;
        authoredImages += 1;
        for (const c of img.characters) countMapIncrement(counts, c);
      }
      if (authoredImages === 0) {
        mongoKeys.push(storySceneKey(d, opts.targetLang));
        for (const item of entry.core_items) mongoKeys.push(item.id);
      }
    } catch {
      /* */
    }
    totalImages += authoredImages;
  }

  if (mongoKeys.length) {
    const fromMongo = await mongoCharacterCounts(mongoKeys);
    for (const [id, n] of fromMongo) countMapIncrement(counts, id, n);
    if (mongoConfigured()) {
      await connectMongo();
      totalImages += await V2ImageModel().countDocuments({
        key: { $in: mongoKeys },
        'spec.characters.0': { $exists: true },
      });
    }
  }

  return { counts, totalImages: Math.max(totalImages, 1) };
}

export type AssignPairsResult = {
  byKey: Map<string, string[]>;
  lessonCast: string[];
};

/**
 * Assign character pairs to image keys under §10 rotation rules.
 * Authored keys (already have characters) are left as-is and count toward streak/yassin.
 */
export function assignRotatedPairs(opts: {
  keys: string[];
  lessonCast: string[];
  /** Pre-seeded pairs for authored keys (key → characters). */
  fixedByKey?: Map<string, string[]>;
  weekCounts?: Map<string, number>;
  weekTotalImages?: number;
}): AssignPairsResult {
  const cast = opts.lessonCast.filter((id) => id && getCharacter(id));
  const pool = cast.length >= 2 ? cast : ['yassin', 'ines'];
  const nonYassin = pool.filter((id) => id !== 'yassin');
  const fixed = opts.fixedByKey ?? new Map();
  const byKey = new Map<string, string[]>();

  const lessonCounts = new Map<string, number>();
  let yassinUsed = 0;
  let prevPair: PairKey | null = null;
  let prevStreak = 0;

  const assignable = opts.keys.filter((k) => !fixed.has(k));
  const N = opts.keys.length;
  const yassinCap = Math.ceil((2 / 3) * N);

  const weekCounts = new Map(opts.weekCounts ?? []);
  const weekTotal = Math.max(1, opts.weekTotalImages ?? 1);
  const projectedWeekTotal = weekTotal + N;

  const weekShare = (id: string, extra = 0) =>
    ((weekCounts.get(id) ?? 0) + (lessonCounts.get(id) ?? 0) + extra) /
    projectedWeekTotal;

  const underWeekCap = (ids: string[]) =>
    ids.every((id) => weekShare(id, 1) <= 0.4 + 1e-9);

  const needsWeekFloor = () =>
    CHARACTER_IDS.filter((id) => id !== 'yassin').filter(
      (id) => (weekCounts.get(id) ?? 0) + (lessonCounts.get(id) ?? 0) === 0,
    );

  function scorePair(a: string, b: string): number {
    let score = 0;
    const pk = pairKey([a, b]);
    if (pk === prevPair && prevStreak >= 2) score -= 1000;
    if (a === 'yassin' || b === 'yassin') {
      if (yassinUsed + 1 > yassinCap) score -= 500;
      else score += 5;
    } else {
      score += 20; // prefer some non-yassin pairs
    }
    for (const id of [a, b]) {
      const share = weekShare(id, 1);
      if (share > 0.4) score -= 800;
      else score += (0.4 - share) * 40;
      if ((weekCounts.get(id) ?? 0) + (lessonCounts.get(id) ?? 0) === 0) {
        score += 60;
      }
    }
    // Prefer chatty variety inside lesson
    score -= ((lessonCounts.get(a) ?? 0) + (lessonCounts.get(b) ?? 0)) * 3;
    return score;
  }

  function candidates(): [string, string][] {
    const pairs: [string, string][] = [];
    const people = pool.length ? pool : ['yassin', 'ines'];
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        pairs.push([people[i]!, people[j]!]);
      }
    }
    if (!pairs.length && nonYassin[0]) {
      pairs.push(['yassin', nonYassin[0]]);
    }
    if (!pairs.length) pairs.push(['yassin', 'ines']);
    return pairs;
  }

  function commit(key: string, chars: string[]) {
    const uniq = [...new Set(chars.map((c) => (c === 'learner' ? 'yassin' : c)))];
    byKey.set(key, uniq);
    const pk = pairKey(uniq);
    if (pk === prevPair) prevStreak += 1;
    else {
      prevPair = pk;
      prevStreak = 1;
    }
    if (uniq.includes('yassin')) yassinUsed += 1;
    for (const id of uniq) countMapIncrement(lessonCounts, id);
  }

  // Seed fixed first in key order so streak/yassin account for them.
  for (const key of opts.keys) {
    const fixedChars = fixed.get(key);
    if (fixedChars?.length) commit(key, fixedChars);
  }

  for (const key of assignable) {
    const floor = needsWeekFloor().filter((id) => pool.includes(id));
    let best: [string, string] | null = null;
    let bestScore = -Infinity;
    for (const [a, b] of candidates()) {
      if (!underWeekCap([a, b]) && best) continue;
      let s = scorePair(a, b);
      if (floor.length && (floor.includes(a) || floor.includes(b))) s += 80;
      if (s > bestScore) {
        bestScore = s;
        best = [a, b];
      }
    }
    commit(key, best ?? ['yassin', pool.find((p) => p !== 'yassin') ?? 'ines']);
  }

  return { byKey, lessonCast: pool };
}

/** Convenience: place string from day plan + story setting. */
export function placeTextForDay(day: number, storySetting?: string | null): string {
  const plan = getDayPlan(day);
  return [storySetting, plan?.situation_eg, plan?.title_tl]
    .filter(Boolean)
    .join(' ');
}

export function listRegistryCharacters(): CharacterRecord[] {
  return CHARACTER_IDS.map((id) => getCharacter(id)!).filter(Boolean);
}
