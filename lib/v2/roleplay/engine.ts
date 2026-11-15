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
  matchRoleplayOptionValue,
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
  /** Optional progress writer — never required for pure turns. */
  progressWriter?: ConvoProgressWriter;
  /**
   * Character actor (buffered V2_CONVO_MODEL). When omitted, the engine uses
   * file lines (tests / chips finish). Live API always injects an actor.
   */
  actor?: RoleplayActor;
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
  // Hints-only: no always-on do strip.
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

/** Last character line the learner heard. */
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

/** One character bubble (PT for TTS; AR stored for tap — never raw AR:/BEAT:). */
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

// ---------------------------------------------------------------------------
// Help ladder (hints only — no Desculpe? / always-on strip)
// ---------------------------------------------------------------------------

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

/**
 * Miss 1: 💡 hint (`hint_eg` else `do_eg`) + 2 chips.
 * Miss 2+: full sentence chip; beat marked assisted when learner sends it.
 */
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

// ---------------------------------------------------------------------------
// Advance + end
// ---------------------------------------------------------------------------

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

async function finishScene(
  events: RoleplayTurnEvent[],
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  deps: RoleplayEngineDeps,
): Promise<void> {
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
  if (deps.progressWriter) {
    await creditRoleplayItems({
      situation,
      sessionId: state.id,
      day: situation.recommended_day,
      assisted: assistedCount > alone,
      write: deps.progressWriter,
    });
  }
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

// ---------------------------------------------------------------------------
// Actor call (buffer → guard → bubble)
// ---------------------------------------------------------------------------

async function resolveCharacterLine(opts: {
  deps: RoleplayEngineDeps;
  situation: RoleplaySituation;
  state: RoleplaySessionState;
  current: RoleplayStep;
  next: RoleplayStep | null;
  codeDone: boolean;
  codeSlot: string | null;
  learnerText: string;
  optionReply: { tl: string; ar: string } | null;
  stepReply: { tl: string; ar: string } | null;
  hitStay: boolean;
}): Promise<{
  line: { tl: string; ar: string };
  modelBeatDone: boolean;
  modelSlot: string | null;
  usedModel: boolean;
  usedFallback: boolean;
}> {
  const fallback = buildFileFallbackLines({
    situation: opts.situation,
    state: opts.state,
    current: opts.current,
    next: opts.next,
    optionReply: opts.optionReply,
    stepReply: opts.stepReply,
    beatDone: opts.codeDone,
    hitStay: opts.hitStay,
    closing: opts.codeDone && !opts.next && !opts.hitStay,
  });

  if (!opts.deps.actor) {
    return {
      line: fallback,
      modelBeatDone: false,
      modelSlot: null,
      usedModel: false,
      usedFallback: true,
    };
  }

  const prompt = buildRoleplayActorPrompt({
    situation: opts.situation,
    state: opts.state,
    current: opts.current,
    next: opts.next,
    codeDone: opts.codeDone,
    codeSlot: opts.codeSlot,
    learnerText: opts.learnerText,
  });

  opts.state.model_calls += 1;
  const generated = await opts.deps.actor.generate(prompt);
  if (generated.timedOut || !generated.text.trim()) {
    return {
      line: fallback,
      modelBeatDone: false,
      modelSlot: null,
      usedModel: true,
      usedFallback: true,
    };
  }

  const parsed = parseRoleplayActorOutput(generated.text);
  const guard = guardRoleplayActorTurn({
    tl: parsed.tl,
    situation: opts.situation,
  });
  if (!guard.ok) {
    return {
      line: fallback,
      modelBeatDone: false,
      modelSlot: null,
      usedModel: true,
      usedFallback: true,
    };
  }

  let tl = parsed.tl.trim();
  let ar = parsed.ar.trim();
  let modelBeatDone = false;
  let modelSlot: string | null = null;

  if (
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
      // Invalid slot → reject BEAT: done (treat as open).
    } else {
      modelBeatDone = true;
    }
  }

  const beatDone = opts.codeDone || modelBeatDone;
  if (beatDone && !opts.hitStay) {
    // If the model didn't move on, append next says / closing.
    const nextSays = opts.next
      ? characterSays(opts.next, opts.state.gender, opts.state.learner_name)
      : pickLine(opts.situation.closing, opts.state.gender);
    if (nextSays) {
      const already =
        normalizeRoleplayText(tl).includes(
          normalizeRoleplayText(nextSays.tl).slice(0, 12),
        ) || tl.includes(nextSays.tl.slice(0, 8));
      if (!already) {
        tl = `${tl} ${nextSays.tl}`.trim();
        if (nextSays.ar) ar = `${ar} ${nextSays.ar}`.trim();
      }
    }
  }

  return {
    line: { tl, ar },
    modelBeatDone,
    modelSlot,
    usedModel: true,
    usedFallback: false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open / resume. Fresh start: first says only (no intro card).
 * Resume: «كنا فين», replay last character bubble.
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
 * Process one learner turn: matcher (code) → buffered actor → guards →
 * one character bubble. Correction + progress credit on every path.
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

  // 1. Side channel first.
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
    return finishTurn(events, situation, state);
  }

  if (input.help || side.kind === 'help') {
    applyHelpLadder(events, state, current);
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

  // Correction on every learner turn (model + fallback).
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

  const first = hits[0] ?? null;
  const codeDone = Boolean(first && !first.stay);
  const hitStay = Boolean(first?.stay);

  // Apply code slots first (matcher wins when sure).
  if (first) {
    for (const h of hits) {
      if (h.slot && h.slot_value) state.slots[h.slot] = h.slot_value;
    }
  }

  // Look-ahead completions for state (code-owned).
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

  // After look-ahead, find next beat for the prompt / append.
  let lastCompletedId = firstStep.id;
  for (const h of lookaheadHits) {
    if (!h.stay) lastCompletedId = h.step_id;
  }
  const provisionalSlots = { ...state.slots };
  let nextForPrompt: RoleplayStep | null = null;
  if (codeDone || hitStay) {
    if (hitStay) {
      nextForPrompt = firstStep;
    } else {
      // Simulate completing first (+ look-ahead) for next-beat prompt.
      const pretend = {
        ...state,
        alone_steps: [...state.alone_steps, firstStep.id],
        slots: provisionalSlots,
      };
      for (const h of lookaheadHits) {
        if (!h.stay && !pretend.alone_steps.includes(h.step_id)) {
          pretend.alone_steps.push(h.step_id);
        }
      }
      nextForPrompt = nextPlayableAfter(
        situation,
        pretend,
        lastCompletedId,
      );
    }
  } else {
    nextForPrompt = nextPlayableAfter(situation, state, current.id);
    // Still on current — next is the following beat after current if we finish.
    const afterCurrent = remainingPlayableSteps(
      situation,
      state.slots,
      current.id,
    ).filter((s) => s.id !== current.id);
    nextForPrompt = afterCurrent[0] ?? null;
  }

  const codeSlot =
    first?.slot_value ??
    (first?.slot ? state.slots[first.slot] : null) ??
    null;

  const resolved = await resolveCharacterLine({
    deps,
    situation,
    state,
    current: firstStep,
    next: hitStay ? null : nextForPrompt,
    codeDone,
    codeSlot,
    learnerText: text,
    optionReply,
    stepReply,
    hitStay,
  });

  // Model BEAT: can complete when code didn't (real attempt + valid slot).
  let beatDone = codeDone;
  if (!beatDone && resolved.modelBeatDone) {
    beatDone = true;
    if (resolved.modelSlot && firstStep.expects.slot) {
      state.slots[firstStep.expects.slot] = resolved.modelSlot;
    }
  }

  // Emit one character bubble.
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
    // Reply but keep step open — not a miss.
    return finishTurn(events, situation, state, correctionPromise);
  }

  if (!beatDone) {
    // No progress — hints when stuck (2 turns / this miss ladder).
    applyHelpLadder(events, state, current);
    return finishTurn(events, situation, state, correctionPromise);
  }

  // Complete first step (+ look-ahead).
  state.misses[firstStep.id] = 0;
  await markStepComplete(state, firstStep.id, assistActive);

  for (const h of lookaheadHits) {
    if (h.stay) {
      state.current_step_id = h.step_id;
      return finishTurn(events, situation, state, correctionPromise);
    }
    await markStepComplete(state, h.step_id, false);
    lastCompletedId = h.step_id;
  }

  const next = nextPlayableAfter(situation, state, lastCompletedId);
  if (!next) {
    // Closing already in the bubble when fallback/model appended it.
    await finishScene(events, state, situation, deps);
    return finishTurn(events, situation, state, correctionPromise);
  }

  state.current_step_id = next.id;
  return finishTurn(events, situation, state, correctionPromise);
}
