import { findCoreItemById } from '@/lib/v2/generation/lesson/coreItems';
import {
  loadCommonWords,
  tokenizeContentWords,
} from '@/lib/v2/convo/guard/levelGuard';
import { checkPtScript } from '@/lib/v2/convo/output/scriptGuard';
import { normalizeRoleplayText } from './normalize';
import { countSentences } from './parse';
import type { RoleplaySituation, RoleplayStep } from './types';

export type RoleplayActorGuardReason =
  | 'empty'
  | 'script'
  | 'sentences'
  | 'oov'
  | 'closed';

export type RoleplayActorGuardResult = {
  ok: boolean;
  reason?: RoleplayActorGuardReason;
  offScene?: string[];
};

/** Surfaces allowed beyond the common-words list (scene items + new_tl + lines). */
export function roleplayAllowedSurfaces(
  situation: RoleplaySituation,
): string[] {
  const out: string[] = [...situation.new_tl];
  for (const id of situation.item_ids) {
    const item = findCoreItemById(id);
    if (!item) continue;
    out.push(item.tl);
    if (item.tl_f) out.push(item.tl_f);
    for (const v of item.variant_tl ?? []) out.push(v);
  }
  for (const step of situation.steps) {
    if (step.says) {
      out.push(step.says.tl);
      if (step.says.tl_f) out.push(step.says.tl_f);
    }
    if (step.reply) {
      out.push(step.reply.tl);
      if (step.reply.tl_f) out.push(step.reply.tl_f);
    }
    for (const ex of step.expects.examples_tl) out.push(ex);
    for (const ex of step.expects.examples_tl_f ?? []) out.push(ex);
    for (const kw of step.expects.keywords) out.push(kw);
    for (const opt of step.expects.options ?? []) {
      out.push(opt.value);
      for (const kw of opt.keywords) out.push(kw);
      if (opt.reply) {
        out.push(opt.reply.tl);
        if (opt.reply.tl_f) out.push(opt.reply.tl_f);
      }
    }
    out.push(step.help.frame_tl);
    for (const c of step.help.chips) out.push(c);
    for (const c of step.help.chips_f ?? []) out.push(c);
  }
  out.push(situation.closing.tl);
  if (situation.closing.tl_f) out.push(situation.closing.tl_f);
  out.push(situation.address);
  return out;
}

export function checkRoleplayReplyVocab(opts: {
  text: string;
  situation: RoleplaySituation;
}): { ok: boolean; offScene: string[] } {
  const common = loadCommonWords();
  const extra = new Set<string>();
  for (const surface of roleplayAllowedSurfaces(opts.situation)) {
    for (const tok of tokenizeContentWords(surface)) extra.add(tok);
  }
  const off: string[] = [];
  for (const tok of tokenizeContentWords(opts.text)) {
    if (common.has(tok) || extra.has(tok)) continue;
    if (tok.length <= 2) continue;
    if (!off.includes(tok)) off.push(tok);
  }
  return { ok: off.length <= 2, offScene: off };
}

/**
 * Every character turn must open the talk (except farewell / goodbye reply).
 * Files already end open — we only reject bare statements from the model.
 */
export function endsWithOpenTalk(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\?\s*$/u.test(t) || /\?\s*[😊🙂😉]?\s*$/u.test(t)) return true;
  return /\b(mais alguma coisa|cart[aã]o ou dinheiro|o que (quer|deseja|vai ser)|e agora|precisa de|diga(-me)?|conta(-me)?|e tu|e tudo)\b/iu.test(
    t,
  );
}

/**
 * Reject empty / wrong script / too many sentences / OOV / closed statement.
 * Pass `allowClosed` for farewell goodbye replies only.
 */
export function guardRoleplayActorTurn(opts: {
  tl: string;
  situation: RoleplaySituation;
  allowClosed?: boolean;
}): RoleplayActorGuardResult {
  const tl = opts.tl.trim();
  if (!tl) return { ok: false, reason: 'empty' };

  const script = checkPtScript(tl);
  if (script) return { ok: false, reason: 'script' };

  if (countSentences(tl) > 3) return { ok: false, reason: 'sentences' };

  const vocab = checkRoleplayReplyVocab({
    text: tl,
    situation: opts.situation,
  });
  if (!vocab.ok) {
    return { ok: false, reason: 'oov', offScene: vocab.offScene };
  }

  if (!opts.allowClosed && !endsWithOpenTalk(tl)) {
    return { ok: false, reason: 'closed' };
  }
  return { ok: true };
}

export function isRealRoleplayAttempt(
  text: string,
  step: RoleplayStep,
): boolean {
  const t = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return false;

  const yesNoOnly = /^(sim|nao|yes|no)$/i.test(t);
  if (!yesNoOnly) return true;

  const opts = (step.expects.options ?? []).map((o) =>
    o.value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim(),
  );
  return opts.some((o) => o === 'sim' || o === 'nao' || o === 'não');
}

export function matchRoleplayOptionValue(
  step: RoleplayStep,
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null;
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim();
  const want = norm(raw);
  for (const opt of step.expects.options ?? []) {
    if (norm(opt.value) === want) return opt.value;
    if (opt.keywords.some((k) => norm(k) === want)) return opt.value;
  }
  return null;
}

/** Learner farewell / goodbye (completes farewell beat or closes after it). */
export function isLearnerGoodbye(text: string): boolean {
  const t = normalizeRoleplayText(text);
  if (!t) return false;
  if (/\b(adeus|tchau|xau)\b/.test(t)) return true;
  if (
    /^(ate logo|ate amanha|ate ja|bom fim de semana|boa tarde|boa noite)[.!]*$/.test(
      t,
    )
  ) {
    return true;
  }
  return /^(muito )?obrigad[oa][.!]*$/.test(t);
}

export function looksLikeSideTalk(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  if (/\?/.test(raw)) return true;
  const t = normalizeRoleplayText(raw);
  return /\b(bonito|fixe|interessante|por acaso|e ai|desculpe|com licenca|gostei|que calor|que frio)\b/.test(
    t,
  );
}

/** First N whitespace-separated words (for opener tic detection). */
export function firstWords(text: string, n = 3): string {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Strip a repeated opener if the turn starts with the same first 3 words. */
export function stripRepeatedOpener(
  tl: string,
  previousOpener: string | null | undefined,
): string {
  if (!previousOpener?.trim()) return tl.trim();
  const words = tl.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return tl.trim();
  const head = firstWords(tl, 3);
  const prev = firstWords(previousOpener, 3);
  if (!head || head !== prev) return tl.trim();
  return words.slice(3).join(' ').trim() || tl.trim();
}
