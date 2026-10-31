import type { Page, Preset } from '@/lib/v2/content/page';
import type { CriticIssue } from './jobs/runCritic';
import { PRESET_CATALOGS } from './prompts/pageCatalog';

/** Allowed guided/explore target addresses (00-decisions §3). */
export const TARGET_ADDRESS_RE =
  /^b\d+(\/(col|row|item):\d+|\/cell:\d+:\d+|\/entry:\d+:\d+)?$/i;

const REQUIRED_SAY_LETTERS = /[پڤچغ]/;
const FALSE_PRON_RE =
  /(?:wrong|incorrect|invalid|should be|must be|استخدم|غلط|خطأ).{0,40}(?:پ|ڤ|چ|غ|ف|ج|ب|ق)|(?:پ|ڤ|چ|غ).{0,40}(?:wrong|incorrect|invalid|فصحى|MSA|latin)/i;

const TARGET_AS_ITEM_RE =
  /target.+(?:item id|phrase\.|word\.|pattern\.)|(?:use|prefer).+(?:phrase\.|word\.)/i;

/**
 * Drop critic issues that contradict pipeline contracts before page regen.
 */
export function filterCriticIssues(
  issues: CriticIssue[],
  opts: { preset: Preset | string; page: Page },
): { kept: CriticIssue[]; dropped: CriticIssue[]; high: CriticIssue[] } {
  const catalog = PRESET_CATALOGS[opts.preset as Preset];
  const kept: CriticIssue[] = [];
  const dropped: CriticIssue[] = [];

  for (const issue of issues) {
    const msg = issue.message ?? '';
    const path = issue.path ?? '';

    // Sections pages: drop retired guided step-order critiques
    if (opts.page.mode === 'sections') {
      if (
        /step|ask spacing|ask density|12–20|12-20|guided|autoplay|chapter/i.test(
          msg,
        )
      ) {
        dropped.push(issue);
        continue;
      }
    }

    // پ ڤ چ غ are required say letters — never an error
    if (REQUIRED_SAY_LETTERS.test(msg) && FALSE_PRON_RE.test(msg)) {
      dropped.push(issue);
      continue;
    }
    if (
      /(?:say|pronunciation|نطق)/i.test(msg) &&
      REQUIRED_SAY_LETTERS.test(msg) &&
      /(?:wrong|bad|invalid|غلط|خطأ|should not|don't use)/i.test(msg)
    ) {
      dropped.push(issue);
      continue;
    }

    // Legal block target addresses
    const targetHit = msg.match(/\bb\d+(?:\/[\w:]+)?\b/i);
    if (targetHit && TARGET_ADDRESS_RE.test(targetHit[0]!)) {
      if (
        /invalid target|bad target|wrong target|not a valid target/i.test(msg)
      ) {
        dropped.push(issue);
        continue;
      }
    }
    if (TARGET_AS_ITEM_RE.test(msg) && /b\d+/i.test(msg + path)) {
      // Critic saying block targets should be item ids — drop
      dropped.push(issue);
      continue;
    }

    // Self-test / cover before model answers — if page already has cover or practice early
    if (
      /self-?test|cover|غطّي|اختبر/.test(msg) &&
      /after|too late|should come before|لازم قبل/.test(msg)
    ) {
      const hasCover = Boolean(opts.page.cover);
      const practiceIdx = opts.page.blocks.findIndex((b) => b.type === 'practice');
      const tipIdx = opts.page.blocks.findIndex((b) => b.type === 'tip');
      if (hasCover || (practiceIdx >= 0 && (tipIdx < 0 || practiceIdx < tipIdx))) {
        dropped.push(issue);
        continue;
      }
      // Catalog already documents order
      if (catalog && /self-test|practice/.test(catalog.blocks)) {
        // only drop if critic invents order opposite to catalog without evidence
        if (/answers before|model answer before/i.test(msg)) {
          dropped.push(issue);
          continue;
        }
      }
    }

    kept.push(issue);
  }

  return {
    kept,
    dropped,
    high: kept.filter((i) => i.severity === 'high'),
  };
}

/**
 * At most one page requeue per page index when critic finds high issues.
 * `regenCount` is meta.critic_regen[pageIndex] (0 before first rerun).
 */
export function decideCriticRerun(opts: {
  highCount: number;
  regenCount: number;
}): { requeue: boolean; nextRegen: number } {
  const regenCount = Math.max(0, opts.regenCount);
  if (opts.highCount > 0 && regenCount < 1) {
    return { requeue: true, nextRegen: 1 };
  }
  return { requeue: false, nextRegen: regenCount };
}

/** Deep-merge one page's critic_notes / critic_regen into existing meta maps. */
export function mergeCriticMeta(
  prev: {
    critic_notes?: Record<string, string[]>;
    critic_regen?: Record<string, number>;
  },
  pageIndex: number | string,
  opts: { notes?: string[]; regen?: number },
): {
  critic_notes: Record<string, string[]>;
  critic_regen: Record<string, number>;
} {
  const key = String(pageIndex);
  const critic_notes = { ...(prev.critic_notes ?? {}) };
  const critic_regen = { ...(prev.critic_regen ?? {}) };
  if (opts.notes) critic_notes[key] = opts.notes;
  if (opts.regen != null) critic_regen[key] = opts.regen;
  return { critic_notes, critic_regen };
}
