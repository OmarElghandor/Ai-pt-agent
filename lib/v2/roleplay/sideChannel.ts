import { classifySideChannel } from '@/lib/v2/convo/sideChannel/classify';
import {
  contextMatchCoachEg,
  matchContextLine,
  type ContextLine,
} from '@/lib/v2/convo/sideChannel/matchContext';
import { normalizeAr } from '@/lib/v2/convo/sideChannel/normalizeAr';
import type { RoleplaySituation, RoleplayStep } from './types';
import { characterSays, pickLine, type RoleplayGender } from './text';

const HELP_RE =
  /(ساعدني|ساعدنى|مش\s*عارف|مش\s*عارفه|مش\s*فاهم|مش\s*فاهمه|محتاج\s*مساعده|محتاجة\s*مساعدة)/;

/** True when the learner asked for help (help ladder), not a language Q. */
export function isRoleplayHelpRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return HELP_RE.test(normalizeAr(t));
}

export function collectRoleplayContextCandidates(
  situation: RoleplaySituation,
  step: RoleplayStep | null,
  gender: RoleplayGender,
): ContextLine[] {
  const out: ContextLine[] = [];
  const push = (tl: string, ar?: string, weight = 0) => {
    const clean = tl.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    out.push({ tl: clean, ...(ar ? { ar } : {}), weight });
  };

  for (const kp of situation.key_phrases) {
    const tl = gender === 'f' && kp.tl_f ? kp.tl_f : kp.tl;
    push(tl, kp.ar, 2);
  }

  if (step) {
    const says = characterSays(step, gender);
    if (says) push(says.tl, says.ar, 3);
    if (step.reply) {
      const r = pickLine(step.reply, gender);
      if (r) push(r.tl, r.ar, 2);
    }
    for (const opt of step.expects.options ?? []) {
      if (opt.reply) {
        const r = pickLine(opt.reply, gender);
        if (r) push(r.tl, r.ar, 1);
      }
    }
    for (const chip of step.help?.chips ?? []) push(chip, undefined, 1);
    for (const ex of step.expects.examples_tl ?? []) push(ex, undefined, 1);
  }

  return out;
}

export type RoleplaySideChannelResult =
  | { kind: 'help' }
  | { kind: 'language'; eg: string; tl?: string; ar?: string }
  | { kind: 'arabic_other'; eg: string }
  | { kind: 'none' };

/**
 * Side channel for role-play: never calls a model.
 * Language questions answered from key_phrases + current step lines.
 */
export function handleRoleplaySideChannel(opts: {
  learnerText: string;
  situation: RoleplaySituation;
  step: RoleplayStep | null;
  gender: RoleplayGender;
  characterName?: string | null;
}): RoleplaySideChannelResult {
  const text = opts.learnerText.trim();
  if (!text) return { kind: 'none' };

  if (isRoleplayHelpRequest(text)) {
    return { kind: 'help' };
  }

  const side = classifySideChannel(text);
  if (!side) return { kind: 'none' };

  if (side === 'language_question') {
    const candidates = collectRoleplayContextCandidates(
      opts.situation,
      opts.step,
      opts.gender,
    );
    const match = matchContextLine(text, candidates);
    if (match) {
      const eg = match.ar
        ? `${match.tl} — ${match.ar}`
        : contextMatchCoachEg(match.tl, opts.characterName);
      return {
        kind: 'language',
        eg,
        tl: match.tl,
        ...(match.ar ? { ar: match.ar } : {}),
      };
    }
    return {
      kind: 'language',
      eg: 'مش لاقي المعنى في المشهد ده — جرّب من الـ chips أو اسأل عن كلمة من السطر.',
    };
  }

  if (side === 'arabic_answer' || side === 'other' || side === 'topic_request') {
    return {
      kind: 'arabic_other',
      eg: 'جاوب بالبرتغالي في الرول بلاي — أو دوس «ساعدني» لو وقفت.',
    };
  }

  return { kind: 'none' };
}
