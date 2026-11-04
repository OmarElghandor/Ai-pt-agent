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
    }
  | {
      type: 'group_advance';
      group: number;
      card_ids: string[];
      coach_intros: Array<{ item_id: string; coach_intro_eg: string }>;
    }
  | {
      type: 'help';
      help: ConvoSelectHelp;
    }
  | {
      type: 'reaction_delta';
      text: string;
    }
  /** Free chat: authored next line appended into the same character bubble. */
  | {
      type: 'authored_append';
      tl: string;
      audio_key: string;
    }
  /** Free chat: full bubble Arabic (reaction AR + authored AR). */
  | {
      type: 'bubble_ar';
      ar: string;
    }
  | {
      type: 'visual';
      /** Active map step to highlight (from the pending / next question). */
      map_step?: string;
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
      kind: NonNullable<ConvoPendingQuestion>['kind'];
      item_id: string;
      option_ids?: string[];
      /** Choice chip labels (same order as option_ids). */
      options?: Array<{ id: string; tl: string }>;
      /** Map step this open question needs (for highlight). */
      map_step?: string;
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
      cached_input_tokens: number;
      output_tokens: number;
      ttft_ms: number;
      total_ms: number;
    }
  | {
      type: 'done';
      ok: boolean;
      error?: string;
    };

export type ConvoTurnMetrics = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  ttft_ms: number;
  total_ms: number;
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
  kind: NonNullable<ConvoPendingQuestion>['kind'];
  item_id: string;
  option_ids?: string[];
  map_step?: string;
  candidate: ConvoSelectCandidate;
};
