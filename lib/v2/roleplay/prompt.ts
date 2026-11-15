import {
  resolveRoleplaySpeaker,
  roleplayCharacterDisplayName,
} from './character';
import { characterSays, pickLine } from './text';
import type { RoleplaySessionState } from './session';
import type { RoleplaySituation, RoleplayStep } from './types';

export const ROLEPLAY_ACTOR_SYSTEM = [
  'You are the character in a short Portuguese (pt-PT) role-play.',
  'Reply with at most 2 short sentences of natural European Portuguese.',
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
  current: RoleplayStep;
  next: RoleplayStep | null;
  /** Code matcher already marked this beat done. */
  codeDone: boolean;
  codeSlot?: string | null;
  learnerText: string;
};

/** Constant-size labelled prompt for one character turn. */
export function buildRoleplayActorPrompt(
  input: BuildRoleplayActorPromptInput,
): string {
  const { situation, state, current, next, learnerText } = input;
  const who = resolveRoleplaySpeaker(situation, current.speaker);
  const suggested = characterSays(current, state.gender, state.learner_name);
  const optionValues =
    current.expects.options?.map((o) => o.value).filter(Boolean) ?? [];
  const beatStatus = input.codeDone
    ? `done${input.codeSlot ? `, slot = ${input.codeSlot}` : ''}`
    : 'open — learner may still be answering this beat';

  const nextLine = next
    ? characterSays(next, state.gender, state.learner_name)?.tl ??
      next.expects.intent_eg
    : 'end: say goodbye';

  const learnerGender =
    state.gender === 'f' ? 'female (a senhora / -a forms)' : 'male (o senhor / -o forms)';
  const learnerName = state.learner_name?.trim() || '(unknown — do not invent a name)';

  return [
    '### CHARACTER',
    `name: ${who.name}`,
    `role: ${characterRoleEg(situation)}`,
    `address the learner as: ${addressLine(situation, state.gender)}`,
    `learner name: ${learnerName}`,
    `learner gender: ${learnerGender}`,
    'style: short, natural pt-PT, at most 2 short sentences, simple words',
    '',
    '### SCENE',
    `place: ${situation.place_eg}`,
    `task: ${situation.task_eg}`,
    '',
    '### CURRENT BEAT',
    `intent: ${current.expects.intent_eg}`,
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
    'Portuguese turn (react; recast mistakes briefly; if beat done ask next; else re-ask).',
    'AR: <arabic>',
    'BEAT: done <option>   OR   BEAT: open',
  ].join('\n');
}

/** Suggested file lines when the model is rejected / times out. */
export function buildFileFallbackLines(opts: {
  situation: RoleplaySituation;
  state: RoleplaySessionState;
  current: RoleplayStep;
  next: RoleplayStep | null;
  optionReply: { tl: string; ar: string } | null;
  stepReply: { tl: string; ar: string } | null;
  beatDone: boolean;
  hitStay: boolean;
  closing?: boolean;
}): { tl: string; ar: string } {
  const { state, situation, current, next } = opts;
  const parts: Array<{ tl: string; ar: string }> = [];

  if (opts.closing) {
    const closing = pickLine(situation.closing, state.gender);
    if (closing) parts.push(closing);
    return joinLines(parts);
  }

  if (opts.hitStay) {
    if (opts.optionReply) parts.push(opts.optionReply);
    return joinLines(parts);
  }

  if (opts.beatDone) {
    const reply = opts.optionReply ?? opts.stepReply;
    if (reply) parts.push(reply);
    if (next) {
      const says = characterSays(next, state.gender, state.learner_name);
      if (says) parts.push(says);
    } else {
      const closing = pickLine(situation.closing, state.gender);
      if (closing) parts.push(closing);
    }
    return joinLines(parts);
  }

  // Re-ask current beat.
  const says = characterSays(current, state.gender, state.learner_name);
  if (says) parts.push(says);
  else {
    // Null says: last character prompt already said; soft re-ask from help frame.
    const frame = current.help.frame_tl?.trim();
    if (frame && !/[…_]|\.\.\./.test(frame)) {
      parts.push({ tl: frame, ar: current.help.eg || '' });
    }
  }
  return joinLines(parts);
}

function joinLines(
  parts: Array<{ tl: string; ar: string }>,
): { tl: string; ar: string } {
  return {
    tl: parts
      .map((p) => p.tl.trim())
      .filter(Boolean)
      .join(' '),
    ar: parts
      .map((p) => p.ar.trim())
      .filter(Boolean)
      .join(' '),
  };
}
