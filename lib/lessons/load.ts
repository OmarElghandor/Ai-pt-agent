import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { formatValidationIssues, validateLessonPack } from './validate';
import type { LessonPack, ValidationIssue } from './types';

export type LoadedLesson = {
  file: string;
  pack: LessonPack;
};

export type LoadReport = {
  lessons: LoadedLesson[];
  live: LessonPack[];
  testOnly: LessonPack[];
  rejected: { file: string; issues: ValidationIssue[] }[];
};

const DEFAULT_DIR = path.join(process.cwd(), 'content', 'lessons');

export function loadLessonPacks(dir = DEFAULT_DIR): LoadReport {
  let files: string[] = [];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    return { lessons: [], live: [], testOnly: [], rejected: [] };
  }

  const lessons: LoadedLesson[] = [];
  const live: LessonPack[] = [];
  const testOnly: LessonPack[] = [];
  const rejected: { file: string; issues: ValidationIssue[] }[] = [];

  for (const file of files) {
    // Plan seed is not a LessonPack — loaded separately via seedPlan.ts
    if (file.startsWith('lesson-plan-seed')) continue;

    const full = path.join(dir, file);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(full, 'utf8'));
    } catch (err) {
      rejected.push({
        file,
        issues: [{ path: '', message: `invalid JSON: ${(err as Error).message}` }],
      });
      continue;
    }

    const result = validateLessonPack(raw);
    if (!result.ok) {
      rejected.push({ file, issues: result.issues });
      continue;
    }

    lessons.push({ file, pack: result.pack });
    if (result.pack.testOnly) {
      testOnly.push(result.pack);
    } else {
      live.push(result.pack);
    }
  }

  const ids = new Set<string>();
  for (const { file, pack } of lessons) {
    if (ids.has(pack.id)) {
      rejected.push({
        file,
        issues: [{ path: 'id', message: `duplicate lesson id "${pack.id}"` }],
      });
    }
    ids.add(pack.id);
  }

  // Drop duplicates from live/test catalogues if any were flagged.
  const rejectedIds = new Set(
    rejected
      .filter((r) => r.issues.some((i) => i.path === 'id' && i.message.startsWith('duplicate')))
      .map((r) => {
        const match = lessons.find((l) => l.file === r.file);
        return match?.pack.id;
      })
      .filter(Boolean),
  );

  return {
    lessons: lessons.filter((l) => !rejectedIds.has(l.pack.id)),
    live: live.filter((p) => !rejectedIds.has(p.id)),
    testOnly: testOnly.filter((p) => !rejectedIds.has(p.id)),
    rejected,
  };
}

export function assertValidLessonCatalogue(dir = DEFAULT_DIR): {
  live: LessonPack[];
  testOnly: LessonPack[];
} {
  const report = loadLessonPacks(dir);
  if (report.rejected.length > 0) {
    const detail = report.rejected
      .map((r) => `${r.file}\n${formatValidationIssues(r.issues)}`)
      .join('\n\n');
    throw new Error(`Invalid lesson packs:\n\n${detail}`);
  }
  return { live: report.live, testOnly: report.testOnly };
}
