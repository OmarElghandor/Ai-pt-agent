import type { AnticipatedWrong, AuthoredSegment, StoryLine } from './lessons/types';

const PUNCT_RE = /[.,!?;:…¿¡'"«»""''()[\]{}]/g;

/** Lowercase, collapse space, strip punctuation. Keeps accents. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(PUNCT_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same as normalizeAnswer, then strip combining accents. */
export function normalizeWithoutAccents(text: string): string {
  return normalizeAnswer(text)
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export type GradeVerdict =
  | { verdict: 'correct'; matched: string }
  | { verdict: 'near-miss'; matched: string; reason?: 'accent' | 'extra-words'; promptEcho?: string }
  | {
      verdict: 'anticipated-wrong';
      matched: string;
      feedback: AuthoredSegment[];
      authoredVerdict?: 'near_miss' | 'wrong';
    }
  | { verdict: 'wrong' };

export function promptTextForLine(line: StoryLine | undefined): string {
  if (!line) return '';
  return `${line.pt} ${line.ar}`.trim();
}

const PERSONAL_SLOT_RE = /\[(?:NAME|CITY|NUMBER|PLACE)\]/;

/** True when the target phrase depends on the learner's own name, city, number, or place. */
export function hasPersonalSlot(...parts: Array<string | undefined>): boolean {
  return parts.some((part) => Boolean(part && PERSONAL_SLOT_RE.test(part)));
}

function consumeEdge(text: string, edge: string, from: 'start' | 'end'): string | null {
  const piece = edge.trim();
  if (!piece) return text.trim();
  if (from === 'start') {
    if (text === piece) return '';
    if (!text.startsWith(`${piece} `)) return null;
    return text.slice(piece.length + 1);
  }
  if (text === piece) return '';
  if (!text.endsWith(` ${piece}`)) return null;
  return text.slice(0, text.length - piece.length - 1);
}

/** Pattern with the slot replaced by a real value. Leading "eu" is optional when the pattern has none. */
export function matchesFilledPersonalSlot(userText: string, pattern: string): boolean {
  if (!hasPersonalSlot(pattern)) return false;
  const marked = normalizeWithoutAccents(
    pattern.replace(/\[(?:NAME|CITY|NUMBER|PLACE)\]/g, ' slot '),
  );
  const parts = marked.split('slot');
  if (parts.length !== 2) return false;
  const prefix = parts[0].trim();
  const suffix = parts[1].trim();
  const user = normalizeWithoutAccents(userText);
  const forms =
    prefix === 'eu' || prefix.startsWith('eu ') || user === 'eu'
      ? [user]
      : user.startsWith('eu ')
        ? [user, user.slice(3)]
        : [user];

  return forms.some((form) => {
    const afterPrefix = consumeEdge(form, prefix, 'start');
    if (afterPrefix == null) return false;
    const middle = consumeEdge(afterPrefix, suffix, 'end');
    if (middle == null) return false;
    const value = middle.trim();
    return Boolean(value) && !/^(name|city|number|place)$/.test(value);
  });
}

/** Correct when the learner filled the taught slot. Null when the frame does not match. */
export function gradeFilledPersonalSlot(
  userText: string,
  patterns: string[],
): GradeVerdict | null {
  for (const pattern of patterns) {
    if (matchesFilledPersonalSlot(userText, pattern)) {
      return { verdict: 'correct', matched: pattern };
    }
  }
  return null;
}

/**
 * Deterministic grade for known beats with a fixed accepted list.
 * Extra / wrong words are wrong (not near-miss) so the learner must retry.
 */
export function gradeKnownAnswer(
  userText: string,
  acceptedAnswers: string[],
  anticipatedWrong: AnticipatedWrong[] = [],
): GradeVerdict {
  const withAccents = normalizeAnswer(userText);
  const withoutAccents = normalizeWithoutAccents(userText);

  for (const accepted of acceptedAnswers) {
    if (normalizeAnswer(accepted) === withAccents) {
      return { verdict: 'correct', matched: accepted };
    }
  }

  for (const accepted of acceptedAnswers) {
    if (normalizeWithoutAccents(accepted) === withoutAccents) {
      return { verdict: 'near-miss', matched: accepted, reason: 'accent' };
    }
  }

  for (const entry of anticipatedWrong) {
    const answer = entry.answer;
    if (
      normalizeAnswer(answer) === withAccents ||
      normalizeWithoutAccents(answer) === withoutAccents
    ) {
      return {
        verdict: 'anticipated-wrong',
        matched: answer,
        feedback: entry.feedback,
        authoredVerdict: entry.verdict === 'near_miss' ? 'near_miss' : 'wrong',
      };
    }
  }

  return { verdict: 'wrong' };
}

const LATIN_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]/;
const ARABIC_RE = /[\u0600-\u06FF]/;

export type MessageScript = 'latin' | 'arabic-only' | 'empty';

/** Latin letters ⇒ answer attempt. Arabic-only ⇒ side remark (never graded). */
export function classifyScript(text: string): MessageScript {
  const trimmed = text.trim();
  if (!trimmed) return 'empty';
  if (LATIN_RE.test(trimmed)) return 'latin';
  if (ARABIC_RE.test(trimmed)) return 'arabic-only';
  return 'empty';
}

/** Code guard for open items: required words / endings must appear. */
export function passesCodeGuard(
  userText: string,
  guard: { requiredWords?: string[]; requiredEndings?: string[] },
): boolean {
  const norm = normalizeWithoutAccents(userText);
  for (const word of guard.requiredWords ?? []) {
    if (!norm.includes(normalizeWithoutAccents(word))) return false;
  }
  for (const ending of guard.requiredEndings ?? []) {
    const e = normalizeWithoutAccents(ending);
    // Check any token ends with the ending
    const tokens = norm.split(' ').filter(Boolean);
    if (!tokens.some((t) => t.endsWith(e))) return false;
  }
  return true;
}
