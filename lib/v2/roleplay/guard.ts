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

/**
 * Off-scene = OOV vs common words + scene items + new_tl (+ authored lines).
 * At most 2 content words outside that set. No extra model call.
 */
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
 * Every character turn must open the talk: question or answerable invitation.
 * (Except the answer to the learner's goodbye.)
 */
export function endsWithOpenTalk(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\?\s*$/u.test(t) || /\?\s*[😊🙂😉]?\s*$/u.test(t)) return true;
  // Answerable invitations without a final ?
  return /\b(mais alguma coisa|cart[aã]o ou dinheiro|o que (quer|deseja|vai ser)|e agora|precisa de|diga(-me)?|conta(-me)?|e tu)\b/iu.test(
    t,
  );
}

/** Short open question from beat options, or «E agora?». */
export function openQuestionFromBeat(step: RoleplayStep | null): string {
  const opts =
    step?.expects.options?.map((o) => o.value.trim()).filter(Boolean) ?? [];
  if (opts.length >= 2) {
    const shown = opts.slice(0, 4);
    if (shown.length === 2) return `${shown[0]} ou ${shown[1]}?`;
    const last = shown[shown.length - 1]!;
    return `${shown.slice(0, -1).join(', ')} ou ${last}?`;
  }
  if (opts.length === 1) return `${opts[0]}?`;
  return 'E agora?';
}

/** Ensure PT ends with a question/invitation (replace trailing close if needed). */
export function ensureOpensTalk(
  tl: string,
  step: RoleplayStep | null,
): string {
  const base = tl.trim();
  if (!base) return openQuestionFromBeat(step);
  if (endsWithOpenTalk(base)) return base;
  const q = openQuestionFromBeat(step);
  return `${base.replace(/[.!…😊🙂]+\s*$/u, '').trim()} ${q}`.trim();
}

/**
 * Reject empty / wrong script / too many sentences / OOV / closed statement.
 * Pass `allowClosed` for the goodbye reply only.
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

  // Prompt asks for ≤2 sentences; allow 3 short clauses so goldens like
  // «Um café? Claro! Mais alguma coisa?» pass.
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

/**
 * A "real attempt" may accept the model's BEAT: done.
 * Bare sim/não only counts when the beat's options are yes/no.
 */
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

/** Model slot must be one of the option values (accent-insensitive). */
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

/** Learner is saying goodbye (triggers closing + end card after task_done). */
export function isLearnerGoodbye(text: string): boolean {
  const t = normalizeRoleplayText(text);
  if (!t) return false;
  // Clear farewells — not «Obrigado! Até amanhã!» which is often the last beat line.
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

/** In-scene side question / small talk (not a beat attempt). */
export function looksLikeSideTalk(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  if (/\?/.test(raw)) return true;
  const t = normalizeRoleplayText(raw);
  return /\b(bonito|fixe|interessante|por acaso|e ai|desculpe|com licenca|gostei|que calor|que frio)\b/.test(
    t,
  );
}
