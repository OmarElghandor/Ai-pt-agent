import type { TalkBubble } from '@/components/v2/convo/types';
import type { RoleplayTurnEvent } from '@/lib/v2/roleplay/events';

export type RoleplayResultState = {
  alone: number;
  assisted: number;
  key_phrases: string[];
  corrections: Array<{ tl: string; ar?: string }>;
  summary_eg: string;
};

export type RoleplayDoState = {
  eg: string;
  hint_eg?: string;
  step_id?: string;
};

export type RoleplayUiState = {
  bubbles: TalkBubble[];
  progress: { current: number; total: number; step_id: string | null };
  help: { frame_tl: string; eg: string; chips: string[] } | null;
  result: RoleplayResultState | null;
  finished: boolean;
  do_eg: RoleplayDoState | null;
  partnerName: string | null;
  partnerVoice: string | null;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyRoleplayUiState(): RoleplayUiState {
  return {
    bubbles: [],
    progress: { current: 0, total: 0, step_id: null },
    help: null,
    result: null,
    finished: false,
    do_eg: null,
    partnerName: null,
    partnerVoice: null,
  };
}

/** Apply one role-play turn event onto UI state (pure). */
export function reduceRoleplayEvent(
  state: RoleplayUiState,
  event: RoleplayTurnEvent,
): RoleplayUiState {
  switch (event.type) {
    case 'character': {
      const bubble: TalkBubble = {
        id: newId('char'),
        role: 'character',
        tl: event.tl,
        say: event.tl,
        ar: event.ar,
        meaningHidden: event.ar_hidden !== false,
        final: true,
        partnerName: event.name,
        ...(event.voice ? { voice: event.voice } : {}),
      };
      return {
        ...state,
        bubbles: [...state.bubbles, bubble],
        help: null,
        partnerName: event.name || state.partnerName,
        partnerVoice: event.voice ?? state.partnerVoice,
      };
    }
    case 'do': {
      return {
        ...state,
        do_eg: {
          eg: event.eg,
          ...(event.hint_eg ? { hint_eg: event.hint_eg } : {}),
          ...(event.step_id ? { step_id: event.step_id } : {}),
        },
      };
    }
    case 'coach': {
      return {
        ...state,
        bubbles: [
          ...state.bubbles,
          {
            id: newId('coach'),
            role: 'coach',
            eg: event.eg,
            moment: event.moment,
          },
        ],
        help:
          event.chips && event.chips.length
            ? {
                frame_tl: event.frame_tl ?? event.chips[0]!,
                eg: event.eg,
                chips: event.chips,
              }
            : state.help,
      };
    }
    case 'help': {
      return {
        ...state,
        help: {
          frame_tl: event.frame_tl,
          eg: event.eg,
          chips: event.chips,
        },
      };
    }
    case 'progress': {
      return {
        ...state,
        progress: {
          current: event.current,
          total: event.total,
          step_id: event.step_id,
        },
      };
    }
    case 'correction': {
      const bubbles = [...state.bubbles];
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        if (b.role === 'learner') {
          bubbles[i] = {
            ...b,
            correction: {
              severity: 'error',
              corrected_tl: event.tl,
              changes: [],
              note_eg: '',
              ar: event.ar ?? '',
              original: event.original ?? b.tl,
              index: 0,
            },
          };
          break;
        }
      }
      return { ...state, bubbles };
    }
    case 'result': {
      return {
        ...state,
        result: {
          alone: event.alone,
          assisted: event.assisted,
          key_phrases: event.key_phrases,
          corrections: event.corrections,
          summary_eg: event.summary_eg,
        },
        do_eg: null,
      };
    }
    case 'done': {
      return { ...state, finished: event.finished };
    }
    case 'session':
    default:
      return state;
  }
}

export function applyRoleplayEvents(
  state: RoleplayUiState,
  events: RoleplayTurnEvent[],
): RoleplayUiState {
  let next = state;
  for (const e of events) next = reduceRoleplayEvent(next, e);
  return next;
}
