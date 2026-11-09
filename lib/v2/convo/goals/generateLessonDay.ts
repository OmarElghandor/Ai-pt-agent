import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ConvoGoalBankModel } from '@/lib/v2/mongo/models';
import { getCoreItemsDay } from '@/lib/v2/generation/lesson/coreItems';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import { keywordsFromExamples } from './keywords';
import {
  lessonDayCacheSlug,
  loadAuthoredLessonDayBank,
  parseLessonDayBankJson,
  setCachedLessonDayBankMemory,
  getCachedLessonDayBankSync,
} from './loadLessonDay';
import { sceneForDay } from './fromLesson';
import type { ConvoGoal, ConvoGoalBank } from './types';
import { validateLessonDayBank } from './validate';

export type LessonDayBankGenerator = (input: {
  day: number;
  targetLang: string;
}) => Promise<ConvoGoalBank>;

/** Day-1 authored JSON is the few-shot schema example (path only; not mutated). */
export function lessonDayExamplePath(): string {
  return 'content/v2/convo/goals/pt-PT.day-1.json';
}

/**
 * Deterministic stub bank for days without an authored file (tests / offline).
 * Uses plan titles + core phrases as goals with ask lines.
 */
export function stubGenerateLessonDayBank(day: number): ConvoGoalBank {
  let title_tl = `Dia ${day}`;
  let title_ar = `يوم ${day}`;
  let character_id = 'ines';
  let place: string | undefined;
  try {
    const plan = getDayPlan(day);
    title_tl = plan.title_tl;
    title_ar = plan.title_ar;
    character_id = plan.generation?.chat_character ?? 'ines';
    place = plan.situation_eg || plan.generation?.situation_tl;
  } catch {
    /* plan optional */
  }

  const entry = getCoreItemsDay(day);
  const phraseItems = entry.core_items.filter(
    (i) => i.kind === 'phrase' || i.kind === 'pattern',
  );
  const wordItems = entry.core_items.filter(
    (i) => i.kind === 'word' || i.kind === 'verb',
  );
  const picked = phraseItems.slice(0, 6);
  const goals: ConvoGoal[] = (picked.length ? picked : phraseItems.slice(0, 4)).map(
    (item, i) => {
      const examples = [item.tl, ...(item.variant_tl ?? [])]
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 4);
      const ask_tl = examples[0] ?? (item.tl || `Frase ${i + 1}`);
      const examples_tl = examples.length ? examples : [ask_tl];
      let keywords = keywordsFromExamples(examples_tl);
      if (!keywords.length) {
        keywords = ask_tl
          .toLowerCase()
          .split(/\s+/)
          .map((t) => t.replace(/[^\p{L}\p{N}-]/gu, ''))
          .filter((t) => t.length > 1)
          .slice(0, 4);
      }
      if (!keywords.length) keywords = [`g${i + 1}`];
      return {
        id: `day.${day}.g${i + 1}`,
        intent_eg: item.eg || `يقول: ${item.tl}`,
        intent_en: `say: ${item.tl}`,
        ask_tl,
        ask_ar: item.ar || item.eg || ask_tl,
        examples_tl,
        keywords,
        help: {
          frame_tl: ask_tl.includes(' ')
            ? ask_tl.replace(/\S+$/, '___')
            : `${ask_tl} ___`,
          eg: item.eg || 'قولها كده',
          chips: examples_tl.slice(0, 3),
        },
      };
    },
  );

  // Ensure at least 4 goals for schema parity with day-1.
  while (goals.length < 4) {
    const n = goals.length + 1;
    goals.push({
      id: `day.${day}.g${n}`,
      intent_eg: `هدف ${n}`,
      intent_en: `goal ${n}`,
      ask_tl: `Como está?`,
      ask_ar: 'كيف حالك؟',
      examples_tl: ['Bem.', 'Tudo bem.'],
      keywords: keywordsFromExamples(['Bem.', 'Tudo bem.']),
      help: {
        frame_tl: 'Tudo ___.',
        eg: 'قول إنك تمام',
        chips: ['Bem.', 'Tudo bem.'],
      },
    });
  }

  const bank: ConvoGoalBank = {
    source: 'generated',
    day,
    authored: false,
    title_tl,
    title_ar,
    intro_eg: `هنتكلم عن درس يوم ${day}: ${title_ar}.`,
    opening: {
      tl: `Olá! Vamos falar sobre: ${title_tl}.`,
      ar: `مرحباً! سنتحدث عن: ${title_ar}.`,
    },
    closing: {
      tl: 'Até amanhã, {name}!',
      ar: 'إلى الغد يا {name}!',
    },
    goals,
    suggested_words: wordItems.map((w) => w.tl).slice(0, 8),
    scene: {
      ...sceneForDay(day, 'morning'),
      character_id,
      ...(place ? { place } : {}),
      address: 'tu',
    },
  };

  const { ok, issues } = validateLessonDayBank(bank);
  if (!ok) {
    throw new Error(
      `stub lesson-day bank invalid: ${issues
        .map((i) => `${i.path}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return bank;
}

export async function getCachedLessonDayBank(
  day: number,
  targetLang = 'pt-PT',
): Promise<ConvoGoalBank | null> {
  const mem = getCachedLessonDayBankSync(day);
  if (mem) return mem;
  if (!mongoConfigured()) return null;
  await connectMongo();
  const slug = lessonDayCacheSlug(day);
  const doc = await V2ConvoGoalBankModel()
    .findOne({ target_lang: targetLang, topic_slug: slug })
    .lean();
  if (!doc) return null;
  const raw =
    (doc as { bank?: unknown }).bank ??
    (Array.isArray((doc as { goals?: unknown }).goals)
      ? {
          source: 'generated',
          day,
          goals: (doc as { goals: ConvoGoal[] }).goals,
          suggested_words: [],
        }
      : null);
  if (!raw) return null;
  try {
    const bank = parseLessonDayBankJson(raw, { day });
    setCachedLessonDayBankMemory(day, bank);
    return bank;
  } catch {
    return null;
  }
}

export async function saveLessonDayBankCache(opts: {
  day: number;
  bank: ConvoGoalBank;
  targetLang?: string;
}): Promise<void> {
  const targetLang = opts.targetLang ?? 'pt-PT';
  const slug = lessonDayCacheSlug(opts.day);
  setCachedLessonDayBankMemory(opts.day, opts.bank);
  if (!mongoConfigured()) return;
  await connectMongo();
  await V2ConvoGoalBankModel().findOneAndUpdate(
    { target_lang: targetLang, topic_slug: slug },
    {
      $set: {
        target_lang: targetLang,
        topic_slug: slug,
        goals: opts.bank.goals,
        bank: opts.bank,
      },
    },
    { upsert: true },
  );
}

/**
 * Authored file → cache → generate once (stub or injected generator).
 */
export async function ensureLessonDayGoalBank(opts: {
  day: number;
  targetLang?: string;
  generator?: LessonDayBankGenerator;
  /** Force regenerate even if cached (admin). */
  force?: boolean;
}): Promise<{ bank: ConvoGoalBank; fromCache: boolean; source: 'authored' | 'cache' | 'generated' }> {
  const day = opts.day;
  const targetLang = opts.targetLang ?? 'pt-PT';
  const authored = loadAuthoredLessonDayBank(day, { targetLang });
  if (authored) {
    return { bank: authored, fromCache: true, source: 'authored' };
  }

  if (!opts.force) {
    const cached = await getCachedLessonDayBank(day, targetLang);
    if (cached) {
      return { bank: cached, fromCache: true, source: 'cache' };
    }
  }

  const generator =
    opts.generator ??
    (async ({ day: d }) => stubGenerateLessonDayBank(d));
  let bank = await generator({ day, targetLang });
  const { ok, issues } = validateLessonDayBank(bank);
  if (!ok) {
    bank = stubGenerateLessonDayBank(day);
    const again = validateLessonDayBank(bank);
    if (!again.ok) {
      throw new Error(
        `Generated lesson-day bank invalid: ${issues
          .map((i) => i.message)
          .join('; ')}`,
      );
    }
  }
  bank = {
    ...bank,
    source: 'generated',
    day,
    authored: false,
  };
  await saveLessonDayBankCache({ day, bank, targetLang });
  return { bank, fromCache: false, source: 'generated' };
}

/** List cached generated lesson-day banks (for admin review). */
export async function listCachedLessonDayBanks(
  targetLang = 'pt-PT',
): Promise<
  Array<{
    day: number;
    title_tl: string;
    title_ar: string;
    goal_count: number;
    source: string;
  }>
> {
  if (!mongoConfigured()) {
    // Memory-only: scan days 2–5 that happen to be cached.
    const rows = [];
    for (let d = 2; d <= 5; d++) {
      const b = getCachedLessonDayBankSync(d);
      if (b) {
        rows.push({
          day: d,
          title_tl: b.title_tl ?? `Dia ${d}`,
          title_ar: b.title_ar ?? `يوم ${d}`,
          goal_count: b.goals.length,
          source: b.source,
        });
      }
    }
    return rows;
  }
  await connectMongo();
  const docs = await V2ConvoGoalBankModel()
    .find({
      target_lang: targetLang,
      topic_slug: { $regex: /^lesson\.day-/ },
    })
    .lean();
  const out: Array<{
    day: number;
    title_tl: string;
    title_ar: string;
    goal_count: number;
    source: string;
  }> = [];
  for (const doc of docs) {
    const slug = String((doc as { topic_slug?: string }).topic_slug ?? '');
    const m = slug.match(/^lesson\.day-(\d+)$/);
    if (!m) continue;
    const day = Number(m[1]);
    const bankRaw = (doc as { bank?: ConvoGoalBank }).bank;
    out.push({
      day,
      title_tl: bankRaw?.title_tl ?? `Dia ${day}`,
      title_ar: bankRaw?.title_ar ?? `يوم ${day}`,
      goal_count: Array.isArray(bankRaw?.goals)
        ? bankRaw!.goals.length
        : Array.isArray((doc as { goals?: unknown[] }).goals)
          ? (doc as { goals: unknown[] }).goals.length
          : 0,
      source: bankRaw?.source ?? 'generated',
    });
  }
  return out.sort((a, b) => a.day - b.day);
}
