import {
  resolveRoleplaySpeaker,
  roleplayCharacterDisplayName,
} from './character';
import {
  ensureOpensTalk,
  openQuestionFromBeat,
} from './guard';
import { characterSays, pickLine } from './text';
import type { RoleplaySessionState } from './session';
import type { RoleplaySituation, RoleplayStep } from './types';

export const ROLEPLAY_ACTOR_SYSTEM = [
  'You are the character in a short Portuguese (pt-PT) role-play.',
  'Reply with at most 2 short sentences of natural European Portuguese.',
  'Always end with a question or an answerable invitation so the learner can speak next.',
  'React warmly in a short phrase (Boa escolha!, Claro!, Ah!); never echo the learner sentence back.',
  'Then one line starting with AR: (Egyptian Arabic meaning of your Portuguese).',
  'Then one hidden line: BEAT: done <option> or BEAT: open.',
  'Never write English. Never coach the learner. Never mention beats or this format.',
].join(' ');

function characterRoleEg(situation: RoleplaySituation): string {
  const c = situation.character;
  if (c && 'role_eg' in c && typeof c.role_eg === 'string' && c.role_eg.trim()) {
    return c.role_eg.trim();
  }
  return `${roleplayCharacterDisplayName(situation)} in this scene`;
}

function addressLine(
  situation: RoleplaySituation,
  gender: RoleplaySessionState['gender'],
): string {
  const raw = situation.address?.trim() || 'tu';
  if (/senhor|senhora/i.test(raw)) {
    return gender === 'f' ? 'a senhora' : 'o senhor';
  }
  return raw;
}

function formatExchanges(
  exchanges: RoleplaySessionState['exchanges'],
): string {
  const rows = exchanges
    .filter((e) => e.role === 'learner' || e.role === 'character')
    .slice(-6)
    .map((e) => {
      const who = e.role === 'learner' ? 'Learner' : 'You';
      return `${who}: ${e.tl ?? e.eg ?? ''}`.trim();
    })
    .filter((l) => l.length > 8)
    .slice(-3);
  return rows.length ? rows.join('\n') : '(none)';
}

export type BuildRoleplayActorPromptInput = {
  situation: RoleplaySituation;
  state: RoleplaySessionState;
  current: RoleplayStep | null;
  next: RoleplayStep | null;
  /** Code matcher already marked this beat done. */
  codeDone: boolean;
  codeSlot?: string | null;
  learnerText: string;
  /** Task beats are done; keep light in-scene chat open. */
  openChat?: boolean;
  /** Learner said goodbye — answer without requiring a question. */
  goodbye?: boolean;
  /** Side question / comment while a beat is still open. */
  sideTalk?: boolean;
};

/** Constant-size labelled prompt for one character turn. */
export function buildRoleplayActorPrompt(
  input: BuildRoleplayActorPromptInput,
): string {
  const { situation, state, current, next, learnerText } = input;
  const who = resolveRoleplaySpeaker(
    situation,
    current?.speaker,
  );
  const learnerGender =
    state.gender === 'f' ? 'female (a senhora / -a forms)' : 'male (o senhor / -o forms)';
  const learnerName = state.learner_name?.trim() || '(unknown — do not invent a name)';

  const header = [
    '### CHARACTER',
    `name: ${who.name}`,
    `role: ${characterRoleEg(situation)}`,
    `address the learner as: ${addressLine(situation, state.gender)}`,
    `learner name: ${learnerName}`,
    `learner gender: ${learnerGender}`,
    'style: short, natural pt-PT, at most 2 short sentences, simple words; warm reaction, never echo the learner',
    '',
    '### SCENE',
    `place: ${situation.place_eg}`,
    `task: ${situation.task_eg}`,
  ];

  if (input.goodbye) {
    return [
      ...header,
      '',
      '### CURRENT BEAT',
      'learner is saying goodbye — answer warmly in character; no question needed',
      '',
      '### NEXT BEAT',
      'end',
      '',
      '### LAST 3 EXCHANGES',
      formatExchanges(state.exchanges),
      '',
      '### LEARNER JUST SAID',
      learnerText.trim() || '(empty)',
      '',
      '### OUTPUT',
      'Portuguese goodbye (statement OK).',
      'AR: <arabic>',
      'BEAT: open',
    ].join('\n');
  }

  if (input.openChat || state.task_done) {
    return [
      ...header,
      '',
      '### CURRENT BEAT',
      'task is done — keep a light in-scene chat open with ONE short question at the learner level',
      '',
      '### NEXT BEAT',
      'stay open (do not say goodbye unless the learner did)',
      '',
      '### LAST 3 EXCHANGES',
      formatExchanges(state.exchanges),
      '',
      '### LEARNER JUST SAID',
      learnerText.trim() || '(empty)',
      '',
      '### OUTPUT',
      'Portuguese turn that ends with a light question.',
      'AR: <arabic>',
      'BEAT: open',
    ].join('\n');
  }

  const step = current!;
  const suggested = characterSays(step, state.gender, state.learner_name);
  const optionValues =
    step.expects.options?.map((o) => o.value).filter(Boolean) ?? [];
  const beatStatus = input.codeDone
    ? `done${input.codeSlot ? `, slot = ${input.codeSlot}` : ''}`
    : input.sideTalk
      ? 'open — answer the side remark briefly, then return to THIS beat with a question; do NOT advance'
      : 'open — stay on this beat; help narrow the choice; never say the next beat line';

  // Open beat: withhold next beat line entirely.
  const nextLine = !input.codeDone
    ? '(none — current beat still open)'
    : next
      ? characterSays(next, state.gender, state.learner_name)?.tl ??
        next.expects.intent_eg
      : 'task done — ask one light in-scene question (not goodbye)';

  return [
    ...header,
    '',
    '### CURRENT BEAT',
    `intent: ${step.expects.intent_eg}`,
    `suggested line: ${suggested?.tl ?? '(waiting)'}`,
    optionValues.length
      ? `option values: ${optionValues.join(' | ')}`
      : 'option values: (none)',
    `status: ${beatStatus}`,
    '',
    '### NEXT BEAT',
    nextLine,
    '',
    '### LAST 3 EXCHANGES',
    formatExchanges(state.exchanges),
    '',
    '### LEARNER JUST SAID',
    learnerText.trim() || '(empty)',
    '',
    '### OUTPUT',
    input.codeDone
      ? 'Portuguese turn: short warm reaction + next beat question/invitation (one natural turn). Always end with a question.'
      : 'Portuguese turn: react and stay on this beat with a question/invitation. Always end with a question.',
    'AR: <arabic>',
    'BEAT: done <option>   OR   BEAT: open',
  ].join('\n');
}

/**
 * File fallback that always opens the talk (except pure goodbye closing).
 * Does not glue next-beat lines onto an open beat.
 */
export function buildFileFallbackLines(opts: {
  situation: RoleplaySituation;
  state: RoleplaySessionState;
  current: RoleplayStep | null;
  next: RoleplayStep | null;
  optionReply: { tl: string; ar: string } | null;
  stepReply: { tl: string; ar: string } | null;
  beatDone: boolean;
  hitStay: boolean;
  goodbye?: boolean;
  openChat?: boolean;
}): { tl: string; ar: string } {
  const { state, situation, current, next } = opts;

  if (opts.goodbye) {
    const closing = pickLine(situation.closing, state.gender);
    return closing ?? { tl: 'Adeus!', ar: 'مع السلامة!' };
  }

  if (opts.openChat || (opts.beatDone && !next && state.task_done)) {
    return {
      tl: 'E então, gosta daqui?',
      ar: 'طيب، بتحب المكان؟',
    };
  }

  if (opts.hitStay) {
    const base = opts.optionReply ?? { tl: '', ar: '' };
    return {
      tl: ensureOpensTalk(base.tl || openQuestionFromBeat(current), current),
      ar: base.ar,
    };
  }

  if (opts.beatDone) {
    const reply = opts.optionReply ?? opts.stepReply;
    if (next) {
      const says = characterSays(next, state.gender, state.learner_name);
      // Prefer next says if it already opens; else reply + open question from next.
      if (says && endsOpensOrReplace(says.tl, next)) {
        const tl = reply
          ? replaceEndingWithCue(`${reply.tl} ${says.tl}`.trim(), says.tl)
          : ensureOpensTalk(says.tl, next);
        return {
          tl: ensureOpensTalk(tl, next),
          ar: [reply?.ar, says.ar].filter(Boolean).join(' '),
        };
      }
      const base = reply?.tl ?? says?.tl ?? '';
      return {
        tl: ensureOpensTalk(base, next),
        ar: reply?.ar ?? says?.ar ?? '',
      };
    }
    // Last beat done → light open question (not closing).
    const base = reply?.tl ?? '';
    return {
      tl: ensureOpensTalk(base || 'Pronto!', null),
      ar: reply?.ar ?? '',
    };
  }

  // Open beat: stay; never emit next beat line.
  const says = current
    ? characterSays(current, state.gender, state.learner_name)
    : null;
  const base =
    says?.tl ||
    (current?.help.frame_tl && !/[…_]|\.\.\./.test(current.help.frame_tl)
      ? current.help.frame_tl
      : '');
  return {
    tl: ensureOpensTalk(base, current),
    ar: says?.ar ?? current?.help.eg ?? '',
  };
}

function endsOpensOrReplace(tl: string, step: RoleplayStep): boolean {
  return ensureOpensTalk(tl, step).length > 0;
}

/**
 * If the model turn has no question, replace its ending with the cue line
 * instead of concatenating a third sentence.
 */
export function replaceEndingWithCue(full: string, cue: string): string {
  const t = full.trim();
  const c = cue.trim();
  if (!t) return c;
  if (!c) return t;
  if (t.includes(c.slice(0, Math.min(12, c.length)))) return t;
  // Drop a trailing statement clause, keep a short reaction head.
  const parts = t.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (parts.length <= 1) return ensureOpensTalk(`${t} ${c}`, null);
  const head = parts.slice(0, -1).join(' ');
  return `${head} ${c}`.trim();
}
