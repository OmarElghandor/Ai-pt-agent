import type { RoleplaySessionState } from './session';

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
      /** Always true: Arabic is behind a tap. */
      ar_hidden?: boolean;
      /** Optional step hint (EG); normally sent as a `coach` event instead. */
      hint_eg?: string;
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
        | 'current_step_id'
        | 'slots'
        | 'status'
        | 'alone_steps'
        | 'assisted_steps'
        | 'pending_assist'
        | 'key_phrases_said'
        | 'model_calls'
      >;
    }
  | {
      type: 'result';
      alone: number;
      assisted: number;
      key_phrases: string[];
      corrections: Array<{ tl: string; ar?: string }>;
      summary_eg: string;
    }
  | {
      type: 'done';
      finished: boolean;
    };
