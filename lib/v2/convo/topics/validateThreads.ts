import {
  findBrazilianLeak,
  findEnglishLeak,
} from '@/lib/v2/convo/output/checks';
import { ThreadTopicFileSchema } from './threadSchema';
import type {
  ThreadAsk,
  ThreadCheckIssue,
  ThreadFollowUp,
  ThreadTopicFile,
  ValidateThreadsResult,
} from './threadTypes';

/** Formal verb openers banned for tu characters (Batch 9 C1). */
export const FORMAL_OPENERS = [
  'Mora',
  'Gosta',
  'Tem',
  'Vive',
  'Pode',
  'Faz',
  'Vai',
] as const;

const FORMAL_OPENER_RE = new RegExp(
  `^\\s*(${FORMAL_OPENERS.join('|')})\\b`,
);

const TU_BAN_RE = /\bvocê\b|\ba sua\b|\bo seu\b/i;

function countQuestionMarks(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

function pushBrazilianEnglish(
  issues: ThreadCheckIssue[],
  path: string,
  tl: string,
): void {
  const br = findBrazilianLeak(tl);
  if (br) {
    issues.push({
      path,
      rule: 'brazilian',
      message: `brazilian:${br}`,
    });
  }
  const en = findEnglishLeak(tl);
  if (en) {
    issues.push({
      path,
      rule: 'english',
      message: `english:${en}`,
    });
  }
}

function checkTuFormal(
  issues: ThreadCheckIssue[],
  path: string,
  tl: string,
  addressIsTu: boolean,
): void {
  if (!addressIsTu) return;
  if (TU_BAN_RE.test(tl)) {
    issues.push({
      path,
      rule: 'tu',
      message: 'tu character must not use você / a sua / o seu',
    });
  }
  if (FORMAL_OPENER_RE.test(tl)) {
    issues.push({
      path,
      rule: 'formal',
      message: `tu ask/follow-up must not start with a formal verb (${tl.slice(0, 24)})`,
    });
  }
}

function checkShare(
  issues: ThreadCheckIssue[],
  path: string,
  share: { tl: string; ar: string },
): void {
  if (!share.ar.trim()) {
    issues.push({ path: `${path}.ar`, rule: 'ar', message: 'ar required' });
  }
  if (countQuestionMarks(share.tl) !== 0) {
    issues.push({
      path: `${path}.tl`,
      rule: 'question_mark',
      message: 'share must have no "?"',
    });
  }
  pushBrazilianEnglish(issues, `${path}.tl`, share.tl);
}

function checkAskOrFollowUp(
  issues: ThreadCheckIssue[],
  path: string,
  line: ThreadAsk | ThreadFollowUp,
  addressIsTu: boolean,
): void {
  if (!line.ar.trim()) {
    issues.push({ path: `${path}.ar`, rule: 'ar', message: 'ar required' });
  }
  const q = countQuestionMarks(line.tl);
  if (q !== 1) {
    issues.push({
      path: `${path}.tl`,
      rule: 'question_mark',
      message: `ask/follow-up must have exactly one "?", got ${q}`,
    });
  }
  if (!line.frame?.chips || line.frame.chips.length < 2) {
    issues.push({
      path: `${path}.frame.chips`,
      rule: 'chips',
      message: 'frame needs ≥2 chips',
    });
  }
  pushBrazilianEnglish(issues, `${path}.tl`, line.tl);
  checkTuFormal(issues, `${path}.tl`, line.tl, addressIsTu);
}

/**
 * Validate a thread topic file: zod shape + Batch 9 C1 content rules.
 * `addressIsTu` comes from the persona for topic.character_id (default true).
 */
export function validateThreadTopicFile(
  raw: unknown,
  opts?: { addressIsTu?: boolean },
): ValidateThreadsResult {
  const addressIsTu = opts?.addressIsTu ?? true;
  const issues: ThreadCheckIssue[] = [];

  const parsed = ThreadTopicFileSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        path: issue.path.join('.') || '(root)',
        rule: 'shape',
        message: issue.message,
      });
    }
    return { ok: false, issues, doc: null };
  }

  const doc = parsed.data as ThreadTopicFile;
  const seen = new Set<string>();

  for (let i = 0; i < doc.threads.length; i++) {
    const thread = doc.threads[i]!;
    const base = `threads[${i}]`;
    if (seen.has(thread.id)) {
      issues.push({
        path: `${base}.id`,
        rule: 'id',
        message: `duplicate id ${thread.id}`,
      });
    }
    seen.add(thread.id);

    checkShare(issues, `${base}.share`, thread.share);
    checkAskOrFollowUp(issues, `${base}.ask`, thread.ask, addressIsTu);
    for (let j = 0; j < thread.follow_ups.length; j++) {
      checkAskOrFollowUp(
        issues,
        `${base}.follow_ups[${j}]`,
        thread.follow_ups[j]!,
        addressIsTu,
      );
    }
  }

  // Opening / intro are not asks; still ban BR and você in opening_tl
  pushBrazilianEnglish(issues, 'topic.opening_tl', doc.topic.opening_tl);
  if (addressIsTu && TU_BAN_RE.test(doc.topic.opening_tl)) {
    issues.push({
      path: 'topic.opening_tl',
      rule: 'tu',
      message: 'tu character must not use você / a sua / o seu',
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues, doc: null };
  }
  return { ok: true, issues: [], doc };
}
