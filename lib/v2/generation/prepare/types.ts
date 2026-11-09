/** Learner/admin-facing readiness for one language × day. */

export type LessonReadiness =
  | 'none'
  | 'generating'
  | 'draft'
  | 'needs_review'
  | 'published';

export type PackReadiness = 'none' | 'generating' | 'ready';

export type AudioReadiness = 'none' | 'warming' | 'ready';

export type DayReadiness = {
  target_lang: string;
  day: number;
  lesson: LessonReadiness;
  pack: PackReadiness;
  audio: AudioReadiness;
  /** Running prepare_day (or nested) job id, if any. */
  job_id: string | null;
  /** Egyptian copy when the day failed or needs review. */
  error_eg: string | null;
  /** True when lesson + pack are usable for a conversation start. */
  ready: boolean;
};

export type DayReadinessSnapshot = {
  target_lang: string;
  day: number;
  /** Newest lesson row, if any. */
  lesson: {
    status: 'draft' | 'reviewed' | 'published';
    meta?: {
      issues?: Array<{ rule?: string; severity?: string }>;
      lang_check?: { discarded?: unknown[] };
      flagged?: boolean;
      auto_published?: boolean;
      prepare_error_eg?: string;
    } | null;
  } | null;
  /** Newest convo pack row, if any. */
  pack: {
    status: 'draft' | 'reviewed' | 'published';
    meta?: {
      text_ready?: boolean;
      audio_ready?: boolean;
    } | null;
  } | null;
  /** Authored JSON file on disk (e.g. content/v2/convo/pt-PT.day-33.json). */
  authored_pack: boolean;
  /** Active prepare_day / lesson / convo jobs. */
  running_job: {
    id: string;
    kind: string;
  } | null;
  /** Failed prepare_day error, if the latest prepare job failed. */
  prepare_error_eg?: string | null;
};

/**
 * True when prepare finished unsuccessfully: error copy, no running job,
 * and the day is still not ready. Clients should stop polling and show retry.
 * Lives here (not readiness.ts) so client components can import it without Mongo.
 */
export function isTerminalPrepareFailure(
  readiness: Pick<DayReadiness, 'ready' | 'error_eg' | 'job_id'>,
): boolean {
  return (
    !readiness.ready &&
    Boolean(readiness.error_eg?.trim()) &&
    !readiness.job_id
  );
}
