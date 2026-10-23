import { loadNucleo } from './generation/wordData';
import type { AuthoredSegment } from './lessons/types';
import type { LessonReactionContext, TypedMessage } from './progressTypes';
import { scrubTagDebris, stripThinkBlocks } from './parseTaggedMessage';

function wordTokens(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Small function words ignored by the leak check. */
const SMALL_WORDS = new Set([
  'o',
  'a',
  'os',
  'as',
  'um',
  'uma',
  'uns',
  'umas',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'e',
  'sim',
  'nao',
  'não',
  'muito',
  'que',
]);

let nucleusWordSet: Set<string> | null = null;

function nucleusWords(): Set<string> {
  if (!nucleusWordSet) {
    try {
      nucleusWordSet = new Set(
        loadNucleo().map((w) =>
          w
            .normalize('NFC')
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{M}/gu, ''),
        ),
      );
    } catch {
      nucleusWordSet = new Set();
    }
  }
  return nucleusWordSet;
}

function normalizeToken(word: string): string {
  return word
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
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

const ENGLISH_WORD_RE = /\b(the|you|is|are|how|correct|answer|question|of course)\b/i;
const ARABIC_LETTER_RE = /[\u0600-\u06FF]/;

export type ParseFriendOptions = {
  /** Practice / assessment: never turn untagged text into a bubble. */
  strict?: boolean;
};

/**
 * Parse Friend / Prompt 4/5 model output into typed messages.
 * Blocks: optional character / coach / fix / help / correction / praise, then optional chat.
 */
export function parseFriendOutput(raw: string, opts?: ParseFriendOptions): TypedMessage[] {
  const cleaned = scrubTagDebris(stripThinkBlocks(raw)).trim();
  const text = stripThinkBlocks(raw).trim();
  const messages: TypedMessage[] = [];
  const strict = opts?.strict === true;

  const character = extractTagged(text, 'character');
  const coach = extractTagged(text, 'coach');
  const fix = extractTagged(text, 'fix');
  const example = extractTagged(text, 'example');
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
    const exampleSegs = example ? parseInlineSegments(example.body) : [];
    const examplePt = exampleSegs.find((s) => s.lang === 'pt')?.text?.trim();
    const exampleAr = exampleSegs.find((s) => s.lang === 'ar');
    messages.push({
      id: `friend-coach-${Date.now()}`,
      role: 'assistant',
      type: 'coach',
      at: Date.now(),
      segments,
      playablePt: [...segments].reverse().find((s) => s.lang === 'pt')?.text,
      examples:
        examplePt
          ? [{ pt: examplePt, meaningAr: exampleAr?.text?.trim() || '' }]
          : undefined,
    });
  }

  if (fix) {
    const segments = parseInlineSegments(fix.body);
    const playablePt = segments.find((s) => s.lang === 'pt')?.text;
    // Coach bubble with Arabic note when present (not a bare Portuguese line).
    messages.push({
      id: `friend-fix-${Date.now()}`,
      role: 'assistant',
      type: 'coach',
      at: Date.now(),
      segments: segments.length ? segments : playablePt ? [{ lang: 'pt', text: playablePt }] : [],
      playablePt,
      label: 'قربت',
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

  // Friend mode only: fall back to untagged / plain text.
  if (!strict && messages.length === 0) {
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

function normalizeEcho(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,!?;:…¿¡'"«»""''()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function logReactionDropped(reason: string, rawText: string): void {
  console.warn('[reaction_dropped]', reason, rawText);
}

/**
 * Drop bad practice/assessment reactions per reaction.md output checks.
 * Returns null when the whole reply should be discarded.
 */
export function filterReactionMessages(
  messages: TypedMessage[],
  reaction: Pick<
    LessonReactionContext,
    | 'reactionKind'
    | 'mode'
    | 'beatLine'
    | 'currentPromptPlain'
    | 'nextLine'
    | 'characterName'
    | 'answerForReaction'
    | 'words'
  >,
  rawText: string,
  learnerAnswer?: string,
): TypedMessage[] | null {
  const kind = reaction.reactionKind ?? (reaction.mode === 'side' ? 'r3' : 'r2');
  const allowed =
    kind === 'r3'
      ? new Set(['coach'])
      : new Set(['character', 'coach']); // fix is mapped to coach

  if (messages.length === 0) {
    logReactionDropped('empty_parse', rawText);
    return null;
  }

  // Text outside tags: any non-whitespace remaining after stripping known blocks.
  const stripped = stripThinkBlocks(rawText)
    .replace(/<\s*character\b[^>]*>[\s\S]*?<\s*\/\s*character\s*>/gi, '')
    .replace(/<\s*coach\b[^>]*>[\s\S]*?<\s*\/\s*coach\s*>/gi, '')
    .replace(/<\s*fix\b[^>]*>[\s\S]*?<\s*\/\s*fix\s*>/gi, '')
    .replace(/<\s*example\b[^>]*>[\s\S]*?<\s*\/\s*example\s*>/gi, '')
    .replace(/^\s*VERDICT:\s*.+$/im, '')
    .trim();
  if (stripped) {
    logReactionDropped('untagged_text', rawText);
    return null;
  }

  const beatLine = normalizeEcho(reaction.beatLine || reaction.currentPromptPlain || '');
  const nextLine = normalizeEcho(reaction.nextLine || '');
  const hisAnswer = normalizeEcho(
    reaction.answerForReaction || learnerAnswer || '',
  );
  const hisAnswerTokens = new Set(wordTokens(hisAnswer).map(normalizeToken));
  const allowedPool = new Set<string>();
  for (const source of [
    reaction.beatLine || reaction.currentPromptPlain || '',
    reaction.nextLine || '',
    reaction.answerForReaction || learnerAnswer || '',
    reaction.words || '',
  ]) {
    for (const token of wordTokens(source)) {
      allowedPool.add(normalizeToken(token));
    }
  }
  for (const word of nucleusWords()) {
    allowedPool.add(word);
  }

  for (const message of messages) {
    if (!allowed.has(message.type)) {
      logReactionDropped(`disallowed_type:${message.type}`, rawText);
      return null;
    }
    const pt = message.segments
      .filter((s) => s.lang === 'pt')
      .map((s) => s.text)
      .join(' ')
      .trim();
    const ar = message.segments
      .filter((s) => s.lang === 'ar')
      .map((s) => s.text)
      .join(' ')
      .trim();
    const translation = (message.translation ?? [])
      .map((s) => s.text)
      .join(' ')
      .trim();
    const exampleText = (message.examples ?? [])
      .map((ex) => `${ex.pt} ${ex.meaningAr}`)
      .join(' ')
      .trim();

    if (message.type === 'character') {
      if (pt.includes('?')) {
        logReactionDropped('character_question', rawText);
        return null;
      }
      if (ARABIC_LETTER_RE.test(pt)) {
        logReactionDropped('character_arabic_in_pt', rawText);
        return null;
      }
      if (wordTokens(pt).length > 12) {
        logReactionDropped('character_too_long', rawText);
        return null;
      }
      const speakerName = (message.speaker || reaction.characterName || '').trim();
      if (speakerName) {
        const nameRe = new RegExp(
          `\\b${speakerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i',
        );
        if (nameRe.test(pt)) {
          logReactionDropped('character_says_own_name', rawText);
          return null;
        }
      }
      const echo = normalizeEcho(pt);
      if (echo && echo === beatLine) {
        logReactionDropped('echo_beat_line', rawText);
        return null;
      }
      if (echo && nextLine && echo === nextLine) {
        logReactionDropped('echo_next_line', rawText);
        return null;
      }
      // Sharing a content word with the beat question is fine (e.g. "Um café, perfeito!"
      // after "Um café ou um chá?"). Only block when the reaction steals the NEXT line.
      if (nextLine && sharesKeyWords(pt, reaction.nextLine || '')) {
        logReactionDropped('shares_next_line_keywords', rawText);
        return null;
      }

      // Echo of his answer: more than half of the character's words are his.
      const charTokens = wordTokens(pt).map(normalizeToken);
      if (hisAnswerTokens.size > 0 && charTokens.length > 0) {
        const shared = charTokens.filter((t) => hisAnswerTokens.has(t)).length;
        if (shared > charTokens.length / 2) {
          logReactionDropped('echo_answer', rawText);
          return null;
        }
      }

      // Leak: a content word from another lesson / outside the scene pool.
      for (const token of charTokens) {
        if (SMALL_WORDS.has(token)) continue;
        if (!allowedPool.has(token)) {
          logReactionDropped('leak_word', rawText);
          return null;
        }
      }
    }

    for (const field of [pt, ar, translation, exampleText]) {
      if (field && ENGLISH_WORD_RE.test(field)) {
        logReactionDropped('english_word', rawText);
        return null;
      }
    }
  }

  return messages;
}

/** Same question word or main verb form between a reaction and a story line. */
function sharesKeyWords(a: string, b: string): boolean {
  const left = keyContentWords(a);
  const right = keyContentWords(b);
  if (!left.length || !right.length) return false;
  return left.some((word) => right.includes(word));
}

const QUESTION_WORDS = new Set([
  'como',
  'onde',
  'quando',
  'quanto',
  'quanta',
  'quantos',
  'quantas',
  'qual',
  'quais',
  'quem',
  'que',
  'porque',
]);

function keyContentWords(text: string): string[] {
  const tokens = wordTokens(normalizeEcho(text));
  const skip = new Set([
    ...QUESTION_WORDS,
    'o',
    'a',
    'os',
    'as',
    'um',
    'uma',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'te',
    'se',
    'me',
    'tu',
    'e',
    'é',
    'por',
  ]);
  const q = tokens.filter((t) => QUESTION_WORDS.has(t));
  const verbs = tokens.filter((t) => !skip.has(t) && t.length >= 3);
  return [...q, ...verbs.slice(0, 2)];
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
