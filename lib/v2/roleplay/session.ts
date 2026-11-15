import type { RoleplayTier } from './types';
import type { RoleplayGender } from './text';

export type RoleplaySessionStatus = 'active' | 'done';

export type RoleplayExchange = {
  role: 'character' | 'learner' | 'coach';
  tl?: string;
  ar?: string;
  eg?: string;
  step_id?: string;
};

export type RoleplaySessionState = {
  id: string;
  user_id: string;
  situation_id: string;
  tier: RoleplayTier;
  /** Current step id among playable steps; null when finished. */
  current_step_id: string | null;
  slots: Record<string, string>;
  /** Miss count per step id. */
  misses: Record<string, number>;
  /** Steps completed without miss-3 assist. */
  alone_steps: string[];
  /** Steps completed via miss-3 full sentence. */
  assisted_steps: string[];
  /** Key phrase TLs the learner said (matched against key_phrases). */
  key_phrases_said: string[];
  gender: RoleplayGender;
  learner_name: string | null;
  status: RoleplaySessionStatus;
  exchanges: RoleplayExchange[];
  /** Corrections collected this session (tl → ar). */
  corrections: Array<{ tl: string; ar?: string }>;
  /** Incremented only when optional model reaction runs. */
  model_calls: number;
  created_at: string;
  updated_at: string;
};

export function createRoleplaySessionState(opts: {
  id: string;
  user_id: string;
  situation_id: string;
  tier: RoleplayTier;
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
    tier: opts.tier,
    current_step_id: opts.first_step_id,
    slots: {},
    misses: {},
    alone_steps: [],
    assisted_steps: [],
    key_phrases_said: [],
    gender: opts.gender ?? 'm',
    learner_name: opts.learner_name ?? null,
    status: 'active',
    exchanges: [],
    corrections: [],
    model_calls: 0,
    created_at: now,
    updated_at: now,
  };
}
