import type { LessonPack } from '@/lib/v2/content/lesson';
import {
  resolveForm,
  type ResolvedForm,
} from '@/lib/v2/content/conjugations/resolve';
import { modeForPreset, type Page } from '@/lib/v2/content/page';
import { swapAlternateIds } from './explore';

/** Resolve mode from preset; drop steps/controls that contradict it. */
export function normalizePageForPlayer(page: Page): Page {
  const mode = modeForPreset(page.preset);
  if (mode === page.mode) return page;
  const next: Page = { ...page, mode };
  if (mode === 'static') {
    const { steps: _s, controls: _c, locked_until: _l, ...rest } = next;
    return rest;
  }
  if (mode === 'explore') {
    const { steps: _s, ...rest } = next;
    return rest;
  }
  // guided: drop controls
  const { controls: _c, locked_until: _l, ...rest } = next;
  return rest;
}

export type FormView = ResolvedForm & { id: string };

export function collectVerbIds(value: unknown): string[] {
  const found =
    JSON.stringify(value).match(/verb\.[a-zçãõáéíóúâêô]+:[a-z]+:[a-z]+/gi) ?? [];
  return [...new Set(found)];
}

export function verbIdsForPages(pages: readonly Page[]): string[] {
  const ids = new Set<string>(collectVerbIds(pages));
  for (const page of pages) {
    for (const id of swapAlternateIds(page)) ids.add(id);
  }
  return [...ids];
}

export function buildFormMap(ids: readonly string[]): Record<string, FormView> {
  const forms: Record<string, FormView> = {};
  for (const id of ids) {
    const form = resolveForm(id);
    if (!form) continue;
    forms[id] = { id, ...form };
  }
  return forms;
}

export type PlayerLesson = {
  day: number;
  targetLang: string;
  situation?: { tl: string; eg: string };
  pages: LessonPack['pages'];
  items: LessonPack['items'];
  questions: LessonPack['questions'];
  /** Resolved forms for every verb ref on the pages, plus swap alternates. */
  forms: Record<string, FormView>;
};

export function buildPlayerLesson(pack: LessonPack): PlayerLesson {
  const pages = pack.pages.map(normalizePageForPlayer);
  return {
    day: pack.lesson.day,
    targetLang: pack.lesson.target_lang,
    situation: pack.lesson.situation,
    pages,
    items: pack.items,
    questions: pack.questions,
    forms: buildFormMap(verbIdsForPages(pages)),
  };
}
