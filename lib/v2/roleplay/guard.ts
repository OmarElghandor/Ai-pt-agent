import { findCoreItemById } from '@/lib/v2/generation/lesson/coreItems';
import {
  loadCommonWords,
  tokenizeContentWords,
} from '@/lib/v2/convo/guard/levelGuard';
import { checkPtScript } from '@/lib/v2/convo/output/scriptGuard';
import { countSentences } from './parse';
import type { RoleplaySituation, RoleplayStep } from './types';

export type RoleplayActorGuardReason =
  | 'empty'
  | 'script'
  | 'sentences'
  | 'oov';

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

/** Reject empty / wrong script / >2 sentences / OOV (off-scene). */
export function guardRoleplayActorTurn(opts: {
  tl: string;
  situation: RoleplaySituation;
}): RoleplayActorGuardResult {
  const tl = opts.tl.trim();
  if (!tl) return { ok: false, reason: 'empty' };

  const script = checkPtScript(tl);
  if (script) return { ok: false, reason: 'script' };

  // Prompt asks for ≤2 sentences; allow 3 short clauses so goldens like
  // «Um café? Claro! Mais alguma coisa?» pass (question + beat + follow-up).
  if (countSentences(tl) > 3) return { ok: false, reason: 'sentences' };

  const vocab = checkRoleplayReplyVocab({
    text: tl,
    situation: opts.situation,
  });
  if (!vocab.ok) {
    return { ok: false, reason: 'oov', offScene: vocab.offScene };
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
