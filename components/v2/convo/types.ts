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
    }
  | {
      id: string;
      role: 'learner';
      tl: string;
    }
  | {
      id: string;
      role: 'coach';
      eg: string;
      moment?: string;
    }
  | {
      id: string;
      role: 'cards';
      card_ids: string[];
    };

export type TalkPendingQuestion = {
  id: string;
  tl: string;
  say?: string;
  kind: 'choice' | 'open' | 'recap' | 'help';
  item_id: string;
  option_ids?: string[];
  options?: Array<{ id: string; tl: string }>;
  map_step?: string;
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
  resumed: boolean;
  opening: {
    character: { tl: string; say?: string };
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
};
