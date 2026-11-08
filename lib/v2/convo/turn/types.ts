import type { CoachMoment } from '@/lib/v2/convo/ladder';
import type { ConvoSelectCandidate, ConvoSelectHelp } from '@/lib/v2/convo/select';
import type {
  ConvoPendingQuestion,
  ConvoSession,
} from '@/lib/v2/convo/session';

/** NDJSON stream events for one turn (09 §4.2 / §10). */
export type ConvoTurnStreamEvent =
  | {
      type: 'coach';
      id: string;
      eg: string;
      moment: CoachMoment | string;
      /** Structured EG/TL segments (K6); preferred over parsing eg. */
      segments?: Array<{ type: 'eg' | 'tl'; text: string }>;
    }
  | {
      type: 'group_advance';
      group: number;
      intro_eg?: string;
      card_ids: string[];
      coach_intros: Array<{ item_id: string; coach_intro_eg: string }>;
    }
  | {
      type: 'help';
      help: ConvoSelectHelp;
    }
  /** Free chat: current ask/follow-up answer frame for ساعدني أرد. */
  | {
      type: 'free_frame';
      tl: string;
      eg: string;
      chips: string[];
    }
  /** v4: router locked a topic — client updates header/chip titles. */
  | {
      type: 'topic_lock';
      topic_id: string;
      title_tl: string;
      title_ar: string;
      teaching_mode: boolean;
    }
  | {
      type: 'reaction_delta';
      text: string;
    }
  /** Replace (or clear) the streaming reaction bubble (G1/G2). */
  | {
      type: 'reaction_reset';
      text: string;
    }
  /** Free chat: authored next line appended into the same character bubble. */
  | {
      type: 'authored_append';
      tl: string;
      audio_key: string;
      say?: string;
    }
  /** Free chat: full bubble Arabic (reaction AR + authored AR). */
  | {
      type: 'bubble_ar';
      ar: string;
      /** Pronunciation for the full character bubble (E8). */
      say?: string;
      /** Authoritative PT — replaces streamed preview (G3). */
      pt?: string;
    }
  | {
      type: 'visual';
      /** Active map step to highlight (from the pending / next question). */
      map_step?: string;
      /** Map node to pulse for the current question. */
      map_node?: string;
      /** Brief wrong-way animation after a listed direction mistake. */
      wrong_way?: { from: string; toward: string };
      /** Side-channel: highlight a pack item card (T3.2). */
      highlight_item_id?: string;
      /** Side-channel: highlight a map node by id (T3.2). */
      highlight_node_id?: string;
    }
  | {
      type: 'question';
      id: string;
      tl: string;
      say?: string;
      /** Simple MSA translation of the question line. */
      ar?: string;
      kind: NonNullable<ConvoPendingQuestion>['kind'];
      item_id: string;
      option_ids?: string[];
      /** Choice chip labels (same order as option_ids). */
      options?: Array<{ id: string; tl: string }>;
      /** Map step this open question needs (for highlight). */
      map_step?: string;
      /** Map node this question highlights. */
      map_node?: string;
      audio_key: string;
      /** Client should play TTS slower (survival Mais devagar). */
      playback?: 'normal' | 'slow';
      unknown_words?: string[];
    }
  | {
      type: 'session';
      session: Pick<
        ConvoSession,
        | 'id'
        | 'rungs'
        | 'phase'
        | 'status'
        | 'help_ladder'
        | 'current_group'
        | 'pending_question'
        | 'correct_streak'
        | 'struggled'
        | 'said_once'
        | 'survival_used'
      >;
    }
  | {
      type: 'metrics';
      input_tokens: number;
      /** Provider cache hits only; null → UI shows n/a (Batch 9 C10 / F9). */
      cached_input_tokens: number | null;
      output_tokens: number;
      ttft_ms: number;
      total_ms: number;
      /** Open-mode fallback bank used this turn (E7). */
      open_used_fallback?: boolean;
      /** Session open-turn counts for fallback rate. */
      open_turns?: number;
      open_fallbacks?: number;
      /** Why a model output was regenerated/dropped (M2). */
      regenerate_reason?: string;
    }
  | {
      type: 'correction';
      learner_turn_id: string;
      severity: 'none' | 'accent' | 'error';
      corrected_tl: string;
      changes: Array<{ from: string; to: string }>;
      main_error: {
        from: string;
        to: string;
        type: string;
      } | null;
      note_eg: string;
      ar: string;
      original: string;
    }
  | {
      type: 'done';
      ok: boolean;
      error?: string;
    };

export type ConvoTurnMetrics = {
  input_tokens: number;
  cached_input_tokens: number | null;
  output_tokens: number;
  ttft_ms: number;
  total_ms: number;
  open_used_fallback?: boolean;
  open_turns?: number;
  open_fallbacks?: number;
  regenerate_reason?: string;
};

export type ConvoStreamModelResult = {
  /** Full model text (tag + reaction). */
  text: string;
  /** Approximate usage for metrics. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  };
  /** Time from call start to first chunk (ms). */
  ttftMs: number;
};

export type ConvoStreamModel = {
  complete(input: {
    system: string;
    prompt: string;
    maxTokens?: number;
    /** Extra instruction for one regeneration (09 §5.4). */
    regenerateReason?: string;
  }): Promise<ConvoStreamModelResult>;
  /**
   * Optional true streaming: yield text deltas as they arrive.
   * If omitted, `runConvoTurn` falls back to `complete` and emits one delta.
   */
  stream?(input: {
    system: string;
    prompt: string;
    maxTokens?: number;
    regenerateReason?: string;
    onChunk?: (chunk: string) => void;
  }): Promise<ConvoStreamModelResult>;
};

export type ResolvedConvoQuestion = {
  id: string;
  tl: string;
  say?: string;
  ar?: string;
  kind: NonNullable<ConvoPendingQuestion>['kind'];
  item_id: string;
  option_ids?: string[];
  map_step?: string;
  map_node?: string;
  candidate: ConvoSelectCandidate;
};
