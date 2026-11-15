import {
  shouldFireFreeTextCorrection,
  startFreeTextCorrection,
} from '@/lib/v2/convo/correction';
import type { ConvoProgressWriter } from '@/lib/v2/convo/progress/mirror';
import type { FreeTextCorrection } from '@/lib/v2/grader';
import type { RoleplayActor } from './actor';
import {
  resolveRoleplaySpeaker,
  roleplayCharacterDisplayName,
} from './character';
import type { RoleplayTurnEvent } from './events';
import {
  guardRoleplayActorTurn,
  isRealRoleplayAttempt,
  looksLikeSideTalk,
  matchRoleplayOptionValue,
  stripRepeatedOpener,
} from './guard';
import {
  fuzzyMatchRoleplayExample,
  matchRoleplayWithLookahead,
  type RoleplayMatchHit,
} from './match';
import { normalizeRoleplayText } from './normalize';
import { parseRoleplayActorOutput } from './parse';
import { playableSteps, remainingPlayableSteps } from './playable';
import {
  buildFileFallbackLines,
  buildRoleplayActorPrompt,
} from './prompt';
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

export type RoleplayEngineDeps = {
  progressWriter?: ConvoProgressWriter;
  actor?: RoleplayActor;
  now?: () => Date;
};

export type RoleplayTurnInput = {
  situation: RoleplaySituation;
  state: RoleplaySessionState;
  learnerText: string;
  help?: boolean;
  learner_turn_id?: string;
  assisted?: boolean;
  /** Explicit «خلّص» — finish the scene. */
  finish?: boolean;
};

export type RoleplayTurnResult = {
  state: RoleplaySessionState;
  events: RoleplayTurnEvent[];
  correctionPromise?: Promise<FreeTextCorrection | null>;
};

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
      task_done: state.task_done,
      alone_steps: [...state.alone_steps],
      assisted_steps: [...state.assisted_steps],
      pending_assist: state.pending_assist,
      key_phrases_said: [...state.key_phrases_said],
      model_calls: state.model_calls,
    },
  };
}

function emitLearnerLeadsCue(
  events: RoleplayTurnEvent[],
  step: RoleplayStep | null | undefined,
): void {
  if (!step?.learner_leads) return;
  const eg = step.do_eg?.trim();
  if (!eg) return;
  events.push({ type: 'cue', eg: `💡 ${eg}`, step_id: step.id });
}

function finishTurn(
  events: RoleplayTurnEvent[],
  situation: RoleplaySituation,
  state: RoleplaySessionState,
  correctionPromise?: Promise<FreeTextCorrection | null>,
  cueStep?: RoleplayStep | null,
): RoleplayTurnResult {
  if (cueStep) emitLearnerLeadsCue(events, cueStep);
  else if (state.current_step_id && state.status === 'active') {
    const step = situation.steps.find((s) => s.id === state.current_step_id);
    emitLearnerLeadsCue(events, step);
  }
  events.push(progressEvent(situation, state));
  events.push(sessionEvent(state));
  events.push({ type: 'done', finished: state.status === 'done' });
  return { state, events, correctionPromise };
}

function characterIdentity(
  situation: RoleplaySituation,
  speaker?: string | null,
): { name: string; character_id?: string | null; voice?: string; speaker?: string } {
  const resolved = resolveRoleplaySpeaker(situation, speaker);
  return {
    name: resolved.name,
    character_id: resolved.character_id,
    voice: resolved.voice,
    ...(speaker ? { speaker } : {}),
  };
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

function lastCharacterExchange(
  state: RoleplaySessionState,
): RoleplayExchange | null {
  for (let i = state.exchanges.length - 1; i >= 0; i--) {
    const e = state.exchanges[i];
    if (e.role === 'character' && e.tl) return e;
  }
  return null;
}

function replayEvent(
  situation: RoleplaySituation,
  ex: RoleplayExchange,
  fallbackStepId: string,
): RoleplayTurnEvent {
  const stepId = ex.step_id ?? fallbackStepId;
  const identity = characterIdentity(situation, ex.speaker);
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
    ...identity,
  };
}

function emitCharacterBubble(
  events: RoleplayTurnEvent[],
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  line: { tl: string; ar: string },
  stepId: string,
  kind: 'says' | 'reply' | 'closing' | 'actor' = 'actor',
  speaker?: string,
): void {
  const tl = applyLearnerName(line.tl, state.learner_name).trim();
  const ar = applyLearnerName(line.ar, state.learner_name).trim();
  if (!tl) return;
  const audio_key = `roleplay:${situation.id}:${stepId}:${kind}`;
  const identity = characterIdentity(situation, speaker);
  events.push({
    type: 'character',
    tl,
    ar,
    step_id: stepId,
    ar_hidden: true,
    audio_key,
    playback: 'normal',
    ...identity,
  });
  state.exchanges.push({
    role: 'character',
    tl,
    ar,
    step_id: stepId,
    kind: kind === 'actor' ? 'reply' : kind,
    audio_key,
    ...(speaker ? { speaker } : {}),
  });
}

function emitSays(
  events: RoleplayTurnEvent[],
  step: RoleplayStep,
  state: RoleplaySessionState,
  situation: RoleplaySituation,
): boolean {
  const says = characterSays(step, state.gender, state.learner_name);
  if (!says) return false;
  emitCharacterBubble(
    events,
    state,
    situation,
    says,
    step.id,
    'says',
    step.speaker,
  );
  return true;
}

function assistSentence(
  step: RoleplayStep,
  state: RoleplaySessionState,
): string {
  const chips = pickChips(step.help.chips ?? [], step.help.chips_f, state.gender);
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

function stuckHintEg(step: RoleplayStep): string {
  return step.hint_eg?.trim() || step.do_eg?.trim() || step.help.eg;
}

function applyHelpLadder(
  events: RoleplayTurnEvent[],
  state: RoleplaySessionState,
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

  const hint = stuckHintEg(step);
  if (hint) {
    events.push({ type: 'coach', eg: `💡 ${hint}`, moment: 'hint' });
    state.exchanges.push({ role: 'coach', eg: hint, step_id: step.id });
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

function matchesPendingAssist(text: string, pending: string): boolean {
  const a = normalizeRoleplayText(text);
  const b = normalizeRoleplayText(pending);
  if (!a || !b) return false;
  return a === b || fuzzyMatchRoleplayExample(text, pending);
}

async function markStepComplete(
  state: RoleplaySessionState,
  stepId: string,
  assisted: boolean,
): Promise<void> {
  state.pending_assist = null;
  if (assisted) {
    if (!state.assisted_steps.includes(stepId)) {
      state.assisted_steps.push(stepId);
    }
  } else if (!state.alone_steps.includes(stepId)) {
    state.alone_steps.push(stepId);
  }
}

/** End card + closing credit. Farewell path only. */
async function emitEndCard(
  events: RoleplayTurnEvent[],
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  deps: RoleplayEngineDeps,
): Promise<void> {
  state.status = 'done';
  state.current_step_id = null;
  state.task_done = true;
  const alone = state.alone_steps.length;
  const assistedCount = state.assisted_steps.length;
  if (deps.progressWriter) {
    await creditRoleplayItems({
      situation,
      sessionId: state.id,
      day: situation.recommended_day,
      assisted: assistedCount > alone,
      write: deps.progressWriter,
    });
  }
  events.push({
    type: 'result',
    alone,
    assisted: assistedCount,
    key_phrases: [...state.key_phrases_said],
    corrections: [...state.corrections],
    summary_eg: situation.summary_eg,
  });
}

async function emitClosingAndEnd(
  events: RoleplayTurnEvent[],
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  deps: RoleplayEngineDeps,
): Promise<void> {
  const closing = pickLine(situation.closing, state.gender) ?? {
    tl: 'Adeus!',
    ar: 'مع السلامة!',
  };
  emitCharacterBubble(
    events,
    state,
    situation,
    closing,
    'closing',
    'closing',
  );
  await emitEndCard(events, state, situation, deps);
}

function nextPlayableAfter(
  situation: RoleplaySituation,
  state: RoleplaySessionState,
  lastStepId: string,
): RoleplayStep | null {
  const remaining = remainingPlayableSteps(
    situation,
    state.slots,
    lastStepId,
  );
  const completed = new Set([
    ...state.alone_steps,
    ...state.assisted_steps,
    lastStepId,
  ]);
  return remaining.find((s) => !completed.has(s.id)) ?? null;
}

async function resolveCharacterLine(opts: {
  deps: RoleplayEngineDeps;
  situation: RoleplaySituation;
  state: RoleplaySessionState;
  current: RoleplayStep | null;
  next: RoleplayStep | null;
  codeDone: boolean;
  codeSlot: string | null;
  learnerText: string;
  optionReply: { tl: string; ar: string } | null;
  stepReply: { tl: string; ar: string } | null;
  hitStay: boolean;
  goodbye?: boolean;
  sideTalk?: boolean;
  /** Fact beat: file lines only, zero model calls. */
  fileOnly?: boolean;
}): Promise<{
  line: { tl: string; ar: string };
  modelBeatDone: boolean;
  modelSlot: string | null;
}> {
  const previousOpener = lastCharacterExchange(opts.state)?.tl ?? null;
  const fallback = buildFileFallbackLines({
    situation: opts.situation,
    state: opts.state,
    current: opts.current,
    next: opts.codeDone ? opts.next : null,
    optionReply: opts.optionReply,
    stepReply: opts.stepReply,
    beatDone: opts.codeDone,
    hitStay: opts.hitStay,
    goodbye: opts.goodbye,
  });

  // File fallback is authored — never strip openers from it.
  if (opts.fileOnly || !opts.deps.actor) {
    return { line: fallback, modelBeatDone: false, modelSlot: null };
  }

  const prompt = buildRoleplayActorPrompt({
    situation: opts.situation,
    state: opts.state,
    current: opts.current,
    next: opts.codeDone ? opts.next : null,
    codeDone: opts.codeDone,
    codeSlot: opts.codeSlot,
    learnerText: opts.learnerText,
    goodbye: opts.goodbye,
    sideTalk: opts.sideTalk,
  });

  opts.state.model_calls += 1;
  const generated = await opts.deps.actor.generate(prompt);
  if (generated.timedOut || !generated.text.trim()) {
    return { line: fallback, modelBeatDone: false, modelSlot: null };
  }

  const parsed = parseRoleplayActorOutput(generated.text);
  const guard = guardRoleplayActorTurn({
    tl: parsed.tl,
    situation: opts.situation,
    allowClosed: Boolean(opts.goodbye),
  });
  if (!guard.ok) {
    return { line: fallback, modelBeatDone: false, modelSlot: null };
  }

  let tl = stripRepeatedOpener(parsed.tl.trim(), previousOpener);
  const ar = parsed.ar.trim();
  let modelBeatDone = false;
  let modelSlot: string | null = null;

  // Re-guard after strip (empty / closed) → fall back to file lines.
  const afterStrip = guardRoleplayActorTurn({
    tl,
    situation: opts.situation,
    allowClosed: Boolean(opts.goodbye),
  });
  if (!afterStrip.ok) {
    return { line: fallback, modelBeatDone: false, modelSlot: null };
  }

  if (
    opts.current &&
    parsed.beat.kind === 'done' &&
    isRealRoleplayAttempt(opts.learnerText, opts.current)
  ) {
    if (opts.current.expects.slot) {
      const matched = matchRoleplayOptionValue(
        opts.current,
        parsed.beat.option,
      );
      if (matched) {
        modelBeatDone = true;
        modelSlot = matched;
      }
    } else {
      modelBeatDone = true;
    }
  }

  return { line: { tl, ar }, modelBeatDone, modelSlot };
}

export function startRoleplayScene(opts: {
  situation: RoleplaySituation;
  state: RoleplaySessionState;
  resume?: boolean;
}): RoleplayTurnResult {
  const { situation, state } = opts;
  if (typeof state.task_done !== 'boolean') state.task_done = false;
  if (typeof state.side_talk_streak !== 'number') state.side_talk_streak = 0;

  const events: RoleplayTurnEvent[] = [];
  const step = situation.steps.find((s) => s.id === state.current_step_id);

  if (opts.resume) {
    events.push({
      type: 'coach',
      eg: 'كنا فين — نكمّل من هنا.',
      moment: 'resume',
    });
    const last = lastCharacterExchange(state);
    if (last) {
      events.push(
        replayEvent(situation, last, step?.id ?? last.step_id ?? 'resume'),
      );
    } else if (step) {
      emitSays(events, step, state, situation);
    }
    if (state.pending_assist) {
      events.push(assistCoachEvent(state.pending_assist));
    }
  } else if (step) {
    emitSays(events, step, state, situation);
  }

  return finishTurn(events, situation, state, undefined, step);
}

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
    task_done: Boolean(input.state.task_done),
    side_talk_streak: input.state.side_talk_streak ?? 0,
  };
  const now = deps.now?.() ?? new Date();
  state.updated_at = now.toISOString();

  const events: RoleplayTurnEvent[] = [];
  const text = input.learnerText.trim();

  if (state.status === 'done') {
    events.push(sessionEvent(state));
    events.push({ type: 'done', finished: true });
    return { state, events };
  }

  // Explicit خلّص → closing + end.
  if (input.finish) {
    await emitClosingAndEnd(events, state, situation, deps);
    return finishTurn(events, situation, state);
  }

  if (!state.current_step_id) {
    await emitClosingAndEnd(events, state, situation, deps);
    return finishTurn(events, situation, state);
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

  const side = handleRoleplaySideChannel({
    learnerText: text,
    situation,
    step: current,
    gender: state.gender,
    characterName: roleplayCharacterDisplayName(situation),
  });

  if (side.kind === 'language' || side.kind === 'arabic_other') {
    events.push({ type: 'coach', eg: side.eg, moment: side.kind });
    state.exchanges.push({ role: 'coach', eg: side.eg });
    return finishTurn(events, situation, state, undefined, current);
  }

  if (input.help || side.kind === 'help') {
    applyHelpLadder(events, state, current);
    return finishTurn(events, situation, state, undefined, current);
  }

  if (!text) {
    return finishTurn(events, situation, state, undefined, current);
  }

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

  // Correction on every non-assisted Portuguese turn (even after earlier misses).
  let correctionPromise: Promise<FreeTextCorrection | null> | undefined;
  if (
    shouldFireFreeTextCorrection({
      learnerText: text,
      assisted: Boolean(input.assisted),
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

  const first = hits[0] ?? null;
  const codeDone = Boolean(first && !first.stay);
  const hitStay = Boolean(first?.stay);
  const sideTalk =
    !first &&
    looksLikeSideTalk(text) &&
    state.side_talk_streak < 2;

  if (first) {
    for (const h of hits) {
      if (h.slot && h.slot_value) state.slots[h.slot] = h.slot_value;
    }
    state.side_talk_streak = 0;
  }

  const lookaheadHits = first ? hits.slice(1) : [];
  for (const h of lookaheadHits) {
    if (h.slot && h.slot_value) state.slots[h.slot] = h.slot_value;
  }

  const firstStep = first
    ? remaining.find((s) => s.id === first.step_id)!
    : current;
  const optionReply = first?.option?.reply
    ? pickLine(first.option.reply, state.gender)
    : null;
  const stepReply = pickLine(firstStep.reply, state.gender);

  let lastCompletedId = firstStep.id;
  for (const h of lookaheadHits) {
    if (!h.stay) lastCompletedId = h.step_id;
  }

  let nextForPrompt: RoleplayStep | null = null;
  if (codeDone && !hitStay) {
    const pretend: RoleplaySessionState = {
      ...state,
      alone_steps: [...state.alone_steps, firstStep.id],
    };
    for (const h of lookaheadHits) {
      if (!h.stay && !pretend.alone_steps.includes(h.step_id)) {
        pretend.alone_steps.push(h.step_id);
      }
    }
    nextForPrompt = nextPlayableAfter(situation, pretend, lastCompletedId);
  }

  const codeSlot =
    first?.slot_value ??
    (first?.slot ? state.slots[first.slot] : null) ??
    null;

  // Farewell beat done → closing + end (no actor).
  if (codeDone && firstStep.farewell) {
    state.misses[firstStep.id] = 0;
    state.side_talk_streak = 0;
    await markStepComplete(state, firstStep.id, assistActive);
    for (const h of lookaheadHits) {
      if (!h.stay) await markStepComplete(state, h.step_id, false);
    }
    await emitClosingAndEnd(events, state, situation, deps);
    return finishTurn(events, situation, state, correctionPromise);
  }

  const resolved = await resolveCharacterLine({
    deps,
    situation,
    state,
    current: firstStep,
    next: hitStay || !codeDone ? null : nextForPrompt,
    codeDone,
    codeSlot,
    learnerText: text,
    optionReply,
    stepReply,
    hitStay,
    sideTalk,
    fileOnly: Boolean(codeDone && firstStep.fact),
  });

  let beatDone = codeDone;
  if (!beatDone && resolved.modelBeatDone && !sideTalk) {
    beatDone = true;
    if (resolved.modelSlot && firstStep.expects.slot) {
      state.slots[firstStep.expects.slot] = resolved.modelSlot;
    }
  }
  if (sideTalk) beatDone = false;

  // Model completed an open beat into farewell → still need closing after bubble?
  // If model advances into farewell as next, we emit the bubble then set current.
  // If the completed step itself is farewell, handled above.

  emitCharacterBubble(
    events,
    state,
    situation,
    resolved.line,
    firstStep.id,
    beatDone ? 'reply' : 'says',
    firstStep.speaker,
  );

  if (hitStay) {
    return finishTurn(events, situation, state, correctionPromise, current);
  }

  if (!beatDone) {
    if (sideTalk) {
      state.side_talk_streak += 1;
      return finishTurn(events, situation, state, correctionPromise, current);
    }
    state.side_talk_streak = 0;
    applyHelpLadder(events, state, current);
    return finishTurn(events, situation, state, correctionPromise, current);
  }

  state.misses[firstStep.id] = 0;
  state.side_talk_streak = 0;
  await markStepComplete(state, firstStep.id, assistActive);

  for (const h of lookaheadHits) {
    if (h.stay) {
      state.current_step_id = h.step_id;
      const stayStep = situation.steps.find((s) => s.id === h.step_id);
      return finishTurn(
        events,
        situation,
        state,
        correctionPromise,
        stayStep ?? null,
      );
    }
    await markStepComplete(state, h.step_id, false);
    lastCompletedId = h.step_id;
  }

  // Model completed a non-code farewell (rare) — end after bubble? Skip; farewell needs match.

  const next = nextPlayableAfter(situation, state, lastCompletedId);
  if (!next) {
    // No next playable and not farewell-matched: still close (safety).
    await emitClosingAndEnd(events, state, situation, deps);
    return finishTurn(events, situation, state, correctionPromise);
  }

  state.current_step_id = next.id;
  return finishTurn(events, situation, state, correctionPromise, next);
}
