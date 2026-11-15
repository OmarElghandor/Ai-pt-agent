import {
  shouldFireFreeTextCorrection,
  startFreeTextCorrection,
} from '@/lib/v2/convo/correction';
import type { ConvoProgressWriter } from '@/lib/v2/convo/progress/mirror';
import type { FreeTextCorrection } from '@/lib/v2/grader';
import type { RoleplayTurnEvent } from './events';
import {
  fuzzyMatchRoleplayExample,
  matchRoleplayWithLookahead,
  type RoleplayMatchHit,
} from './match';
import { normalizeRoleplayText } from './normalize';
import { playableSteps, remainingPlayableSteps } from './playable';
import { creditRoleplayItems } from './progress';
import type { RoleplayExchange, RoleplaySessionState } from './session';
import { handleRoleplaySideChannel } from './sideChannel';
import {
  applyLearnerName,
  characterSays,
  pickChips,
  pickLine,
} from './text';
import type { RoleplaySituation, RoleplayStep } from './types';

const CONFUSION_LINE = { tl: 'Desculpe?', ar: 'عذرًا؟' } as const;

export type RoleplayEngineDeps = {
  /** Optional progress writer — never required for pure turns. */
  progressWriter?: ConvoProgressWriter;
  /** Optional model reaction. Dormant: default is never called. */
  modelReaction?: (input: {
    situation: RoleplaySituation;
    step: RoleplayStep;
    learnerText: string;
    lastExchanges: RoleplaySessionState['exchanges'];
  }) => Promise<string | null>;
  /** When true (and modelReaction is given), allow it on off-script turns. */
  modelReactionsEnabled?: boolean;
  now?: () => Date;
};

export type RoleplayTurnInput = {
  situation: RoleplaySituation;
  state: RoleplaySessionState;
  learnerText: string;
  /** Explicit help button (ساعدني). */
  help?: boolean;
  learner_turn_id?: string;
  /** Chip tap — skip the free-text correction. Does not mark the step assisted. */
  assisted?: boolean;
};

export type RoleplayTurnResult = {
  state: RoleplaySessionState;
  events: RoleplayTurnEvent[];
  /** Pending correction promise (flush before done in API layer). */
  correctionPromise?: Promise<FreeTextCorrection | null>;
};

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

function progressEvent(
  situation: RoleplaySituation,
  state: RoleplaySessionState,
): RoleplayTurnEvent {
  const playable = playableSteps(situation, state.slots);
  const done = state.alone_steps.length + state.assisted_steps.length;
  return {
    type: 'progress',
    current: Math.min(done, playable.length),
    total: playable.length,
    step_id: state.current_step_id,
  };
}

function sessionEvent(state: RoleplaySessionState): RoleplayTurnEvent {
  return {
    type: 'session',
    session: {
      id: state.id,
      situation_id: state.situation_id,
      current_step_id: state.current_step_id,
      slots: { ...state.slots },
      status: state.status,
      alone_steps: [...state.alone_steps],
      assisted_steps: [...state.assisted_steps],
      pending_assist: state.pending_assist,
      key_phrases_said: [...state.key_phrases_said],
      model_calls: state.model_calls,
    },
  };
}

function finishTurn(
  events: RoleplayTurnEvent[],
  situation: RoleplaySituation,
  state: RoleplaySessionState,
  correctionPromise?: Promise<FreeTextCorrection | null>,
): RoleplayTurnResult {
  events.push(progressEvent(situation, state));
  events.push(sessionEvent(state));
  events.push({ type: 'done', finished: state.status === 'done' });
  return { state, events, correctionPromise };
}

function characterName(situation: RoleplaySituation): string | null {
  const c = situation.character;
  if (c && 'name' in c && typeof c.name === 'string') return c.name;
  if (c && 'id' in c && typeof c.id === 'string') return c.id;
  return null;
}

function noteKeyPhrases(
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  learnerText: string,
): void {
  for (const kp of situation.key_phrases) {
    const forms = [kp.tl, kp.tl_f].filter(Boolean) as string[];
    if (
      forms.some(
        (f) =>
          fuzzyMatchRoleplayExample(learnerText, f) ||
          learnerText.toLowerCase().includes(f.toLowerCase()),
      )
    ) {
      if (!state.key_phrases_said.includes(kp.tl)) {
        state.key_phrases_said.push(kp.tl);
      }
    }
  }
}

/** Last character line the learner heard (not the «Desculpe?» confusion line). */
function lastCharacterExchange(
  state: RoleplaySessionState,
): RoleplayExchange | null {
  for (let i = state.exchanges.length - 1; i >= 0; i--) {
    const e = state.exchanges[i];
    if (e.role === 'character' && e.kind !== 'confusion' && e.tl) return e;
  }
  return null;
}

function replayEvent(
  situation: RoleplaySituation,
  ex: RoleplayExchange,
  fallbackStepId: string,
): RoleplayTurnEvent {
  const stepId = ex.step_id ?? fallbackStepId;
  return {
    type: 'character',
    tl: ex.tl ?? '',
    ar: ex.ar ?? '',
    step_id: stepId,
    ar_hidden: true,
    audio_key:
      ex.audio_key ??
      `roleplay:${situation.id}:${stepId}:${ex.kind === 'reply' ? 'reply' : 'says'}`,
    playback: 'normal',
    ...(ex.speaker ? { speaker: ex.speaker } : {}),
  };
}

function emitSays(
  events: RoleplayTurnEvent[],
  step: RoleplayStep,
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  opts?: { record?: boolean },
): boolean {
  const says = characterSays(step, state.gender, state.learner_name);
  if (!says) return false;
  const audio_key = `roleplay:${situation.id}:${step.id}:says`;
  events.push({
    type: 'character',
    tl: says.tl,
    ar: says.ar,
    step_id: step.id,
    ar_hidden: true,
    audio_key,
    playback: 'normal',
    ...(step.speaker ? { speaker: step.speaker } : {}),
  });
  if (opts?.record !== false) {
    state.exchanges.push({
      role: 'character',
      tl: says.tl,
      ar: says.ar,
      step_id: step.id,
      kind: 'says',
      audio_key,
      ...(step.speaker ? { speaker: step.speaker } : {}),
    });
  }
  return true;
}

function emitReply(
  events: RoleplayTurnEvent[],
  reply: { tl: string; ar: string },
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  stepId: string,
  kind: 'reply' | 'closing' = 'reply',
): void {
  const tl = applyLearnerName(reply.tl, state.learner_name);
  const ar = applyLearnerName(reply.ar, state.learner_name);
  const audio_key = `roleplay:${situation.id}:${stepId}:${kind}`;
  events.push({
    type: 'character',
    tl,
    ar,
    step_id: stepId,
    ar_hidden: true,
    audio_key,
    playback: 'normal',
  });
  state.exchanges.push({
    role: 'character',
    tl,
    ar,
    step_id: stepId,
    kind,
    audio_key,
  });
}

/**
 * Repeat what the learner must answer. Uses the step's own `says`; when the
 * step has none, repeats the last character line (a previous reply/prompt).
 * Repeats are not recorded again in the exchange log.
 */
function repeatPrompt(
  events: RoleplayTurnEvent[],
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  step: RoleplayStep,
): void {
  if (emitSays(events, step, state, situation, { record: false })) return;
  const last = lastCharacterExchange(state);
  if (last) events.push(replayEvent(situation, last, step.id));
}

// ---------------------------------------------------------------------------
// Help ladder (one button: ساعدني / off-script)
// ---------------------------------------------------------------------------

/** Full sentence offered at miss 2. */
function assistSentence(
  step: RoleplayStep,
  state: RoleplaySessionState,
): string {
  const chips = pickChips(step.help.chips ?? [], step.help.chips_f, state.gender);
  // frame_tl may hold a blank («Queria um ___»), so prefer a complete chip.
  const frame = step.help.frame_tl?.trim() ?? '';
  const frameComplete = frame && !/[…_]|\.\.\./.test(frame);
  return (
    chips[0] ||
    (frameComplete ? frame : '') ||
    step.expects.examples_tl[0] ||
    frame
  );
}

function assistCoachEvent(full: string): RoleplayTurnEvent {
  return {
    type: 'coach',
    eg: `قول كده: ${full}`,
    moment: 'assist',
    chips: [full],
    frame_tl: full,
  };
}

/**
 * Miss 1 (or first ساعدني): «Desculpe?», repeat the prompt, hint_eg coach,
 * help.eg + 2 chips. Miss 2+: show the full sentence as a chip and wait; the
 * step completes (as assisted) only when the learner sends it.
 */
function applyHelpLadder(
  events: RoleplayTurnEvent[],
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  step: RoleplayStep,
): void {
  const miss = (state.misses[step.id] ?? 0) + 1;
  state.misses[step.id] = miss;

  if (miss >= 2) {
    const full = state.pending_assist ?? assistSentence(step, state);
    state.pending_assist = full;
    const coach = assistCoachEvent(full);
    events.push(coach);
    if (coach.type === 'coach') {
      state.exchanges.push({ role: 'coach', eg: coach.eg, step_id: step.id });
    }
    return;
  }

  // Miss 1.
  events.push({
    type: 'character',
    tl: CONFUSION_LINE.tl,
    ar: CONFUSION_LINE.ar,
    step_id: step.id,
    ar_hidden: true,
    audio_key: `roleplay:${situation.id}:${step.id}:confusion`,
    playback: 'normal',
  });
  state.exchanges.push({
    role: 'character',
    tl: CONFUSION_LINE.tl,
    ar: CONFUSION_LINE.ar,
    step_id: step.id,
    kind: 'confusion',
  });

  repeatPrompt(events, state, situation, step);

  if (step.hint_eg?.trim()) {
    events.push({ type: 'coach', eg: step.hint_eg, moment: 'hint' });
    state.exchanges.push({ role: 'coach', eg: step.hint_eg, step_id: step.id });
  }

  const chips = pickChips(
    step.help.chips ?? [],
    step.help.chips_f,
    state.gender,
  ).slice(0, 2);
  events.push({
    type: 'help',
    frame_tl: step.help.frame_tl,
    eg: step.help.eg,
    chips,
    miss,
  });
}

/** Does the learner's text amount to the offered full sentence? */
function matchesPendingAssist(text: string, pending: string): boolean {
  const a = normalizeRoleplayText(text);
  const b = normalizeRoleplayText(pending);
  if (!a || !b) return false;
  return a === b || fuzzyMatchRoleplayExample(text, pending);
}

// ---------------------------------------------------------------------------
// Advance
// ---------------------------------------------------------------------------

async function advanceAfterStep(opts: {
  events: RoleplayTurnEvent[];
  state: RoleplaySessionState;
  situation: RoleplaySituation;
  step: RoleplayStep;
  hitStay: boolean;
  optionReply: { tl: string; ar: string } | null;
  stepReply: { tl: string; ar: string } | null;
  /** First step completed via the miss-2 full sentence. */
  assisted: boolean;
  deps: RoleplayEngineDeps;
  lookaheadHits: Array<{
    step: RoleplayStep;
    optionReply: { tl: string; ar: string } | null;
    stepReply: { tl: string; ar: string } | null;
    stay: boolean;
  }>;
}): Promise<void> {
  const { events, state, situation, step, hitStay, optionReply, stepReply } =
    opts;

  state.pending_assist = null;

  if (hitStay) {
    if (optionReply) emitReply(events, optionReply, state, situation, step.id);
    // Stay: keep current_step_id.
    return;
  }

  if (opts.assisted) {
    if (!state.assisted_steps.includes(step.id)) {
      state.assisted_steps.push(step.id);
    }
  } else if (!state.alone_steps.includes(step.id)) {
    state.alone_steps.push(step.id);
  }

  // Option reply wins over step reply.
  const reply = optionReply ?? stepReply;
  if (reply) emitReply(events, reply, state, situation, step.id);

  // Look-ahead completions (reply only, no says).
  let lastStep = step;
  for (const la of opts.lookaheadHits) {
    if (la.stay) {
      if (la.optionReply) {
        emitReply(events, la.optionReply, state, situation, la.step.id);
      }
      state.current_step_id = la.step.id;
      return;
    }
    if (
      !state.alone_steps.includes(la.step.id) &&
      !state.assisted_steps.includes(la.step.id)
    ) {
      state.alone_steps.push(la.step.id);
    }
    const r = la.optionReply ?? la.stepReply;
    if (r) emitReply(events, r, state, situation, la.step.id);
    lastStep = la.step;
  }

  // Next playable step after the last completed one.
  const remaining = remainingPlayableSteps(
    situation,
    state.slots,
    lastStep.id,
  );
  const completed = new Set([
    ...state.alone_steps,
    ...state.assisted_steps,
    lastStep.id,
  ]);
  const next = remaining.find((s) => !completed.has(s.id));

  if (!next) {
    const closing = pickLine(situation.closing, state.gender);
    if (closing) {
      emitReply(events, closing, state, situation, 'closing', 'closing');
    }
    state.current_step_id = null;
    state.status = 'done';
    const alone = state.alone_steps.length;
    const assistedCount = state.assisted_steps.length;
    events.push({
      type: 'result',
      alone,
      assisted: assistedCount,
      key_phrases: [...state.key_phrases_said],
      corrections: [...state.corrections],
      summary_eg: situation.summary_eg,
    });
    if (opts.deps.progressWriter) {
      await creditRoleplayItems({
        situation,
        sessionId: state.id,
        day: situation.recommended_day,
        assisted: assistedCount > alone,
        write: opts.deps.progressWriter,
      });
    }
    return;
  }

  state.current_step_id = next.id;
  emitSays(events, next, state, situation);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open / resume. On resume: «كنا فين», replay the last character line the
 * learner heard (even when the current step has no `says`), and re-show a
 * pending full-sentence assist.
 */
export function startRoleplayScene(opts: {
  situation: RoleplaySituation;
  state: RoleplaySessionState;
  resume?: boolean;
}): RoleplayTurnResult {
  const { situation, state } = opts;
  const events: RoleplayTurnEvent[] = [];
  const step = situation.steps.find((s) => s.id === state.current_step_id);

  if (opts.resume && step) {
    events.push({
      type: 'coach',
      eg: 'كنا فين — نكمّل من هنا.',
      moment: 'resume',
    });
    const last = lastCharacterExchange(state);
    if (last) {
      events.push(replayEvent(situation, last, step.id));
    } else {
      emitSays(events, step, state, situation);
    }
    if (state.pending_assist) {
      events.push(assistCoachEvent(state.pending_assist));
    }
  } else if (step) {
    emitSays(events, step, state, situation);
  }

  return finishTurn(events, situation, state);
}

/**
 * Process one learner turn. Normal path makes zero model calls.
 */
export async function runRoleplayTurn(
  input: RoleplayTurnInput,
  deps: RoleplayEngineDeps = {},
): Promise<RoleplayTurnResult> {
  const situation = input.situation;
  const state: RoleplaySessionState = {
    ...input.state,
    slots: { ...input.state.slots },
    misses: { ...input.state.misses },
    alone_steps: [...input.state.alone_steps],
    assisted_steps: [...input.state.assisted_steps],
    pending_assist: input.state.pending_assist ?? null,
    key_phrases_said: [...input.state.key_phrases_said],
    exchanges: [...input.state.exchanges],
    corrections: [...input.state.corrections],
  };
  const now = deps.now?.() ?? new Date();
  state.updated_at = now.toISOString();

  const events: RoleplayTurnEvent[] = [];
  const text = input.learnerText.trim();

  if (state.status === 'done' || !state.current_step_id) {
    events.push(sessionEvent(state));
    events.push({ type: 'done', finished: true });
    return { state, events };
  }

  const current = situation.steps.find((s) => s.id === state.current_step_id);
  if (!current) {
    events.push({
      type: 'coach',
      eg: 'في مشكلة في المشهد — ابدأ من جديد.',
      moment: 'error',
    });
    events.push({ type: 'done', finished: false });
    return { state, events };
  }

  // Side channel / help first.
  const side = handleRoleplaySideChannel({
    learnerText: text,
    situation,
    step: current,
    gender: state.gender,
    characterName: characterName(situation),
  });

  if (side.kind === 'language' || side.kind === 'arabic_other') {
    events.push({ type: 'coach', eg: side.eg, moment: side.kind });
    state.exchanges.push({ role: 'coach', eg: side.eg });
    // Character waits.
    return finishTurn(events, situation, state);
  }

  if (input.help || side.kind === 'help') {
    applyHelpLadder(events, state, situation, current);
    return finishTurn(events, situation, state);
  }

  if (!text) {
    return finishTurn(events, situation, state);
  }

  // Learner Portuguese turn.
  state.exchanges.push({ role: 'learner', tl: text, step_id: current.id });
  noteKeyPhrases(state, situation, text);

  const pendingBefore = state.pending_assist;
  const assistActive =
    pendingBefore != null || (state.misses[current.id] ?? 0) >= 2;

  const remaining = remainingPlayableSteps(
    situation,
    state.slots,
    state.current_step_id,
  );
  let hits: RoleplayMatchHit[] = matchRoleplayWithLookahead(text, remaining);

  // The offered full sentence always completes the step, even if the matcher
  // would not recognise it on its own.
  if (
    hits.length === 0 &&
    pendingBefore &&
    matchesPendingAssist(text, pendingBefore)
  ) {
    hits = [
      {
        step_id: current.id,
        option: null,
        stay: false,
        slot: null,
        slot_value: null,
        via: 'example',
      },
    ];
  }

  let correctionPromise: Promise<FreeTextCorrection | null> | undefined;
  if (
    shouldFireFreeTextCorrection({
      learnerText: text,
      assisted: Boolean(input.assisted) || assistActive,
      sideChannel: false,
    })
  ) {
    const prompt =
      characterSays(current, state.gender, state.learner_name)?.tl ??
      lastCharacterExchange(state)?.tl;
    correctionPromise = startFreeTextCorrection({
      answer: text,
      character_tl: prompt,
      frame_tl: current.help.frame_tl,
      frame_chips: pickChips(
        current.help.chips ?? [],
        current.help.chips_f,
        state.gender,
      ),
    }).catch(() => null);
  }

  if (hits.length === 0) {
    // Off-script. Optional (dormant) model reaction, then the help ladder.
    if (deps.modelReactionsEnabled && deps.modelReaction) {
      const reaction = await deps.modelReaction({
        situation,
        step: current,
        learnerText: text,
        lastExchanges: state.exchanges.slice(-4),
      });
      state.model_calls += 1;
      if (reaction) {
        events.push({
          type: 'character',
          tl: reaction,
          ar: '',
          step_id: current.id,
          ar_hidden: true,
        });
      }
    }
    applyHelpLadder(events, state, situation, current);
    return finishTurn(events, situation, state, correctionPromise);
  }

  const first = hits[0];
  for (const h of hits) {
    if (h.slot && h.slot_value) state.slots[h.slot] = h.slot_value;
  }

  const firstStep = remaining.find((s) => s.id === first.step_id)!;
  const optionReply = first.option?.reply
    ? pickLine(first.option.reply, state.gender)
    : null;
  const stepReply = pickLine(firstStep.reply, state.gender);

  const lookaheadHits = hits.slice(1).map((h) => {
    const st = remaining.find((s) => s.id === h.step_id)!;
    return {
      step: st,
      optionReply: h.option?.reply
        ? pickLine(h.option.reply, state.gender)
        : null,
      stepReply: pickLine(st.reply, state.gender),
      stay: h.stay,
    };
  });

  state.misses[firstStep.id] = 0;

  await advanceAfterStep({
    events,
    state,
    situation,
    step: firstStep,
    hitStay: first.stay,
    optionReply,
    stepReply,
    assisted: assistActive,
    deps,
    lookaheadHits,
  });

  return finishTurn(events, situation, state, correctionPromise);
}
