/**
 * Leading candidate-id tag: `[question_id]` then the reaction.
 * Stream-safe: may arrive across chunks.
 */

const TAG_START = '[';
const TAG_END = ']';

export type ConsumeConvoTagResult = {
  /** Resolved candidate id once the closing `]` arrives. */
  tag: string | null;
  /** Text after the tag (may be partial while streaming). */
  rest: string;
  /** True when the tag is fully closed (or decided absent). */
  complete: boolean;
};

/**
 * Feed the cumulative buffer from the stream start.
 * Returns whether the leading `[id]` tag is complete.
 */
export function consumeConvoTag(
  buffer: string,
  candidateIds: string[],
): ConsumeConvoTagResult {
  const trimmedStart = buffer.replace(/^\s+/, '');
  if (!trimmedStart.startsWith(TAG_START)) {
    // No tag — treat whole buffer as reaction once we have non-space,
    // or still waiting if only whitespace.
    if (trimmedStart.length === 0) {
      return { tag: null, rest: '', complete: false };
    }
    return { tag: null, rest: trimmedStart, complete: true };
  }

  const end = trimmedStart.indexOf(TAG_END);
  if (end < 0) {
    return { tag: null, rest: '', complete: false };
  }

  const raw = trimmedStart.slice(1, end).trim();
  const rest = trimmedStart.slice(end + 1).replace(/^\s+/, '');
  const known = new Set(candidateIds);
  const tag = known.has(raw) ? raw : (candidateIds[0] ?? raw);

  return { tag, rest, complete: true };
}
