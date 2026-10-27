import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadConjugationSeed } from '@/lib/v2/content/conjugations/resolve';
import type { LessonPack } from '@/lib/v2/content/lesson';
import type { DayPlan } from './plan';

export type KnownItem = { id: string; tl: string };

export type BuildRequestOptions = {
  dayPlan: DayPlan;
  phase?: number;
  knownItems?: KnownItem[];
  existingImageKeys?: string[];
  targetLang?: string;
};

export function phaseForDay(day: number): number {
  if (day <= 30) return 1;
  if (day <= 60) return 2;
  return 3;
}

export function verifiedLemmas(targetLang = 'pt-PT'): string[] {
  const seed = loadConjugationSeed();
  if (seed.target_lang && seed.target_lang !== targetLang) {
    // seed is the only conjugation file today
  }
  return seed.verbs.filter((v) => v.verified).map((v) => v.lemma).sort();
}

export function loadExistingImageKeys(): string[] {
  const indexPath = path.join(process.cwd(), 'content/v2/assets/index.json');
  if (!existsSync(indexPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(indexPath, 'utf8')) as { keys?: string[] };
    return Array.isArray(raw.keys) ? raw.keys : [];
  } catch {
    return [];
  }
}

function filterImageKeys(keys: string[], category?: string): string[] {
  if (!category || keys.length < 40) return keys;
  const prefixes = [category, 'scene.', 'emotion.', 'verb.', 'place.'];
  return keys.filter((k) => prefixes.some((p) => k.startsWith(p) || k.includes(`.${category}`)));
}

/** Normalize phrase text for dedupe (ignore trailing punctuation / case). */
export function normalizePhraseKey(s: string): string {
  return s
    .trim()
    .replace(/[.!?…]+$/u, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Merge early_chunks_tl into NEW_ITEMS.phrases (deduped). */
export function mergePhrasesWithEarlyChunks(
  phrases: string[],
  earlyChunks: string[],
): string[] {
  const out = [...phrases];
  const seen = new Set(out.map(normalizePhraseKey));
  for (const chunk of earlyChunks) {
    const key = normalizePhraseKey(chunk);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(chunk);
  }
  return out;
}

/**
 * Compact DAY block for the cached system prefix (page / questions / continuity).
 */
export function formatCompactDayHeader(dayPlan: DayPlan, phase?: number): string {
  const gen = dayPlan.generation ?? {};
  const gf = gen.grammar_focus;
  const ph = phase ?? phaseForDay(dayPlan.day);
  const early =
    (dayPlan.early_chunks_tl ?? []).join(' · ') || '(none)';
  const grammar = gf
    ? `${gf.id} — ${gf.description}${gf.layout ? ` (layout: ${gf.layout})` : ''}`
    : dayPlan.rule_eg || '(none)';

  return `DAY
day: ${dayPlan.day}
phase: ${ph}
week: ${dayPlan.week}
title_tl: ${dayPlan.title_tl}
title_ar: ${dayPlan.title_ar}
situation_eg: ${dayPlan.situation_eg}
rule_eg: ${dayPlan.rule_eg || '(none)'}
grammar_focus: ${grammar}
early_chunks_tl: ${early}
chat_character: ${gen.chat_character ?? 'ines'}`;
}

/**
 * Micro-relevant day slices for stage C user message (no gold example).
 */
export function formatQuestionsDaySlice(dayPlan: DayPlan): string {
  const gen = dayPlan.generation ?? {};
  const micro = gen.micro_step;
  const microLine = micro
    ? `MICRO_STEP: ${micro.series}${micro.series ? ` (${micro.series})` : ''} · step ${micro.step} of ${micro.of} · previous: ${micro.previous ?? 'none'} · today: ${micro.today}`
    : 'MICRO_STEP: (none specified)';
  const tomorrow = gen.tomorrow
    ? `tomorrow: ${gen.tomorrow.tl} · ${gen.tomorrow.eg}`
    : 'tomorrow: (next day in plan)';
  const phrases = mergePhrasesWithEarlyChunks(
    gen.new_items?.phrases ?? [],
    dayPlan.early_chunks_tl ?? [],
  );
  const words = (gen.new_items?.words ?? []).join(', ') || '(none)';
  const recycle = (gen.recycle ?? []).join(', ') || '(none)';

  return `${microLine}
${tomorrow}
NEW_ITEMS
words: ${words}
phrases: ${phrases.join(' · ') || '(none)'}
RECYCLE
${recycle}`;
}

export function buildDayRequest(opts: BuildRequestOptions): string {
  const { dayPlan } = opts;
  const gen = dayPlan.generation ?? {};
  const day = dayPlan.day;
  const phase = opts.phase ?? phaseForDay(day);
  const kind = dayPlan.is_story ? 'story' : 'lesson';
  const verbs = verifiedLemmas(opts.targetLang ?? 'pt-PT');
  const known = opts.knownItems ?? [];
  const imageKeys = filterImageKeys(
    opts.existingImageKeys ?? loadExistingImageKeys(),
    gen.dictionary_category,
  );

  const gf = gen.grammar_focus;
  const micro = gen.micro_step;
  const canDo = (gen.can_do ?? []).join(' · ') || dayPlan.rule_eg;
  const situationTl = gen.situation_tl ?? dayPlan.example_tl;
  const situationEg = dayPlan.situation_eg;
  const extraUnits =
    (dayPlan.extra_units_tl ?? []).join(' · ') || '(none)';
  const earlyChunks =
    (dayPlan.early_chunks_tl ?? []).join(' · ') || '(none)';

  const newWords = (gen.new_items?.words ?? []).join(', ');
  const mergedPhrases = mergePhrasesWithEarlyChunks(
    gen.new_items?.phrases ?? [],
    dayPlan.early_chunks_tl ?? [],
  );
  const newPhrases = mergedPhrases.join(' · ');
  const recycle = (gen.recycle ?? []).join(', ') || '(none)';
  const knownLines =
    known.length === 0
      ? '(none yet)'
      : known.map((k) => `${k.id}: ${k.tl}`).join(' · ');

  const pagePlan =
    (gen.page_plan ?? [])
      .map((p, i) => `${i + 1}. ${p.preset}${p.focus ? ` — ${p.focus}` : ''}`)
      .join('\n') || '(choose presets that fit the situation)';

  const storyBlock =
    kind === 'story'
      ? `\nstory_outline:\n${(gen.story_outline ?? []).map((l) => `- ${l}`).join('\n') || '- (from plan)'}\nmax_new_words: ${gen.max_new_words ?? 3}\n`
      : '';

  const microLine = micro
    ? `MICRO_STEP: ${micro.series}${micro.series ? ` (${micro.series})` : ''} · step ${micro.step} of ${micro.of} · previous: ${micro.previous ?? 'none'} · today: ${micro.today}`
    : 'MICRO_STEP: (none specified)';

  const tomorrow = gen.tomorrow
    ? `tomorrow: ${gen.tomorrow.tl} · ${gen.tomorrow.eg}`
    : 'tomorrow: (next day in plan)';

  return `Write day ${day} of 90.

DAY
kind: ${kind}
phase: ${phase} · week: ${dayPlan.week}
title: ${dayPlan.title_tl} · ${dayPlan.title_ar}
situation: ${situationTl} · ${situationEg}
example_tl: ${dayPlan.example_tl || '(none)'}
rule_eg: ${dayPlan.rule_eg || '(none)'}
extra_units_tl: ${extraUnits}
early_chunks_tl: ${earlyChunks}
can_do: ${canDo}
grammar_focus: ${gf ? `${gf.id} — ${gf.description}${gf.layout ? ` (layout: ${gf.layout})` : ''}` : dayPlan.rule_eg}
chat_character: ${gen.chat_character ?? 'ines'}
dictionary_category: ${gen.dictionary_category ?? 'general'}
${microLine}
${tomorrow}
${storyBlock}
NEW_ITEMS
words: ${newWords || '(none)'}
phrases: ${newPhrases || '(none)'}

KNOWN_ITEMS
${knownLines}

RECYCLE
${recycle}

VERB_TABLE
${verbs.join(', ')}

PAGE_PLAN
${pagePlan}

EXISTING_IMAGE_KEYS
${imageKeys.length ? imageKeys.join(', ') : '(none)'}

FIELD NAMES
Use schema field names: tl / tl_f (never pt), ar / ar_f, say (never say_ar), context_eg, eg for Egyptian explanations. lesson.target_lang = "pt-PT". lesson.day = ${day}. lesson.id = "pt-PT.d${String(day).padStart(2, '0')}".
`;
}

/** Collect known items from prior lesson packs (id + tl only). */
export function collectKnownItems(packs: LessonPack[]): KnownItem[] {
  const map = new Map<string, string>();
  for (const pack of packs) {
    for (const item of pack.items) {
      if (!item || typeof item !== 'object') continue;
      const id = (item as { id?: string }).id;
      const tl = (item as { tl?: string }).tl;
      if (id && tl && !map.has(id)) map.set(id, tl);
    }
  }
  return [...map.entries()].map(([id, tl]) => ({ id, tl }));
}
