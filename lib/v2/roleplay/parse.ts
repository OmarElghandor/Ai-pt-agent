/**
 * Parse role-play actor output: PT turn + AR: + hidden BEAT: line.
 */

export type RoleplayBeatMark =
  | { kind: 'open' }
  | { kind: 'done'; option: string | null };

export type ParsedRoleplayActor = {
  tl: string;
  ar: string;
  beat: RoleplayBeatMark;
  raw: string;
};

const BEAT_RE = /\n?\s*BEAT\s*:\s*(.+)\s*$/i;
const AR_BEAT_SPLIT = /^([\s\S]*?)\n\s*AR\s*:\s*([\s\S]*?)$/im;

/** Strip BEAT: then split PT / AR:. */
export function parseRoleplayActorOutput(raw: string): ParsedRoleplayActor {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  let beat: RoleplayBeatMark = { kind: 'open' };
  let body = normalized;

  const beatMatch = body.match(BEAT_RE);
  if (beatMatch) {
    body = body.slice(0, beatMatch.index ?? body.length).trimEnd();
    beat = parseBeatMark(beatMatch[1] ?? '');
  } else {
    // Inline trailing BEAT: on same block
    const inline = body.match(/\bBEAT\s*:\s*(done(?:\s+\S+)?|open)\s*$/i);
    if (inline && inline.index != null) {
      body = body.slice(0, inline.index).trimEnd();
      beat = parseBeatMark(inline[1] ?? '');
    }
  }

  const arSplit = body.match(AR_BEAT_SPLIT);
  if (arSplit) {
    return {
      tl: (arSplit[1] ?? '').trim(),
      ar: stripTrailingBeat((arSplit[2] ?? '').trim()),
      beat,
      raw: normalized,
    };
  }

  // AR: on same line as PT
  const anywhere = body.match(/^([\s\S]*?)\s*AR\s*:\s*([\s\S]+)$/i);
  if (anywhere) {
    return {
      tl: (anywhere[1] ?? '').trim(),
      ar: stripTrailingBeat((anywhere[2] ?? '').trim()),
      beat,
      raw: normalized,
    };
  }

  return {
    tl: body.trim(),
    ar: '',
    beat,
    raw: normalized,
  };
}

function stripTrailingBeat(ar: string): string {
  return ar.replace(/\n?\s*BEAT\s*:[\s\S]*$/i, '').trim();
}

function parseBeatMark(rest: string): RoleplayBeatMark {
  const t = rest.trim();
  if (!t || /^open\b/i.test(t)) return { kind: 'open' };
  const done = t.match(/^done(?:\s+(.+))?$/i);
  if (done) {
    const option = done[1]?.trim() || null;
    return { kind: 'done', option: option && option.length ? option : null };
  }
  return { kind: 'open' };
}

/** Count sentence-like chunks (., !, ?, …). */
export function countSentences(text: string): number {
  const parts = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return text.trim() ? 1 : 0;
  return parts.length;
}
