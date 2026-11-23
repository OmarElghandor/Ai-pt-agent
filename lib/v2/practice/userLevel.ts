/**
 * Pure rebuild of v2_user_level from the answer log (16 §9.3).
 * Learners see counts only — percentages are for admin views.
 */

export const LEVEL_SKILLS = [
  'listening',
  'reading',
  'writing',
  'speaking',
  'grammar',
] as const;

export type LevelSkill = (typeof LEVEL_SKILLS)[number];

export type SkillWindowStats = {
  first_try_correct: number;
  attempts: number;
  avg_time_ms: number;
  by_type: Record<string, { n: number; total_ms: number }>;
};

export type PatternLevelStats = {
  stage: number;
  last_result: 'correct' | 'wrong' | 'near_miss' | 'unclear' | 'self_rated' | null;
  first_try_correct: number;
  attempts: number;
};

export type LessonLevelStats = {
  covered_pairs: number;
  total_pairs: number;
  left_window_at: string | null;
};

export type UserLevelView = {
  skills: Record<
    LevelSkill,
    {
      last_14: SkillWindowStats;
      prev_14: SkillWindowStats;
    }
  >;
  patterns: Record<string, PatternLevelStats>;
  lessons: Record<string, LessonLevelStats>;
  problem_ids: string[];
  time_by_type: Record<string, number>;
  answer_count: number;
};

export type LevelAnswerRow = {
  local_date: string;
  created_at?: Date | string | null;
  skill?: string | null;
  type?: string | null;
  first_try: boolean;
  verdict: string;
  time_ms?: number | null;
  tests?: { item_ids?: string[]; pattern_ids?: string[] } | null;
  lesson_day?: number | null;
};

export type LevelItemRow = {
  item_id: string;
  stage?: number | null;
};

export type LevelCoverageRow = {
  lesson_day: number;
  pairs: Array<{ status: string }>;
  left_window_at?: string | null;
};

export type LevelWeakRow = {
  problem: string;
};

const emptySkill = (): SkillWindowStats => ({
  first_try_correct: 0,
  attempts: 0,
  avg_time_ms: 0,
  by_type: {},
});

export function mapToLevelSkill(raw: string | null | undefined): LevelSkill | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s === 'listening') return 'listening';
  if (s === 'reading' || s === 'recognition') return 'reading';
  if (s === 'writing' || s === 'building') return 'writing';
  if (s === 'speaking' || s === 'use') return 'speaking';
  if (s === 'grammar') return 'grammar';
  return null;
}

function dateDaysAgo(isoToday: string, days: number): string {
  const d = new Date(`${isoToday}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function inRange(localDate: string, from: string, toExclusive: string): boolean {
  return localDate >= from && localDate < toExclusive;
}

function bumpSkill(
  stats: SkillWindowStats,
  row: LevelAnswerRow,
): void {
  if (!row.first_try) return;
  stats.attempts += 1;
  if (row.verdict === 'correct') stats.first_try_correct += 1;
  const ms = typeof row.time_ms === 'number' && row.time_ms > 0 ? row.time_ms : 0;
  if (ms > 0) {
    const type = row.type || 'unknown';
    const cur = stats.by_type[type] ?? { n: 0, total_ms: 0 };
    cur.n += 1;
    cur.total_ms += ms;
    stats.by_type[type] = cur;
  }
}

function finalizeSkill(stats: SkillWindowStats): SkillWindowStats {
  let n = 0;
  let total = 0;
  for (const t of Object.values(stats.by_type)) {
    n += t.n;
    total += t.total_ms;
  }
  return {
    ...stats,
    avg_time_ms: n > 0 ? Math.round(total / n) : 0,
  };
}

/**
 * Median of sorted numeric sample. Empty → 0.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

/**
 * Rebuild the level view from seeded rows (pure).
 * `today` is the user's local date YYYY-MM-DD.
 */
export function computeUserLevel(input: {
  today: string;
  answers: LevelAnswerRow[];
  items?: LevelItemRow[];
  coverage?: LevelCoverageRow[];
  weak?: LevelWeakRow[];
  /** Min answers of a type before user median feeds time estimates. */
  minTypeSamples?: number;
}): UserLevelView {
  const minType = input.minTypeSamples ?? 30;
  const last14From = dateDaysAgo(input.today, 13);
  const prev14From = dateDaysAgo(input.today, 27);
  const prev14To = last14From;

  const skills = Object.fromEntries(
    LEVEL_SKILLS.map((s) => [s, { last_14: emptySkill(), prev_14: emptySkill() }]),
  ) as UserLevelView['skills'];

  const patterns: Record<string, PatternLevelStats> = {};
  const stageById = new Map(
    (input.items ?? []).map((i) => [i.item_id, Number(i.stage ?? 1)]),
  );

  const timesByType = new Map<string, number[]>();

  for (const row of input.answers) {
    const skill = mapToLevelSkill(row.skill);
    if (skill) {
      if (row.local_date >= last14From && row.local_date <= input.today) {
        bumpSkill(skills[skill].last_14, row);
      } else if (inRange(row.local_date, prev14From, prev14To)) {
        bumpSkill(skills[skill].prev_14, row);
      }
    }

    const ms = typeof row.time_ms === 'number' && row.time_ms > 0 ? row.time_ms : 0;
    if (ms > 0 && row.type) {
      const list = timesByType.get(row.type) ?? [];
      list.push(ms);
      timesByType.set(row.type, list);
    }

    const pids = row.tests?.pattern_ids ?? [];
    for (const pid of pids) {
      const cur = patterns[pid] ?? {
        stage: stageById.get(pid) ?? 1,
        last_result: null,
        first_try_correct: 0,
        attempts: 0,
      };
      if (row.first_try) {
        cur.attempts += 1;
        if (row.verdict === 'correct') cur.first_try_correct += 1;
      }
      if (
        row.verdict === 'correct' ||
        row.verdict === 'wrong' ||
        row.verdict === 'near_miss' ||
        row.verdict === 'unclear' ||
        row.verdict === 'self_rated'
      ) {
        cur.last_result = row.verdict;
      }
      cur.stage = stageById.get(pid) ?? cur.stage;
      patterns[pid] = cur;
    }
  }

  for (const s of LEVEL_SKILLS) {
    skills[s].last_14 = finalizeSkill(skills[s].last_14);
    skills[s].prev_14 = finalizeSkill(skills[s].prev_14);
  }

  const lessons: Record<string, LessonLevelStats> = {};
  for (const c of input.coverage ?? []) {
    const total = c.pairs.length;
    const covered = c.pairs.filter((p) => p.status === 'covered').length;
    lessons[String(c.lesson_day)] = {
      covered_pairs: covered,
      total_pairs: total,
      left_window_at: c.left_window_at ?? null,
    };
  }

  const time_by_type: Record<string, number> = {};
  for (const [type, samples] of timesByType) {
    if (samples.length >= minType) {
      time_by_type[type] = median(samples);
    }
  }

  return {
    skills,
    patterns,
    lessons,
    problem_ids: [...new Set((input.weak ?? []).map((w) => w.problem))],
    time_by_type,
    answer_count: input.answers.length,
  };
}

/** Weakest skill by first-try correct ratio over last 14 days (needs ≥40 answers). */
export function weakestSkill(
  level: UserLevelView,
  minAnswers = 40,
): LevelSkill | null {
  if (level.answer_count < minAnswers) return null;
  let worst: LevelSkill | null = null;
  let worstRatio = 2;
  for (const s of LEVEL_SKILLS) {
    const a = level.skills[s].last_14.attempts;
    if (a < 5) continue;
    const ratio = level.skills[s].last_14.first_try_correct / a;
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worst = s;
    }
  }
  return worst;
}

/** Admin-facing percent (learners never get this). */
export function skillPercentAdmin(stats: SkillWindowStats): number | null {
  if (stats.attempts <= 0) return null;
  return Math.round((100 * stats.first_try_correct) / stats.attempts);
}

/** Learner-facing count line — never a percentage. */
export function skillCountsLineEg(
  skillAr: string,
  stats: SkillWindowStats,
): string {
  return `${skillAr}: ${stats.first_try_correct} صح من ${stats.attempts} في آخر أسبوعين`;
}
