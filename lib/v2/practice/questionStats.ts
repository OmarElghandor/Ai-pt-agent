/**
 * Per-question stats + auto-flag (16 §9.3).
 * Flag when ≥20 first tries and under 30% correct.
 */

export const AUTO_FLAG_MIN_FIRST_TRIES = 20;
export const AUTO_FLAG_MAX_CORRECT_RATIO = 0.3;

export type QuestionAnswerRow = {
  question_id: string;
  first_try: boolean;
  verdict: string;
  time_ms?: number | null;
  /** Serialized wrong answer key (option id, typed text, etc.). */
  answer_key?: string | null;
};

export type QuestionStats = {
  question_id: string;
  attempts: number;
  first_try_total: number;
  first_try_correct: number;
  avg_time_ms: number;
  wrong_answers: Record<string, number>;
  /** Most common wrong answer key, if any. */
  most_common_wrong: string | null;
  should_auto_flag: boolean;
};

export function answerKeyFromPayload(answer: unknown): string | null {
  if (answer == null) return null;
  if (typeof answer === 'string') return answer.slice(0, 120);
  if (typeof answer === 'number' || typeof answer === 'boolean') {
    return String(answer);
  }
  if (typeof answer === 'object') {
    const o = answer as Record<string, unknown>;
    if (typeof o.option_id === 'string') return o.option_id;
    if (typeof o.choice_id === 'string') return o.choice_id;
    if (typeof o.text === 'string') return o.text.slice(0, 120);
    if (typeof o.typed === 'string') return o.typed.slice(0, 120);
    if (typeof o.rating === 'string' || typeof o.rating === 'number') {
      return `rating:${o.rating}`;
    }
    if (Array.isArray(o.tiles)) return `tiles:${o.tiles.join(',')}`;
    try {
      return JSON.stringify(answer).slice(0, 120);
    } catch {
      return null;
    }
  }
  return null;
}

export function shouldAutoFlagQuestion(stats: {
  first_try_total: number;
  first_try_correct: number;
}): boolean {
  if (stats.first_try_total < AUTO_FLAG_MIN_FIRST_TRIES) return false;
  const ratio = stats.first_try_correct / stats.first_try_total;
  return ratio < AUTO_FLAG_MAX_CORRECT_RATIO;
}

/** Aggregate one question's answers into stats (pure). */
export function computeQuestionStats(
  questionId: string,
  rows: QuestionAnswerRow[],
): QuestionStats {
  let attempts = 0;
  let first_try_total = 0;
  let first_try_correct = 0;
  let timeSum = 0;
  let timeN = 0;
  const wrong_answers: Record<string, number> = {};

  for (const row of rows) {
    if (row.question_id !== questionId) continue;
    attempts += 1;
    const ms = typeof row.time_ms === 'number' && row.time_ms > 0 ? row.time_ms : 0;
    if (ms > 0) {
      timeSum += ms;
      timeN += 1;
    }
    if (row.first_try) {
      first_try_total += 1;
      if (row.verdict === 'correct') first_try_correct += 1;
    }
    if (row.verdict === 'wrong' || row.verdict === 'near_miss') {
      const key = row.answer_key?.trim() || '(empty)';
      wrong_answers[key] = (wrong_answers[key] ?? 0) + 1;
    }
  }

  let most_common_wrong: string | null = null;
  let mostN = 0;
  for (const [k, n] of Object.entries(wrong_answers)) {
    if (n > mostN) {
      mostN = n;
      most_common_wrong = k;
    }
  }

  const stats = {
    question_id: questionId,
    attempts,
    first_try_total,
    first_try_correct,
    avg_time_ms: timeN > 0 ? Math.round(timeSum / timeN) : 0,
    wrong_answers,
    most_common_wrong,
    should_auto_flag: false,
  };
  stats.should_auto_flag = shouldAutoFlagQuestion(stats);
  return stats;
}

/** Aggregate many questions at once. */
export function computeAllQuestionStats(
  rows: QuestionAnswerRow[],
): Map<string, QuestionStats> {
  const byQ = new Map<string, QuestionAnswerRow[]>();
  for (const row of rows) {
    if (!row.question_id) continue;
    const list = byQ.get(row.question_id) ?? [];
    list.push(row);
    byQ.set(row.question_id, list);
  }
  const out = new Map<string, QuestionStats>();
  for (const [qid, list] of byQ) {
    out.set(qid, computeQuestionStats(qid, list));
  }
  return out;
}

/** Global median time_ms per type from answer rows (for §2.2 defaults). */
export function globalMedianTimeByType(
  rows: Array<{ type?: string | null; time_ms?: number | null }>,
  minSamples = 30,
): Record<string, number> {
  const byType = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.type) continue;
    const ms = typeof row.time_ms === 'number' && row.time_ms > 0 ? row.time_ms : 0;
    if (ms <= 0) continue;
    const list = byType.get(row.type) ?? [];
    list.push(ms);
    byType.set(row.type, list);
  }
  const out: Record<string, number> = {};
  for (const [type, samples] of byType) {
    if (samples.length < minSamples) continue;
    const sorted = [...samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    out[type] =
      sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
        : sorted[mid]!;
  }
  return out;
}
