import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ProblemsFileSchema,
  type Problem,
  type ProblemsFile,
} from '@/lib/v2/progress/problems/schema';
import { loadPlan } from '@/lib/v2/generation/lesson/plan';

const cache = new Map<string, ProblemsFile>();

function problemsPath(lang: string): string {
  return path.join(process.cwd(), 'content/v2', `problems.${lang}.json`);
}

export function loadProblemsFile(lang = 'pt-PT'): ProblemsFile {
  const hit = cache.get(lang);
  if (hit) return hit;
  const raw = JSON.parse(readFileSync(problemsPath(lang), 'utf8'));
  const parsed = ProblemsFileSchema.parse(raw);
  cache.set(lang, parsed);
  return parsed;
}

/** Test helper / hot reload. */
export function clearProblemsCache(): void {
  cache.clear();
}

export function listProblems(lang = 'pt-PT'): Problem[] {
  return loadProblemsFile(lang).problems;
}

export function getProblem(
  id: string,
  lang = 'pt-PT',
): Problem | undefined {
  return listProblems(lang).find((p) => p.id === id);
}

/** Problems the learner may be assigned at their current day. */
export function problemsAvailableAtDay(
  day: number,
  lang = 'pt-PT',
): Problem[] {
  return listProblems(lang).filter((p) => p.available_from <= day);
}

export type ProblemsValidationIssue = {
  path: string;
  message: string;
};

/**
 * Structural + referential checks (unique ids, taught_on days, pattern ids).
 * Pattern ids are checked against core-items when present.
 */
export function validateProblemsFile(
  file: ProblemsFile,
  opts?: {
    knownPatternIds?: Set<string>;
    knownDays?: Set<number>;
  },
): ProblemsValidationIssue[] {
  const issues: ProblemsValidationIssue[] = [];
  const seen = new Set<string>();

  let knownDays = opts?.knownDays;
  if (!knownDays) {
    try {
      knownDays = new Set(loadPlan().days.map((d) => d.day));
    } catch {
      knownDays = new Set();
    }
  }

  let knownPatterns = opts?.knownPatternIds;
  if (!knownPatterns) {
    knownPatterns = loadCorePatternIds(file.target_lang);
  }

  for (let i = 0; i < file.problems.length; i++) {
    const p = file.problems[i]!;
    const base = `problems[${i}]`;
    if (seen.has(p.id)) {
      issues.push({ path: `${base}.id`, message: `duplicate id ${p.id}` });
    }
    seen.add(p.id);
    const topFromId = p.id.split('.')[0];
    if (topFromId !== p.top) {
      issues.push({
        path: `${base}.top`,
        message: `top ${p.top} does not match id prefix ${topFromId}`,
      });
    }
    for (const day of p.taught_on.days) {
      if (knownDays.size && !knownDays.has(day)) {
        issues.push({
          path: `${base}.taught_on.days`,
          message: `unknown day ${day}`,
        });
      }
    }
    if (knownDays.size && !knownDays.has(p.available_from)) {
      // available_from may be any positive day in plan; warn only if plan loaded
      // and day missing — skip if beyond plan end.
      const maxDay = Math.max(...knownDays);
      if (p.available_from > maxDay) {
        issues.push({
          path: `${base}.available_from`,
          message: `available_from ${p.available_from} past plan`,
        });
      }
    }
    for (const pat of p.patterns) {
      if (knownPatterns.size && !knownPatterns.has(pat)) {
        issues.push({
          path: `${base}.patterns`,
          message: `unknown pattern ${pat}`,
        });
      }
    }
  }
  return issues;
}

function loadCorePatternIds(lang: string): Set<string> {
  try {
    const file = path.join(
      process.cwd(),
      'content/v2/plan',
      `${lang}.core-items.json`,
    );
    const raw = JSON.parse(readFileSync(file, 'utf8')) as {
      days?: Array<{ items?: Array<{ id?: string; kind?: string }> }>;
    };
    const ids = new Set<string>();
    for (const day of raw.days ?? []) {
      for (const item of day.items ?? []) {
        if (item.id?.startsWith('pattern.')) ids.add(item.id);
      }
    }
    // Also collect introduces lists that may only list pattern ids.
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/"pattern\.[a-z0-9_]+"/g)) {
      ids.add(m[0]!.slice(1, -1));
    }
    return ids;
  } catch {
    return new Set();
  }
}
