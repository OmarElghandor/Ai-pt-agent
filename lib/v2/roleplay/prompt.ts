import {
  resolveRoleplaySpeaker,
  roleplayCharacterDisplayName,
} from './character';
import { firstWords } from './guard';
import { characterSays, pickLine } from './text';
import type { RoleplaySessionState } from './session';
import type { RoleplaySituation, RoleplayStep } from './types';

export const ROLEPLAY_ACTOR_SYSTEM = [
  'You are the character in a short Portuguese (pt-PT) role-play.',
  'Reply with at most 2 short sentences of natural European Portuguese.',
  'Always end with a question or an answerable invitation so the learner can speak next.',
  'React warmly in a short phrase (Boa escolha!, Claro!, Ah!); never echo the learner sentence back.',
  'Use the suggested line as default wording unless you have a clearly natural reason to change it.',
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

function lastCharacterTl(state: RoleplaySessionState): string | null {
  for (let i = state.exchanges.length - 1; i >= 0; i--) {
    const e = state.exchanges[i];
    if (e.role === 'character' && e.tl?.trim()) return e.tl.trim();
  }
  return null;
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
  /** Learner said goodbye on farewell — answer without requiring a question. */
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
  const prevTl = lastCharacterTl(state);
  const dontStart = prevTl
    ? `don't start like this: «${firstWords(prevTl, 3)}»`
    : 'no repeated opener constraint';

  const header = [
    '### CHARACTER',
    `name: ${who.name}`,
    `role: ${characterRoleEg(situation)}`,
    `address the learner as: ${addressLine(situation, state.gender)}`,
    `learner name: ${learnerName}`,
    `learner gender: ${learnerGender}`,
    'style: short, natural pt-PT, at most 2 short sentences, simple words; warm reaction, never echo the learner',
    `opener: ${dontStart}`,
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

  const step = current!;
  const suggestedCurrent = characterSays(step, state.gender, state.learner_name);
  const suggestedNext = next
    ? characterSays(next, state.gender, state.learner_name)
    : null;
  const optionValues =
    step.expects.options?.map((o) => o.value).filter(Boolean) ?? [];
  const beatStatus = input.codeDone
    ? `done${input.codeSlot ? `, slot = ${input.codeSlot}` : ''}`
    : input.sideTalk
      ? 'open — answer the side remark briefly, then return to THIS beat with a question; do NOT advance'
      : 'open — stay on this beat; help narrow the choice; never say the next beat line';

  const nextLine = !input.codeDone
    ? '(none — current beat still open)'
    : next
      ? `use this line unless a clearly natural change: ${suggestedNext?.tl ?? next.expects.intent_eg}`
      : 'farewell / end — no further question';

  const suggestedLine = input.codeDone
    ? suggestedNext?.tl ?? suggestedCurrent?.tl ?? '(waiting)'
    : suggestedCurrent?.tl ?? '(waiting)';

  return [
    ...header,
    '',
    '### CURRENT BEAT',
    `intent: ${step.expects.intent_eg}`,
    `suggested line (default wording): ${suggestedLine}`,
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
      ? 'Portuguese turn: short warm reaction + next beat question/invitation (one natural turn). Always end with a question. Prefer the suggested next line.'
      : 'Portuguese turn: react and stay on this beat with a question/invitation. Prefer the suggested line. Always end with a question.',
    'AR: <arabic>',
    'BEAT: done <option>   OR   BEAT: open',
  ].join('\n');
}

/**
 * File lines as authored — no «E agora?» glue.
 * Beat done → option/step reply + next says; open → current says.
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
}): { tl: string; ar: string } {
  const { state, situation, current, next } = opts;

  if (opts.goodbye) {
    const closing = pickLine(situation.closing, state.gender);
    return closing ?? { tl: 'Adeus!', ar: 'مع السلامة!' };
  }

  if (opts.hitStay) {
    const base = opts.optionReply;
    if (base?.tl.trim()) return base;
    const says = current
      ? characterSays(current, state.gender, state.learner_name)
      : null;
    return says ?? { tl: '', ar: '' };
  }

  if (opts.beatDone) {
    const reply = opts.optionReply ?? opts.stepReply;
    const says = next
      ? characterSays(next, state.gender, state.learner_name)
      : null;
    const tl = [reply?.tl, says?.tl].filter((s) => s?.trim()).join(' ').trim();
    const ar = [reply?.ar, says?.ar].filter((s) => s?.trim()).join(' ').trim();
    if (tl) return { tl, ar };
    return reply ?? says ?? { tl: '', ar: '' };
  }

  // Open beat: current says only.
  const says = current
    ? characterSays(current, state.gender, state.learner_name)
    : null;
  if (says) return says;
  const frame = current?.help.frame_tl?.trim();
  if (frame && !/[…_]|\.\.\./.test(frame)) {
    return { tl: frame, ar: current?.help.eg ?? '' };
  }
  return { tl: '', ar: current?.help.eg ?? '' };
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
  const parts = t.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (parts.length <= 1) return `${t} ${c}`.trim();
  const head = parts.slice(0, -1).join(' ');
  return `${head} ${c}`.trim();
}
