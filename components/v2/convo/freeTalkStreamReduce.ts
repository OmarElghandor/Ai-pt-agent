import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn';
import type { TalkBubble } from './types';

export type FreeTalkStreamState = {
  bubbles: TalkBubble[];
  streamBubbleId: string | null;
  correctionIndex: number;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Pure reducer for free-talk stream events that mutate the bubble list.
 * Keeps character replies after empty reaction_reset + finalize (tip vanish fix).
 */
export function reduceFreeTalkStream(
  state: FreeTalkStreamState,
  event: ConvoTurnStreamEvent,
  opts?: { newId?: (prefix: string) => string },
): FreeTalkStreamState {
  const mk = opts?.newId ?? newId;
  let { bubbles, streamBubbleId, correctionIndex } = state;

  if (event.type === 'reaction_reset') {
    const sid = streamBubbleId;
    if (!event.text) {
      if (!sid) return state;
      // Drop in-flight empty character shells (v4 V1: no empty pt → no bubble).
      // Finalized history with real text is left alone.
      bubbles = bubbles.filter((b) => {
        if (b.id !== sid || b.role !== 'character') return true;
        if (b.final && b.tl.trim()) return true;
        return false;
      });
      return { bubbles, streamBubbleId: null, correctionIndex };
    }
    if (sid) {
      bubbles = bubbles.map((b) =>
        b.id === sid && b.role === 'character'
          ? {
              ...b,
              tl: event.text,
              streaming: true,
              final: false,
              say: undefined,
              ttsEpoch: (b.ttsEpoch ?? 0) + 1,
            }
          : b,
      );
      return { bubbles, streamBubbleId: sid, correctionIndex };
    }
    const nid = mk('char');
    return {
      bubbles: [
        ...bubbles,
        {
          id: nid,
          role: 'character',
          tl: event.text,
          streaming: true,
          ttsEpoch: 1,
        },
      ],
      streamBubbleId: nid,
      correctionIndex,
    };
  }

  if (event.type === 'reaction_delta') {
    if (!streamBubbleId) {
      const nid = mk('char');
      return {
        bubbles: [
          ...bubbles,
          { id: nid, role: 'character', tl: event.text, streaming: true },
        ],
        streamBubbleId: nid,
        correctionIndex,
      };
    }
    const id = streamBubbleId;
    return {
      bubbles: bubbles.map((b) =>
        b.id === id && b.role === 'character'
          ? { ...b, tl: b.tl + event.text, streaming: true }
          : b,
      ),
      streamBubbleId: id,
      correctionIndex,
    };
  }

  if (event.type === 'authored_append') {
    if (streamBubbleId) {
      const sid = streamBubbleId;
      return {
        bubbles: bubbles.map((b) =>
          b.id === sid && b.role === 'character'
            ? {
                ...b,
                tl: `${b.tl}${b.tl.trim() ? ' ' : ''}${event.tl}`.trim(),
                streaming: true,
                ...(event.say ? { say: event.say } : {}),
              }
            : b,
        ),
        streamBubbleId: sid,
        correctionIndex,
      };
    }
    const nid = mk('char');
    return {
      bubbles: [
        ...bubbles,
        {
          id: nid,
          role: 'character',
          tl: event.tl,
          streaming: true,
          ...(event.say ? { say: event.say } : {}),
        },
      ],
      streamBubbleId: nid,
      correctionIndex,
    };
  }

  if (event.type === 'bubble_ar') {
    const sid = streamBubbleId;
    if (sid) {
      if (!event.pt?.trim()) {
        // AR-only with no PT: drop empty shells; keep bubbles that already have text.
        const next: TalkBubble[] = [];
        for (const b of bubbles) {
          if (b.id !== sid || b.role !== 'character') {
            next.push(b);
            continue;
          }
          if (!b.tl.trim()) continue;
          next.push({
            ...b,
            ar: event.ar,
            streaming: false,
            final: true,
            ...(event.say ? { say: event.say } : {}),
          });
        }
        return { bubbles: next, streamBubbleId: null, correctionIndex };
      }
      bubbles = bubbles.map((b) =>
        b.id === sid && b.role === 'character'
          ? {
              ...b,
              tl: event.pt,
              final: true,
              ar: event.ar,
              streaming: false,
              ...(event.say ? { say: event.say } : {}),
            }
          : b,
      );
      return {
        bubbles,
        streamBubbleId: null,
        correctionIndex,
      };
    }
    if (event.pt?.trim()) {
      const nid = mk('char');
      return {
        bubbles: [
          ...bubbles,
          {
            id: nid,
            role: 'character',
            tl: event.pt,
            ar: event.ar,
            streaming: false,
            final: true,
            ...(event.say ? { say: event.say } : {}),
          },
        ],
        streamBubbleId: null,
        correctionIndex,
      };
    }
    return state;
  }

  if (event.type === 'question') {
    const sid = streamBubbleId;
    if (sid && event.tl) {
      bubbles = bubbles.map((b) =>
        b.id === sid && b.role === 'character'
          ? {
              ...b,
              tl:
                b.final ||
                (b.tl.length > event.tl.length && b.tl.includes(event.tl))
                  ? b.tl
                  : event.tl,
              streaming: false,
              final: true,
              ...(event.say ? { say: event.say } : {}),
            }
          : b,
      );
      return { bubbles, streamBubbleId: null, correctionIndex };
    }
    if (sid) {
      // Finalize in-flight bubble; drop it if still empty (no pt).
      const next: TalkBubble[] = [];
      for (const b of bubbles) {
        if (b.id !== sid || b.role !== 'character') {
          next.push(b);
          continue;
        }
        if (!b.tl.trim()) continue;
        next.push({
          ...b,
          streaming: false,
          final: true,
          ...(event.say ? { say: event.say } : {}),
        });
      }
      return { bubbles: next, streamBubbleId: null, correctionIndex };
    }
    if (event.tl?.trim()) {
      // After bubble_ar(pt) the stream id is cleared; question often repeats
      // the same tl — reuse the last finalized character bubble.
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        if (!b || b.role !== 'character') continue;
        if (b.final && b.tl === event.tl) {
          if (!event.say && !event.ar) {
            return { bubbles, streamBubbleId: null, correctionIndex };
          }
          return {
            bubbles: bubbles.map((row, idx) =>
              idx === i && row.role === 'character'
                ? {
                    ...row,
                    ...(event.say ? { say: event.say } : {}),
                    ...(event.ar ? { ar: event.ar } : {}),
                  }
                : row,
            ),
            streamBubbleId: null,
            correctionIndex,
          };
        }
        break;
      }
      const nid = mk('char');
      return {
        bubbles: [
          ...bubbles,
          {
            id: nid,
            role: 'character',
            tl: event.tl,
            streaming: false,
            final: true,
            ...(event.say ? { say: event.say } : {}),
            ...(event.ar ? { ar: event.ar } : {}),
          },
        ],
        streamBubbleId: null,
        correctionIndex,
      };
    }
    return state;
  }

  if (event.type === 'correction') {
    if (event.severity !== 'accent' && event.severity !== 'error') {
      return state;
    }
    const index = correctionIndex;
    return {
      bubbles: bubbles.map((b) =>
        b.id === event.learner_turn_id && b.role === 'learner'
          ? {
              ...b,
              correction: {
                severity: event.severity,
                corrected_tl: event.corrected_tl,
                changes: event.changes,
                note_eg: event.note_eg,
                ar: event.ar,
                original: event.original,
                index,
              },
            }
          : b,
      ),
      streamBubbleId,
      correctionIndex: index + 1,
    };
  }

  return state;
}
