import type {
  ConvoItemSurface,
  ConvoVisual,
} from '@/lib/v2/convo/pack';

export type TalkBubble =
  | {
      id: string;
      role: 'character';
      tl: string;
      say?: string;
      /** Arabic meaning for معناها؟ */
      ar?: string;
      streaming?: boolean;
      /** Bumps on reaction_reset to stop in-flight TTS (G2). */
      ttsEpoch?: number;
      /** True once authoritative final PT was applied (G3). */
      final?: boolean;
      meaningHidden?: boolean;
      /** Teach meaning — inset coach strip inside the bubble. */
      coachEg?: string;
      /** Goal id for v4 teach+ask beat. */
      teachGoalId?: string;
      /** Pacing: coach strip visible (client). Default true when no delay. */
      coachRevealed?: boolean;
      /** Pacing: bubble is a typing placeholder. */
      typing?: boolean;
    }
  | {
      id: string;
      role: 'learner';
      tl: string;
      /** Turn failed — keep the bubble and offer resend. */
      failed?: boolean;
      correction?: {
        severity: 'accent' | 'error';
        corrected_tl: string;
        changes: Array<{ from: string; to: string }>;
        note_eg: string;
        ar: string;
        original: string;
        index: number;
      };
    }
  | {
      id: string;
      role: 'coach';
      eg: string;
      moment?: string;
      segments?: Array<{ type: 'eg' | 'tl'; text: string }>;
    }
  | {
      id: string;
      role: 'cards';
      card_ids: string[];
    }
  | {
      id: string;
      role: 'group_coach';
      intro_eg?: string;
      card_ids: string[];
      coach_intros: Array<{ item_id: string; coach_intro_eg: string }>;
    };

export type TalkPendingQuestion = {
  id: string;
  tl: string;
  say?: string;
  ar?: string;
  kind: 'choice' | 'open' | 'recap' | 'help';
  item_id: string;
  option_ids?: string[];
  options?: Array<{ id: string; tl: string }>;
  map_step?: string;
  map_node?: string;
  audio_key: string;
};

export type TalkSessionSnapshot = {
  id: string;
  rungs: Record<string, string>;
  phase: string;
  status: string;
  help_ladder: {
    question_id: string | null;
    step: number;
    attempts: number;
  };
  current_group: number;
  pending_question: {
    id: string;
    kind: string;
    item_id: string;
  } | null;
  correct_streak: number;
  struggled?: Record<string, boolean>;
  said_once?: Record<string, boolean>;
  survival_used?: number;
};

export type TalkStartResponse = {
  session_id: string;
  pack_id: string;
  day: number;
  title_tl?: string;
  title_ar?: string;
  group_count?: number;
  resumed: boolean;
  opening: {
    character: { tl: string; ar?: string; say?: string };
    intro_eg?: string;
    coach_intros: Array<{ item_id: string; coach_intro_eg: string }>;
    card_ids: string[];
  };
  /** Present when resuming mid-conversation (T4.1). */
  reopening?: {
    character_tl: string;
    pending_question: TalkSessionSnapshot['pending_question'];
    pending_tl: string | null;
    pending_audio_key: string | null;
    coach?: { id: string; eg: string };
  };
  session: {
    id: string;
    rungs: Record<string, string>;
    phase: string;
    status: string;
    help_ladder?: TalkSessionSnapshot['help_ladder'];
    current_group: number;
    pending_question: TalkSessionSnapshot['pending_question'];
    struggled?: Record<string, boolean>;
    said_once?: Record<string, boolean>;
    survival_used?: number;
  };
  visual: ConvoVisual;
  character_id: string;
  item_surfaces: ConvoItemSurface[];
  bridge_tl?: string;
  free_topic_id?: string | null;
};
