import { phaseForDay } from './buildRequest';
import {
  getCoreItemsDay,
  isNoNewItemsDay,
  type CoreItem,
} from './coreItems';
import type { DayDigest } from './handoffs';
import type { DayPlan } from './plan';

export type LessonBrief = {
  day: number;
  phase: number;
  week: number;
  title_tl: string;
  title_ar: string;
  situation_eg: string;
  rule_eg: string;
  grammar_focus: string;
  max_words: number;
  chat_character: string;
  early_chunks_tl: string[];
  /** Core items from pt-PT.core-items.json (source of truth). */
  core_items: CoreItem[];
  /** Surface tl strings derived from core_items (prompt convenience). */
  core_items_tl: string[];
  /** Always from the core-items file — never inferred from the day plan. */
  core_items_source: 'core_file';
  /** Recycle ids from the core-items file (resolved against KNOWN at items job). */
  recycle_ids: string[];
  /** Story days / day 30 / empty core — no new items. */
  no_new_items: boolean;
  planned_presets: string[];
  /** Previous day's day_digest + new items, when available. */
  yesterday: DayDigest | null;
  /** day>1 but no previous assemble digest loaded. */
  yesterday_missing: boolean;
  micro_step: string;
  /** Admin-visible non-blocking warnings. */
  warnings: string[];
};

export function maxWordsForPhase(phase: number): number {
  if (phase <= 1) return 7;
  if (phase <= 2) return 10;
  return 14;
}

export function buildLessonBrief(
  dayPlan: DayPlan,
  opts?: { phase?: number; yesterday?: DayDigest | null },
): LessonBrief {
  const gen = dayPlan.generation ?? {};
  const ph = opts?.phase ?? phaseForDay(dayPlan.day);
  const gf = gen.grammar_focus;
  const micro = gen.micro_step;
  const micro_step = micro
    ? `${micro.series} · step ${micro.step} of ${micro.of} · previous: ${micro.previous ?? 'none'} · today: ${micro.today}`
    : '(none)';
  const coreDay = getCoreItemsDay(dayPlan.day);
  const core_items = [...coreDay.core_items];
  const recycle_ids = [...coreDay.recycle_ids];
  const no_new_items = isNoNewItemsDay(coreDay);
  const planned_presets = (gen.page_plan ?? []).map((p) => p.preset);
  const yesterday = opts?.yesterday ?? null;
  const yesterday_missing = dayPlan.day > 1 && yesterday == null;
  const warnings: string[] = [];
  if (yesterday_missing) warnings.push('yesterday_missing');
  if (no_new_items) warnings.push('no_new_items');

  return {
    day: dayPlan.day,
    phase: ph,
    week: dayPlan.week,
    title_tl: dayPlan.title_tl,
    title_ar: dayPlan.title_ar,
    situation_eg: dayPlan.situation_eg,
    rule_eg: dayPlan.rule_eg || '(none)',
    grammar_focus: gf
      ? `${gf.id} — ${gf.description}${gf.layout ? ` (layout: ${gf.layout})` : ''}`
      : dayPlan.rule_eg || '(none)',
    max_words: maxWordsForPhase(ph),
    chat_character: gen.chat_character ?? 'ines',
    early_chunks_tl: [...(dayPlan.early_chunks_tl ?? [])],
    core_items,
    core_items_tl: core_items.map((c) => c.tl),
    core_items_source: 'core_file',
    recycle_ids,
    no_new_items,
    planned_presets,
    yesterday,
    yesterday_missing,
    micro_step,
    warnings,
  };
}

/** Compact DAY header for prompts (every job). */
export function formatLessonBrief(brief: LessonBrief): string {
  const early =
    brief.early_chunks_tl.length > 0
      ? brief.early_chunks_tl.join(' · ')
      : '(none)';
  const coreIds =
    brief.core_items.length > 0
      ? brief.core_items.map((c) => c.id).join(', ')
      : '(none)';
  const coreTl =
    brief.core_items_tl.length > 0
      ? brief.core_items_tl.join(' · ')
      : '(none)';
  const recycle =
    brief.recycle_ids.length > 0
      ? brief.recycle_ids.join(', ')
      : '(none)';
  const presets =
    brief.planned_presets.length > 0
      ? brief.planned_presets.join(', ')
      : '(none)';
  const yesterday = brief.yesterday
    ? `introduced: ${brief.yesterday.introduced_ids.slice(0, 12).join(', ') || '(none)'} · rule: ${brief.yesterday.rule}`
    : '(none)';
  return `DAY
day: ${brief.day}
phase: ${brief.phase}
week: ${brief.week}
title_tl: ${brief.title_tl}
title_ar: ${brief.title_ar}
situation_eg: ${brief.situation_eg}
rule_eg: ${brief.rule_eg}
grammar_focus: ${brief.grammar_focus}
max_words: ${brief.max_words}
early_chunks_tl: ${early}
core_items: ${coreIds}
core_items_tl: ${coreTl}
core_items_source: ${brief.core_items_source}
recycle_ids: ${recycle}
no_new_items: ${brief.no_new_items ? 'yes' : 'no'}
planned_presets: ${presets}
chat_character: ${brief.chat_character}
yesterday: ${yesterday}
yesterday_missing: ${brief.yesterday_missing ? 'yes' : 'no'}
warnings: ${brief.warnings.length ? brief.warnings.join('; ') : '(none)'}
micro_step: ${brief.micro_step}`;
}
