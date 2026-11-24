/**
 * Turn review questions into the shape the review chat renders (16 §4).
 *
 * The chat reads: `skill` (listening | reading | writing | speaking | grammar),
 * `prompt_eg` / `prompt_tl` / `situation_eg`, `options` as `{ ar }` or `{ tl }`
 * rows, `answer` (index of the right option, or the tile order), `tiles`
 * (shuffled strings) and `accepted` (TL answers; the first one is also the
 * audio for listening cards). Lesson questions are stored differently
 * (`prompt` as rich text, options as rich text / strings, `audio_ref`), so
 * they are normalised here once, at build time, and frozen in the session.
 */

import type { CoverageSkill } from './coverage';

export type ChatSkill = 'listening' | 'reading' | 'writing' | 'speaking' | 'grammar';

type RtSeg = { text: string; lang: string };

const AR_RE = /[؀-ۿ]/;

/** Deterministic 32-bit hash (FNV-1a). */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic shuffle (same seed → same order). */
export function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
  const out = [...arr];
  let s = hashSeed(seed) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Chat skill chip for a step, from the question type first, then the coverage skill. */
export function chatSkillFor(type: string, coverage?: CoverageSkill | string): ChatSkill {
  switch (type) {
    case 'listen_meaning':
    case 'listen_pick_tl':
    case 'listen_pick_image':
    case 'dictation':
    case 'situation_choice':
      return 'listening';
    case 'read_meaning':
    case 'pick_meaning':
    case 'pick_tl':
      return 'reading';
    case 'translate_write':
    case 'fill_blank_write':
    case 'reply_write':
    case 'describe_image_write':
      return 'writing';
    case 'say_it':
    case 'reply_speak':
    case 'read_aloud':
    case 'describe_image_speak':
      return 'speaking';
    case 'build_sentence':
    case 'fill_blank_choice':
    case 'choose_article':
    case 'complete_phrase':
      return 'grammar';
    default:
      break;
  }
  if (coverage === 'listening') return 'listening';
  if (coverage === 'writing') return 'writing';
  if (coverage === 'speaking' || coverage === 'use') return 'speaking';
  if (coverage === 'building') return 'grammar';
  if (coverage === 'recognition') return 'reading';
  return 'reading';
}

function asRt(value: unknown): RtSeg[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ok = value.every(
    (s) =>
      s &&
      typeof s === 'object' &&
      typeof (s as RtSeg).text === 'string' &&
      typeof (s as RtSeg).lang === 'string',
  );
  return ok ? (value as RtSeg[]) : null;
}

function rtText(segs: RtSeg[], langs: string[]): string {
  return segs
    .filter((s) => langs.includes(s.lang))
    .map((s) => s.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function plainText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const rt = asRt(value);
  if (rt) return rt.map((s) => s.text).join('').replace(/\s+/g, ' ').trim();
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const k of ['text', 'tl', 'ar', 'label', 'eg']) {
      if (typeof o[k] === 'string' && (o[k] as string).trim()) {
        return (o[k] as string).trim();
      }
    }
  }
  return '';
}

/** One option row for the chat: Arabic rows render RTL, TL rows LTR. */
export function chatOption(label: string): { ar?: string; tl?: string; label: string } {
  return AR_RE.test(label) ? { ar: label, label } : { tl: label, label };
}

/** Resolve a TL string for an item id (audio_ref, tests). */
export type ItemLookup = (id: string) => { tl?: string; ar?: string } | undefined;

/**
 * Normalise a lesson (crafted) question into the chat shape.
 * Returns null when it can't be shown meaningfully (no prompt and no options).
 */
export function normalizeCraftedForChat(
  q: Record<string, unknown>,
  lookup: ItemLookup,
): Record<string, unknown> | null {
  const type = String(q.type ?? '');
  const out: Record<string, unknown> = { ...q };

  // Prompt: rich text → eg / tl / ar parts; object prompts keep their fields.
  const promptRt = asRt(q.prompt);
  const promptObj =
    q.prompt && typeof q.prompt === 'object' && !Array.isArray(q.prompt)
      ? (q.prompt as Record<string, unknown>)
      : null;
  if (promptRt) {
    const eg = rtText(promptRt, ['eg', 'ar']);
    const tl = rtText(promptRt, ['tl']);
    if (eg && !out.prompt_eg) out.prompt_eg = eg;
    if (tl && !out.prompt_tl) out.prompt_tl = tl;
  } else if (typeof q.prompt === 'string' && q.prompt.trim()) {
    const p = q.prompt.trim();
    if (AR_RE.test(p)) out.prompt_eg = out.prompt_eg ?? p;
    else out.prompt_tl = out.prompt_tl ?? p;
  } else if (promptObj) {
    for (const k of ['eg', 'question_eg', 'situation_eg'] as const) {
      const v = plainText(promptObj[k]);
      if (v && !out.prompt_eg) out.prompt_eg = v;
    }
    const tl = plainText(promptObj.tl);
    if (tl && !out.prompt_tl) out.prompt_tl = tl;
    const ref = typeof promptObj.audio_ref === 'string' ? promptObj.audio_ref : null;
    const audioTl = ref ? lookup(ref)?.tl : undefined;
    if (audioTl) out.audio_tl = audioTl;
  }

  // Options → { ar } / { tl } rows.
  if (Array.isArray(q.options)) {
    const labels = q.options.map((o) => plainText(o));
    if (labels.some((l) => !l)) return null; // never show empty chips
    out.options = labels.map(chatOption);
  }

  // Tiles → plain strings.
  if (Array.isArray(q.tiles)) {
    const tiles = q.tiles.map((t) => plainText(t));
    if (tiles.some((t) => !t)) return null;
    out.tiles = tiles;
  }

  // Listening cards play accepted[0]; give them the audio line.
  const isListen =
    type === 'listen_meaning' || type === 'listen_pick_tl' || type === 'dictation';
  if (isListen) {
    const audio =
      (out.audio_tl as string | undefined) ??
      (Array.isArray(q.tests) ? lookup(String(q.tests[0]))?.tl : undefined);
    if (!audio) return null;
    const acc = Array.isArray(q.accepted) ? q.accepted.map(String) : [];
    if (!acc.length) out.accepted = [audio];
  }

  // Situation-based cards read situation_eg.
  if (
    (type === 'translate_write' || type === 'say_it' || type === 'situation_choice') &&
    !out.situation_eg &&
    out.prompt_eg
  ) {
    out.situation_eg = out.prompt_eg;
  }

  out.skill = chatSkillFor(type, String(q.skill ?? ''));

  const hasPrompt = Boolean(
    out.prompt_eg || out.prompt_tl || out.situation_eg || out.accepted || out.reading,
  );
  if (!hasPrompt) return null;
  return out;
}
