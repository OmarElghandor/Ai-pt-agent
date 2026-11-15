import type { RoleplayGender } from './text';

export type RoleplaySessionStatus = 'active' | 'done';

export type RoleplayExchange = {
  role: 'character' | 'learner' | 'coach';
  tl?: string;
  ar?: string;
  eg?: string;
  step_id?: string;
  /** Character exchanges only: what kind of line it was. */
  kind?: 'says' | 'reply' | 'closing' | 'confusion';
  /** Character exchanges only: audio key so a resume can replay the line. */
  audio_key?: string;
  speaker?: string;
};

export type RoleplaySessionState = {
  id: string;
  user_id: string;
  situation_id: string;
  /** Current step id among playable steps; null when finished. */
  current_step_id: string | null;
  slots: Record<string, string>;
  /** Miss count per step id (off-script turns + ساعدني presses). */
  misses: Record<string, number>;
  /** Steps completed without the miss-2 full-sentence assist. */
  alone_steps: string[];
  /** Steps completed via the miss-2 full sentence. */
  assisted_steps: string[];
  /**
   * Full sentence offered at miss 2 for the current step. The learner must
   * send it; the step then completes as assisted and this is cleared.
   */
  pending_assist: string | null;
  /** Key phrase TLs the learner said (matched against key_phrases). */
  key_phrases_said: string[];
  gender: RoleplayGender;
  learner_name: string | null;
  status: RoleplaySessionStatus;
  /** All beats done; conversation stays open until goodbye / خلّص. */
  task_done: boolean;
  /** Consecutive in-scene side-talk turns (max 2 without counting as misses). */
  side_talk_streak: number;
  exchanges: RoleplayExchange[];
  /** Corrections collected this session (tl → ar). */
  corrections: Array<{ tl: string; ar?: string }>;
  /** Incremented when the character actor runs. */
  model_calls: number;
  created_at: string;
  updated_at: string;
};

export function createRoleplaySessionState(opts: {
  id: string;
  user_id: string;
  situation_id: string;
  first_step_id: string;
  gender?: RoleplayGender;
  learner_name?: string | null;
  now?: Date;
}): RoleplaySessionState {
  const now = (opts.now ?? new Date()).toISOString();
  return {
    id: opts.id,
    user_id: opts.user_id,
    situation_id: opts.situation_id,
    current_step_id: opts.first_step_id,
    slots: {},
    misses: {},
    alone_steps: [],
    assisted_steps: [],
    pending_assist: null,
    key_phrases_said: [],
    gender: opts.gender ?? 'm',
    learner_name: opts.learner_name ?? null,
    status: 'active',
    task_done: false,
    side_talk_streak: 0,
    exchanges: [],
    corrections: [],
    model_calls: 0,
    created_at: now,
    updated_at: now,
  };
}
