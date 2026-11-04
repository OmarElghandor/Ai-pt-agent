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
      streaming?: boolean;
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
  session: {
    id: string;
    rungs: Record<string, string>;
    phase: string;
    status: string;
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
