import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  ConvoGoal,
  ConvoGoalBank,
  ConvoScene,
  ConvoSceneAddress,
  ConvoSceneTimeOfDay,
} from './types';
import { validateGoals, validateLessonDayBank } from './validate';

const DEFAULT_GOALS_DIR = path.join(process.cwd(), 'content/v2/convo/goals');

/** Memory cache for generated lesson-day banks (F5); file always wins. */
const memoryLessonDayBanks = new Map<string, ConvoGoalBank>();

export function lessonDayCacheSlug(day: number): string {
  return `lesson.day-${day}`;
}

export function authoredLessonDayPath(
  day: number,
  opts?: { targetLang?: string; baseDir?: string },
): string {
  const lang = opts?.targetLang ?? 'pt-PT';
  const dir = opts?.baseDir ?? DEFAULT_GOALS_DIR;
  return path.join(dir, `${lang}.day-${day}.json`);
}

function isTimeOfDay(v: unknown): v is ConvoSceneTimeOfDay {
  return (
    v === 'morning' ||
    v === 'afternoon' ||
    v === 'evening' ||
    v === 'night'
  );
}

function isAddress(v: unknown): v is ConvoSceneAddress {
  return v === 'formal' || v === 'tu';
}

function parseGoal(raw: Record<string, unknown>): ConvoGoal {
  const helpRaw = (raw.help ?? {}) as Record<string, unknown>;
  const goal: ConvoGoal = {
    id: String(raw.id ?? ''),
    intent_eg: String(raw.intent_eg ?? ''),
    examples_tl: Array.isArray(raw.examples_tl)
      ? raw.examples_tl.map((e) => String(e))
      : [],
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.map((k) => String(k))
      : [],
    help: {
      frame_tl: String(helpRaw.frame_tl ?? ''),
      eg: String(helpRaw.eg ?? ''),
      chips: Array.isArray(helpRaw.chips)
        ? helpRaw.chips.map((c) => String(c))
        : [],
    },
  };
  if (typeof raw.intent_en === 'string') goal.intent_en = raw.intent_en;
  if (typeof raw.seed_tl === 'string') goal.seed_tl = raw.seed_tl;
  if (typeof raw.seed_ar === 'string') goal.seed_ar = raw.seed_ar;
  if (typeof raw.ask_tl === 'string') goal.ask_tl = raw.ask_tl;
  if (typeof raw.ask_ar === 'string') goal.ask_ar = raw.ask_ar;
  if (typeof raw.ask_tl_f === 'string') goal.ask_tl_f = raw.ask_tl_f;
  if (typeof raw.ask_ar_f === 'string') goal.ask_ar_f = raw.ask_ar_f;
  if (isTimeOfDay(raw.time_of_day)) goal.time_of_day = raw.time_of_day;
  if (raw.tier === 'core' || raw.tier === 'extended') goal.tier = raw.tier;
  if (Array.isArray(raw.item_ids)) {
    goal.item_ids = raw.item_ids.map((id) => String(id)).filter(Boolean);
  }
  const teachRaw = raw.teach;
  if (teachRaw && typeof teachRaw === 'object') {
    const t = teachRaw as Record<string, unknown>;
    const tl = String(t.tl ?? '').trim();
    const ar = String(t.ar ?? '').trim();
    const meaning_eg = String(t.meaning_eg ?? '').trim();
    if (tl && ar && meaning_eg) {
      goal.teach = { tl, ar, meaning_eg };
    }
  }
  return goal;
}

function parseScene(raw: unknown): ConvoScene | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const character_id = String(s.character_id ?? 'ines');
  const scene: ConvoScene = {
    character_id,
    time_of_day: isTimeOfDay(s.time_of_day) ? s.time_of_day : 'morning',
  };
  if (typeof s.place === 'string' && s.place.trim()) scene.place = s.place;
  if (isAddress(s.address)) scene.address = s.address;
  return scene;
}

/** Parse + validate a lesson-day bank JSON object. */
export function parseLessonDayBankJson(
  raw: unknown,
  opts?: { day?: number },
): ConvoGoalBank {
  if (!raw || typeof raw !== 'object') {
    throw new Error('lesson-day bank: expected object');
  }
  const doc = raw as Record<string, unknown>;
  const day =
    typeof doc.day === 'number' && doc.day > 0
      ? doc.day
      : opts?.day && opts.day > 0
        ? opts.day
        : undefined;

  const openingRaw = doc.opening as Record<string, unknown> | undefined;
  const closingRaw = doc.closing as Record<string, unknown> | undefined;
  const goalsRaw = Array.isArray(doc.goals) ? doc.goals : [];

  const bank: ConvoGoalBank = {
    source:
      doc.source === 'generated'
        ? 'generated'
        : doc.source === 'thread'
          ? 'thread'
          : doc.source === 'topic'
            ? 'topic'
            : 'lesson',
    day,
    goals: goalsRaw.map((g) =>
      parseGoal((g ?? {}) as Record<string, unknown>),
    ),
    suggested_words: Array.isArray(doc.suggested_words)
      ? doc.suggested_words.map((w) => String(w))
      : [],
    scene: parseScene(doc.scene),
    authored:
      doc.authored === true ||
      doc.source === 'lesson' ||
      doc.source === 'topic',
  };
  if (typeof doc.topic_id === 'string') bank.topic_id = doc.topic_id;
  if (typeof doc.title_tl === 'string') bank.title_tl = doc.title_tl;
  if (typeof doc.title_ar === 'string') bank.title_ar = doc.title_ar;
  if (typeof doc.intro_eg === 'string') bank.intro_eg = doc.intro_eg;
  if (typeof doc.scene_eg === 'string') bank.scene_eg = doc.scene_eg;
  if (Array.isArray(doc.required_items)) {
    bank.required_items = doc.required_items
      .map((id) => String(id))
      .filter(Boolean);
  }
  if (Array.isArray(doc.new_items_tl)) {
    bank.new_items_tl = doc.new_items_tl.map((s) => String(s)).filter(Boolean);
  } else if (Array.isArray(doc.new_tl)) {
    bank.new_items_tl = doc.new_tl.map((s) => String(s)).filter(Boolean);
  }
  if (openingRaw && typeof openingRaw === 'object') {
    bank.opening = {
      tl: String(openingRaw.tl ?? ''),
      ar: String(openingRaw.ar ?? ''),
      ...(typeof openingRaw.tl_f === 'string'
        ? { tl_f: openingRaw.tl_f }
        : {}),
      ...(typeof openingRaw.ar_f === 'string'
        ? { ar_f: openingRaw.ar_f }
        : {}),
    };
  }
  if (closingRaw && typeof closingRaw === 'object') {
    bank.closing = {
      tl: String(closingRaw.tl ?? ''),
      ar: String(closingRaw.ar ?? ''),
    };
  }

  // Topic banks (v4) need goals + ask_tl, not a lesson opening.
  if (bank.source === 'topic') {
    const { ok, issues } = validateGoals(bank.goals, { requireAsk: true });
    if (!ok) {
      throw new Error(
        `Invalid topic bank${bank.topic_id ? ` ${bank.topic_id}` : ''}: ${issues
          .map((i) => `${i.path}: ${i.message}`)
          .join('; ')}`,
      );
    }
    return bank;
  }

  const { ok, issues } = validateLessonDayBank(bank);
  if (!ok) {
    throw new Error(
      `Invalid lesson-day bank${day ? ` day ${day}` : ''}: ${issues
        .map((i) => `${i.path}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return bank;
}

/** Load authored file if present; otherwise null. */
export function loadAuthoredLessonDayBank(
  day: number,
  opts?: { targetLang?: string; baseDir?: string },
): ConvoGoalBank | null {
  const filePath = authoredLessonDayPath(day, opts);
  if (!existsSync(filePath)) return null;
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  return parseLessonDayBankJson(raw, { day });
}

/** Sync memory cache getter (Mongo wired in F5). */
export function getCachedLessonDayBankSync(
  day: number,
): ConvoGoalBank | null {
  return memoryLessonDayBanks.get(lessonDayCacheSlug(day)) ?? null;
}

export function setCachedLessonDayBankMemory(
  day: number,
  bank: ConvoGoalBank,
): void {
  memoryLessonDayBanks.set(lessonDayCacheSlug(day), bank);
}

export function resetMemoryLessonDayBanks(): void {
  memoryLessonDayBanks.clear();
}

/**
 * Loader order for a lesson day:
 * 1. authored content file
 * 2. cached generated bank (memory / later Mongo)
 * 3. null — caller falls back to core-items `loadGoalsForDayCore`
 */
export function resolveLessonDayBank(
  day: number,
  opts?: { targetLang?: string; baseDir?: string },
): ConvoGoalBank | null {
  if (!(typeof day === 'number' && day > 0)) return null;
  const authored = loadAuthoredLessonDayBank(day, opts);
  if (authored) return authored;
  return getCachedLessonDayBankSync(day);
}
