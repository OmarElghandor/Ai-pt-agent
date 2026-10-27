import { readFileSync } from 'node:fs';
import path from 'node:path';

export type PagePlanEntry = {
  preset: string;
  focus?: string;
};

export type DayGeneration = {
  situation_tl?: string;
  can_do?: string[];
  grammar_focus?: {
    id: string;
    description: string;
    layout?: string;
  };
  chat_character?: string;
  dictionary_category?: string;
  micro_step?: {
    series: string;
    step: number;
    of: number;
    previous: string | null;
    today: string;
  };
  tomorrow?: { tl: string; eg: string };
  new_items?: { words: string[]; phrases: string[] };
  /** Optional explicit core vocab; else code uses new_items.words. */
  core_items_tl?: string[];
  recycle?: string[];
  page_plan?: PagePlanEntry[];
  story_outline?: string[];
  max_new_words?: number;
};

export type DayPlan = {
  day: number;
  week: number;
  title_tl: string;
  title_ar: string;
  situation_eg: string;
  example_tl: string;
  rule_eg: string;
  extra_units_tl: string[];
  early_chunks_tl: string[];
  book_pages: string[];
  is_story: boolean;
  generation?: DayGeneration;
};

export type PlanFile = {
  target_lang: string;
  days: DayPlan[];
};

const DEFAULT_PLAN_PATH = path.join(
  process.cwd(),
  'content/v2/plan/pt-PT.days.json',
);

export function loadPlan(planPath = DEFAULT_PLAN_PATH): PlanFile {
  const raw = JSON.parse(readFileSync(planPath, 'utf8')) as PlanFile;
  if (!raw?.days?.length) {
    throw new Error(`Empty plan at ${planPath}`);
  }
  return raw;
}

export function getDayPlan(day: number, planPath?: string): DayPlan {
  const plan = loadPlan(planPath);
  const entry = plan.days.find((d) => d.day === day);
  if (!entry) {
    throw new Error(`Day ${day} not found in plan`);
  }
  return entry;
}

export function canGenerate(day: DayPlan): { ok: true } | { ok: false; reason: string } {
  const gen = day.generation;
  if (!gen) {
    return { ok: false, reason: 'missing generation block' };
  }
  // Core items live in pt-PT.core-items.json; story / day 30 may have empty new_items.
  if (!gen.page_plan?.length) {
    return { ok: false, reason: 'page_plan missing' };
  }
  return { ok: true };
}
