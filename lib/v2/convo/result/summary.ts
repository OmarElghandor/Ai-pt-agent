import type { ConvoSession } from '@/lib/v2/convo/session';

export type ConvoSummaryRecast = {
  original: string;
  corrected: string;
  add_default: boolean;
};

export type ConvoSessionSummary = {
  lines: string[];
  recasts: ConvoSummaryRecast[];
  minutes: number;
  topic_id: string | null;
  pack_id: string;
  module: ConvoSession['module'];
};

/** Build the خلّص summary payload (Batch 10 D7). */
export function buildConvoSessionSummary(
  session: ConvoSession,
  now: Date = new Date(),
): ConvoSessionSummary {
  const started = Date.parse(session.created_at);
  const minutes = Number.isFinite(started)
    ? Math.max(1, Math.round((now.getTime() - started) / 60_000))
    : 1;
  const lines = (session.learner_lines ?? []).slice(-8);
  const recasts = (session.recasts ?? []).slice(0, 8).map((r, i) => ({
    original: r.original,
    corrected: r.corrected,
    add_default: i < 3,
  }));
  return {
    lines,
    recasts,
    minutes,
    topic_id: session.topic_id,
    pack_id: session.pack_id,
    module: session.module,
  };
}

export function pushLearnerLine(
  lines: string[],
  text: string,
  max = 8,
): string[] {
  const t = text.trim();
  if (!t) return lines;
  return [...lines, t].slice(-max);
}

/** Heuristic: reaction that echoes a corrected form of the learner line. */
export function maybeRecastPair(
  learner: string,
  reaction: string,
): { original: string; corrected: string } | null {
  const L = learner.trim();
  const R = reaction.trim();
  if (!L || !R) return null;
  if (L.toLowerCase() === R.toLowerCase()) return null;
  // Only treat as recast when the reaction is longer or clearly different words.
  const lWords = new Set(L.toLowerCase().match(/[\p{L}']+/gu) ?? []);
  const rWords = R.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  const novel = rWords.filter((w) => !lWords.has(w) && w.length > 2);
  if (novel.length < 1) return null;
  if (R.length < L.length * 0.5) return null;
  return { original: L, corrected: R };
}
