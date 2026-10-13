import type { AuthoredSegment } from './lessons/types';
import type { TypedMessage } from './progressTypes';
import { scrubTagDebris, stripThinkBlocks } from './parseTaggedMessage';

function wordTokens(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** "SimSim": the same word written twice with no space. */
function isDoubledWord(token: string): boolean {
  if (token.length < 4 || token.length % 2 !== 0) return false;
  const half = token.length / 2;
  return token.slice(0, half) === token.slice(half);
}

/**
 * Coach Portuguese that is the learner's words glued onto the target
 * ("Muitomuto") or the same word doubled ("SimSim").
 */
export function isJunkCoachPortuguese(pt: string, learnerText: string): boolean {
  const tokens = wordTokens(pt);
  if (tokens.some(isDoubledWord)) return true;
  const learnerWords = wordTokens(learnerText).filter((word) => word.length >= 3);
  return tokens.some((token) =>
    learnerWords.some((word) => word !== token && token.includes(word)),
  );
}

/** Drop a coach bubble whose Portuguese is glued or doubled. A clean sentence stays. */
export function dropJunkCoach(messages: TypedMessage[], learnerText: string): TypedMessage[] {
  return messages.filter((message) => {
    if (message.type !== 'coach') return true;
    const pt = message.segments
      .filter((segment) => segment.lang === 'pt')
      .map((segment) => segment.text)
      .join(' ')
      .trim();
    return !pt || !isJunkCoachPortuguese(pt, learnerText);
  });
}

/**
 * Parse Friend / Prompt 4/5 model output into typed messages.
 * Blocks: optional character / coach / help / correction / praise, then optional chat.
 */
export function parseFriendOutput(raw: string): TypedMessage[] {
  const cleaned = scrubTagDebris(stripThinkBlocks(raw)).trim();
  const text = stripThinkBlocks(raw).trim();
  const messages: TypedMessage[] = [];

  const character = extractTagged(text, 'character');
  const coach = extractTagged(text, 'coach');
  const help = extractBlock(text, 'help');
  const praise = extractBlock(text, 'praise');
  const correction = extractBlock(text, 'correction');
  const chat = extractBlock(text, 'chat');

  if (character) {
    const segments = parseInlineSegments(character.body);
    const { pt, translation } = splitChatPairs(segments);
    const name = attr(character.attrs, 'name');
    messages.push({
      id: `friend-character-${Date.now()}`,
      role: 'assistant',
      type: 'character',
      at: Date.now(),
      speaker: name || undefined,
      segments: pt.length ? pt : segments.filter((s) => s.lang === 'pt'),
      translation: translation.length ? translation : undefined,
      playablePt: pt.find((s) => s.lang === 'pt')?.text,
    });
  }

  if (coach) {
    const segments = parseInlineSegments(coach.body);
    messages.push({
      id: `friend-coach-${Date.now()}`,
      role: 'assistant',
      type: 'coach',
      at: Date.now(),
      segments,
      playablePt: [...segments].reverse().find((s) => s.lang === 'pt')?.text,
    });
  }

  if (help) {
    const segments = parseInlineSegments(help);
    messages.push({
      id: `friend-help-${Date.now()}`,
      role: 'assistant',
      type: 'help',
      at: Date.now(),
      segments,
      label: 'شرح',
      playablePt: [...segments].reverse().find((s) => s.lang === 'pt')?.text,
    });
  }

  if (praise) {
    const segments = parseInlineSegments(praise);
    const { pt, translation } = splitChatPairs(segments);
    messages.push({
      id: `friend-praise-${Date.now()}`,
      role: 'assistant',
      type: 'praise',
      at: Date.now(),
      segments: pt.length ? pt : segments.filter((s) => s.lang === 'pt'),
      translation: translation.length ? translation : undefined,
    });
  }

  if (correction) {
    const segments = parseInlineSegments(correction);
    const playablePt = [...segments].reverse().find((s) => s.lang === 'pt')?.text;
    messages.push({
      id: `friend-corr-${Date.now()}`,
      role: 'assistant',
      type: 'correction',
      at: Date.now(),
      segments,
      label: 'تصحيح',
      playablePt,
    });
  }

  if (chat) {
    const { pt, translation } = splitChatPairs(parseInlineSegments(chat));
    if (pt.length) {
      messages.push({
        id: `friend-chat-${Date.now()}`,
        role: 'assistant',
        type: 'chat',
        at: Date.now(),
        segments: pt,
        translation: translation.length ? translation : undefined,
      });
    }
  }

  // Fallback: if no blocks, try raw pt/ar tags as a single chat
  if (messages.length === 0) {
    const segments = parseInlineSegments(text);
    if (segments.length) {
      const { pt, translation } = splitChatPairs(segments);
      messages.push({
        id: `friend-fallback-${Date.now()}`,
        role: 'assistant',
        type: 'chat',
        at: Date.now(),
        segments: pt.length ? pt : segments.filter((s) => s.lang === 'pt'),
        translation: translation.length ? translation : undefined,
      });
    } else if (cleaned) {
      messages.push({
        id: `friend-plain-${Date.now()}`,
        role: 'assistant',
        type: 'chat',
        at: Date.now(),
        segments: [{ lang: 'pt', text: cleaned }],
      });
    }
  }

  return messages;
}

export function parseOpenVerdict(raw: string): {
  verdict: 'correct' | 'near-miss' | 'wrong' | null;
  reason: string;
  rawLine: string | null;
  body: string;
} {
  const text = stripThinkBlocks(raw);
  const lines = text.split(/\r?\n/);
  const first = lines.find((l) => l.trim()) ?? '';
  const match = first.match(
    /^\s*VERDICT:\s*(correct|near[_-]?miss|wrong)\s*[—\-–:]?\s*(.*)$/i,
  );
  if (!match) {
    return { verdict: null, reason: '', rawLine: null, body: text };
  }
  let verdict = match[1].toLowerCase().replace('_', '-') as 'correct' | 'near-miss' | 'wrong';
  if (verdict === ('near-miss' as string) || match[1].toLowerCase().includes('miss')) {
    verdict = 'near-miss';
  }
  const reason = match[2].trim();
  const bodyStart = text.indexOf(first) + first.length;
  return {
    verdict,
    reason,
    rawLine: first.trim(),
    body: text.slice(bodyStart).replace(/^\s+/, ''),
  };
}

/** Portuguese praise phrases from parsed messages (for RECENT_PRAISE). */
export function extractPraisePhrases(messages: TypedMessage[]): string[] {
  return messages
    .filter((m) => m.type === 'praise')
    .flatMap((m) => m.segments.filter((s) => s.lang === 'pt').map((s) => s.text.trim()))
    .filter(Boolean);
}

function extractBlock(text: string, name: string): string | null {
  return extractTagged(text, name)?.body ?? null;
}

function extractTagged(text: string, name: string): { attrs: string; body: string } | null {
  const re = new RegExp(`<\\s*${name}\\b([^>]*)>([\\s\\S]*?)<\\s*/\\s*${name}\\s*>`, 'i');
  const match = text.match(re);
  if (!match) return null;
  return { attrs: match[1] ?? '', body: match[2].trim() };
}

function attr(attrs: string, key: string): string {
  const match = attrs.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function parseInlineSegments(text: string): AuthoredSegment[] {
  const out: AuthoredSegment[] = [];
  const re = /<\s*(pt|ar|arz)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
  let match: RegExpExecArray | null;
  let lastAr: Extract<AuthoredSegment, { lang: 'ar' }> | null = null;

  while ((match = re.exec(text)) !== null) {
    const tag = match[1].toLowerCase();
    const body = match[2];
    if (tag === 'pt') {
      lastAr = null;
      out.push({ lang: 'pt', text: body });
    } else if (tag === 'ar') {
      const seg: AuthoredSegment = { lang: 'ar', text: body, pronunciation: body };
      out.push(seg);
      lastAr = seg;
    } else if (tag === 'arz' && lastAr) {
      lastAr.pronunciation = body;
    } else if (tag === 'arz') {
      out.push({
        lang: 'ar',
        text: body.replace(/[\u064B-\u065F\u0670]/g, ''),
        pronunciation: body,
      });
    }
  }
  return out;
}

function splitChatPairs(segments: AuthoredSegment[]): {
  pt: AuthoredSegment[];
  translation: AuthoredSegment[];
} {
  const pt: AuthoredSegment[] = [];
  const translation: AuthoredSegment[] = [];
  for (const seg of segments) {
    if (seg.lang === 'pt') pt.push(seg);
    else translation.push(seg);
  }
  return { pt, translation };
}
