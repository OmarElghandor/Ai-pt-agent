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
  | {
      verdict: 'near-miss';
      matched: string;
      reason?: 'accent' | 'extra-words' | 'spelling';
      /** Accented accepted form of the first word he misspelled (for بنكتبها …). */
      correctedWord?: string;
      promptEcho?: string;
    }
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

/** Levenshtein with adjacent transposition counted as 1 (restricted Damerau). */
export function editDistanceWithSwap(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const dp: number[][] = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[la][lb];
}

/** True when two accent-free strings differ by exactly one insertion, deletion, or substitution. */
export function isOneLetterEdit(a: string, b: string): boolean {
  return editDistanceWithSwap(a, b) === 1;
}

const SLOT_TOKEN_RE = /^\[(name|city|number|place)\]$/i;

function tokenizeForSpelling(text: string): string[] {
  return normalizeWithoutAccents(text)
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function originalWords(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(PUNCT_RE, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/**
 * Word-by-word spelling near-miss: same word count; each pair equal or within
 * edit distance 2 (words of 5+ letters) / 1 (shorter). Slots match any value.
 * Adjacent letter swap counts as 1. Returns the accented accepted form of the
 * first misspelled word when it is a near miss.
 */
export function spellingNearMiss(
  userText: string,
  accepted: string,
): { ok: true; correctedWord?: string } | { ok: false } {
  const userTok = tokenizeForSpelling(userText);
  const acceptedTok = tokenizeForSpelling(
    accepted.replace(/\[(?:NAME|CITY|NUMBER|PLACE)\]/gi, (m) => ` ${m} `),
  );
  if (userTok.length !== acceptedTok.length || userTok.length === 0) {
    return { ok: false };
  }
  const acceptedOriginal = originalWords(
    accepted.replace(/\[(?:NAME|CITY|NUMBER|PLACE)\]/gi, (m) => ` ${m} `),
  );
  let correctedWord: string | undefined;
  let anyDiff = false;
  for (let i = 0; i < userTok.length; i++) {
    const u = userTok[i];
    const a = acceptedTok[i];
    if (SLOT_TOKEN_RE.test(a)) continue;
    if (u === a) continue;
    anyDiff = true;
    const max = a.length >= 5 ? 2 : 1;
    if (editDistanceWithSwap(u, a) > max) return { ok: false };
    if (!correctedWord) {
      correctedWord = acceptedOriginal[i] || a;
    }
  }
  if (!anyDiff) return { ok: false };
  return { ok: true, correctedWord };
}

/** Learner's own value inside a filled personal-slot pattern, or null. */
export function extractPersonalSlotValue(userText: string, pattern: string): string | null {
  if (!hasPersonalSlot(pattern)) return null;
  const marked = normalizeWithoutAccents(
    pattern.replace(/\[(?:NAME|CITY|NUMBER|PLACE)\]/g, ' slot '),
  );
  const parts = marked.split('slot');
  if (parts.length !== 2) return null;
  const prefix = parts[0].trim();
  const suffix = parts[1].trim();
  const user = normalizeWithoutAccents(userText);
  const forms =
    prefix === 'eu' || prefix.startsWith('eu ') || user === 'eu'
      ? [user]
      : user.startsWith('eu ')
        ? [user, user.slice(3)]
        : [user];

  for (const form of forms) {
    const afterPrefix = consumeEdge(form, prefix, 'start');
    if (afterPrefix == null) continue;
    const middle = consumeEdge(afterPrefix, suffix, 'end');
    if (middle == null) continue;
    const value = middle.trim();
    if (value && !/^(name|city|number|place)$/.test(value)) {
      // Prefer the original casing from the learner text when possible.
      const raw = userText.trim();
      const idx = normalizeWithoutAccents(raw).indexOf(value);
      if (idx >= 0) return raw.slice(idx, idx + value.length);
      return value;
    }
  }
  return null;
}

function slotKindLabel(pattern: string): 'name' | 'age' | 'city' | 'place' {
  if (/\[NUMBER\]/i.test(pattern)) return 'age';
  if (/\[CITY\]/i.test(pattern)) return 'city';
  if (/\[PLACE\]/i.test(pattern)) return 'place';
  return 'name';
}

/** R1 SLOT_NOTE line when a personal value is known. */
export function slotNoteForPattern(pattern: string, value: string): string {
  const kind = slotKindLabel(pattern);
  return `His own ${kind} is "${value}". Use it in your sentence exactly as he wrote it.`;
}

/**
 * Deterministic grade for known beats with a fixed accepted list.
 * Order: exact → anticipated_wrong → accent slip → one-letter edit → wrong.
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

  for (const accepted of acceptedAnswers) {
    if (normalizeWithoutAccents(accepted) === withoutAccents) {
      const userWords = originalWords(userText);
      const acceptedWords = originalWords(accepted);
      let correctedWord: string | undefined;
      const n = Math.min(userWords.length, acceptedWords.length);
      for (let i = 0; i < n; i++) {
        if (normalizeAnswer(userWords[i]) !== normalizeAnswer(acceptedWords[i])) {
          correctedWord = acceptedWords[i];
          break;
        }
      }
      return {
        verdict: 'near-miss',
        matched: accepted,
        reason: 'accent',
        correctedWord: correctedWord || acceptedWords[0],
      };
    }
  }

  for (const accepted of acceptedAnswers) {
    const spelling = spellingNearMiss(userText, accepted);
    if (spelling.ok) {
      return {
        verdict: 'near-miss',
        matched: accepted,
        reason: 'spelling',
        correctedWord: spelling.correctedWord,
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

const STUCK_PHRASE_RE =
  /^(مش\s*فاهم(?:ة)?|مفهمتش|يعني\s*إيه|ايه\s*ده|إيه\s*ده)[؟?\s.!]*$/u;
const WHY_KEYWORD_RE = /ليه|ليش|الفرق|إمتى\s*نستخدم/u;
const PT_TOKEN_RE = /[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]*/g;

/** Only ? / ؟ (and whitespace) — the classic "???" stuck signal. */
export function isPunctuationOnlyStuck(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^[?؟\s.!.…]+$/u.test(trimmed) && /[?؟]/.test(trimmed);
}

/** Short Egyptian "I don't understand" phrases (Arabic-only). */
export function isArabicStuckPhrase(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || LATIN_RE.test(trimmed)) return false;
  if (!ARABIC_RE.test(trimmed)) return false;
  if (trimmed.length > 40) return false;
  const compact = trimmed.replace(/\s+/g, ' ').trim();
  return STUCK_PHRASE_RE.test(compact);
}

/** Stuck: punctuation-only or short Arabic "don't understand" — not an answer. */
export function isStuckMessage(text: string): boolean {
  return isPunctuationOnlyStuck(text) || isArabicStuckPhrase(text);
}

/** Arabic message asking why / difference / when to use a form. */
export function isArabicWhyQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !ARABIC_RE.test(trimmed)) return false;
  return WHY_KEYWORD_RE.test(trimmed);
}

function tokenizePortuguese(blob: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of blob.matchAll(PT_TOKEN_RE)) {
    const token = match[0].toLowerCase().normalize('NFC');
    if (token.length < 2) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/**
 * Portuguese tool words from the current beat + lesson grammar card / requirements.
 * Used to decide whether an Arabic "why" question is about this lesson's tool.
 */
export function lessonToolWords(
  pack: {
    learningTarget?: string;
    requirements?: { words?: string[] };
    grammarCard?: { examples?: { pt: string }[]; ruleAr?: string };
  },
  beat: {
    frame?: string;
    wordBank?: { pt: string }[];
    acceptedAnswers?: string[];
    line?: { pt: string };
    coachTip?: { ar: string };
  },
): string[] {
  const parts: string[] = [];
  if (beat.frame) parts.push(beat.frame);
  if (beat.line?.pt) parts.push(beat.line.pt);
  for (const entry of beat.wordBank ?? []) {
    if (entry.pt) parts.push(entry.pt);
  }
  for (const answer of beat.acceptedAnswers ?? []) {
    parts.push(answer.replace(/\[(?:NAME|CITY|NUMBER|PLACE)\]/gi, ' '));
  }
  for (const ex of pack.grammarCard?.examples ?? []) {
    if (ex.pt) parts.push(ex.pt);
  }
  for (const word of pack.requirements?.words ?? []) {
    parts.push(word);
  }
  if (pack.learningTarget) parts.push(pack.learningTarget);
  return tokenizePortuguese(parts.join(' '));
}

/** True when the learner's text mentions a Portuguese word from this lesson's tool. */
export function mentionsLessonTool(
  text: string,
  pack: Parameters<typeof lessonToolWords>[0],
  beat: Parameters<typeof lessonToolWords>[1],
): boolean {
  const tools = lessonToolWords(pack, beat);
  if (!tools.length) return false;
  const lower = text.toLowerCase().normalize('NFC');
  const mentioned = tokenizePortuguese(text);
  return (
    mentioned.some((token) => tools.includes(token)) ||
    tools.some((tool) => tool.length >= 3 && lower.includes(tool))
  );
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
