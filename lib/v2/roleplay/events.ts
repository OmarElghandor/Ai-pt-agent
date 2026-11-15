import type { RoleplaySessionState } from './session';
import type { RoleplayTier } from './types';

/** NDJSON events for a role-play turn. */
export type RoleplayTurnEvent =
  | {
      type: 'coach';
      eg: string;
      moment?: string;
      chips?: string[];
      frame_tl?: string;
    }
  | {
      type: 'character';
      tl: string;
      ar: string;
      step_id?: string;
      /** When true, Arabic is behind a tap (tier 2+) or costs the star (tier 3). */
      ar_hidden?: boolean;
      coach_eg?: string;
      audio_key?: string;
      playback?: 'normal' | 'slow';
      speaker?: string;
    }
  | {
      type: 'help';
      frame_tl: string;
      eg: string;
      chips: string[];
      miss: number;
    }
  | {
      type: 'progress';
      current: number;
      total: number;
      step_id: string | null;
    }
  | {
      type: 'correction';
      learner_turn_id?: string;
      tl: string;
      ar?: string;
      original?: string;
    }
  | {
      type: 'session';
      session: Pick<
        RoleplaySessionState,
        | 'id'
        | 'situation_id'
        | 'tier'
        | 'current_step_id'
        | 'slots'
        | 'status'
        | 'alone_steps'
        | 'assisted_steps'
        | 'key_phrases_said'
        | 'model_calls'
      >;
    }
  | {
      type: 'result';
      tier: RoleplayTier;
      star: number;
      alone: number;
      assisted: number;
      key_phrases: string[];
      corrections: Array<{ tl: string; ar?: string }>;
      summary_eg: string;
      next_tier: RoleplayTier | null;
    }
  | {
      type: 'done';
      finished: boolean;
    };
