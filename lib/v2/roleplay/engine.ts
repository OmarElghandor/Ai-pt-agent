import {
  shouldFireFreeTextCorrection,
  startFreeTextCorrection,
} from '@/lib/v2/convo/correction';
import type { ConvoProgressWriter } from '@/lib/v2/convo/progress/mirror';
import type { FreeTextCorrection } from '@/lib/v2/grader';
import type { RoleplayTurnEvent } from './events';
import { matchRoleplayWithLookahead } from './match';
import { fuzzyMatchRoleplayExample } from './match';
import { playableSteps, remainingPlayableSteps } from './playable';
import { creditRoleplayItems } from './progress';
import type { RoleplaySessionState } from './session';
import { handleRoleplaySideChannel } from './sideChannel';
import {
  applyLearnerName,
  characterSaysForTier,
  pickChips,
  pickLine,
} from './text';
import type { RoleplaySituation, RoleplayStep, RoleplayTier } from './types';

const CONFUSION_LINES = [
  { tl: 'Desculpe?', ar: 'عذرًا؟' },
  { tl: 'Como?', ar: 'كيف؟' },
] as const;

export type RoleplayEngineDeps = {
  /** Optional progress writer — never required for pure turns. */
  progressWriter?: ConvoProgressWriter;
  /** Optional model reaction (R7). Default: never called. */
  modelReaction?: (input: {
    situation: RoleplaySituation;
    step: RoleplayStep;
    learnerText: string;
    lastExchanges: RoleplaySessionState['exchanges'];
  }) => Promise<string | null>;
  /** When true, allow modelReaction at tier 3. */
  modelReactionsEnabled?: boolean;
  /** Pace delays are 0 in tests (UI concern); engine is sync aside from hooks. */
  now?: () => Date;
};

export type RoleplayTurnInput = {
  situation: RoleplaySituation;
  state: RoleplaySessionState;
  learnerText: string;
  /** Explicit help button. */
  help?: boolean;
  learner_turn_id?: string;
  /** Chip / assist path — skip correction. */
  assisted?: boolean;
};

export type RoleplayTurnResult = {
  state: RoleplaySessionState;
  events: RoleplayTurnEvent[];
  /** Pending correction promise (flush before done in API layer). */
  correctionPromise?: Promise<FreeTextCorrection | null>;
};

function arHiddenForTier(tier: RoleplayTier): boolean {
  return tier >= 2;
}

function progressEvent(
  situation: RoleplaySituation,
  state: RoleplaySessionState,
): RoleplayTurnEvent {
  const playable = playableSteps(situation, state.tier, state.slots);
  const done =
    state.alone_steps.length + state.assisted_steps.length;
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
      tier: state.tier,
      current_step_id: state.current_step_id,
      slots: { ...state.slots },
      status: state.status,
      alone_steps: [...state.alone_steps],
      assisted_steps: [...state.assisted_steps],
      key_phrases_said: [...state.key_phrases_said],
      model_calls: state.model_calls,
    },
  };
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

function emitSays(
  events: RoleplayTurnEvent[],
  step: RoleplayStep,
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  opts?: { slow?: boolean; forceCoach?: boolean },
): void {
  const says = characterSaysForTier(
    step,
    state.tier,
    state.gender,
    state.learner_name,
  );
  if (!says) return;
  const showCoach =
    Boolean(step.coach_eg) &&
    (state.tier === 1 || opts?.forceCoach);
  events.push({
    type: 'character',
    tl: says.tl,
    ar: says.ar,
    step_id: step.id,
    ar_hidden: arHiddenForTier(state.tier),
    ...(showCoach && step.coach_eg ? { coach_eg: step.coach_eg } : {}),
    audio_key: `roleplay:${situation.id}:${step.id}:says`,
    playback: opts?.slow
      ? 'slow'
      : state.tier === 1
        ? 'slow'
        : 'normal',
    ...(step.speaker ? { speaker: step.speaker } : {}),
  });
  state.exchanges.push({
    role: 'character',
    tl: says.tl,
    ar: says.ar,
    step_id: step.id,
  });
}

function emitReply(
  events: RoleplayTurnEvent[],
  reply: { tl: string; ar: string },
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  stepId: string,
): void {
  const tl = applyLearnerName(reply.tl, state.learner_name);
  const ar = applyLearnerName(reply.ar, state.learner_name);
  events.push({
    type: 'character',
    tl,
    ar,
    step_id: stepId,
    ar_hidden: arHiddenForTier(state.tier),
    audio_key: `roleplay:${situation.id}:${stepId}:reply`,
    playback: state.tier === 1 ? 'slow' : 'normal',
  });
  state.exchanges.push({ role: 'character', tl, ar, step_id: stepId });
}

function helpPayload(
  step: RoleplayStep,
  state: RoleplaySessionState,
  miss: number,
): RoleplayTurnEvent {
  const chips = pickChips(
    step.help.chips ?? [],
    step.help.chips_f,
    state.gender,
  );
  return {
    type: 'help',
    frame_tl: step.help.frame_tl,
    eg: step.help.eg,
    chips,
    miss,
  };
}

function chipsVisible(
  tier: RoleplayTier,
  miss: number,
  helpRequested: boolean,
): boolean {
  if (tier === 1) return true;
  if (tier === 2) return miss >= 1 || helpRequested;
  // tier 3: only via ساعدني
  return helpRequested || miss >= 2;
}

async function applyHelpLadder(
  events: RoleplayTurnEvent[],
  state: RoleplaySessionState,
  situation: RoleplaySituation,
  step: RoleplayStep,
  helpRequested: boolean,
  deps: RoleplayEngineDeps,
): Promise<'stayed' | 'assisted'> {
  const miss = (state.misses[step.id] ?? 0) + 1;
  state.misses[step.id] = miss;

  if (miss >= 3) {
    const chips = pickChips(
      step.help.chips ?? [],
      step.help.chips_f,
      state.gender,
    );
    const full =
      chips[0] ||
      step.expects.examples_tl[0] ||
      step.help.frame_tl;
    events.push({
      type: 'coach',
      eg: `قول كده: ${full}`,
      moment: 'assist',
      chips: [full],
      frame_tl: full,
    });
    state.exchanges.push({ role: 'coach', eg: `قول كده: ${full}`, step_id: step.id });
    // Mark assisted and advance as if they said it.
    if (!state.assisted_steps.includes(step.id)) {
      state.assisted_steps.push(step.id);
    }
    await advanceAfterStep({
      events,
      state,
      situation,
      step,
      hitStay: false,
      optionReply: null,
      stepReply: pickLine(step.reply, state.gender),
      assisted: true,
      deps,
      lookaheadHits: [],
    });
    return 'assisted';
  }

  if (miss === 1 && state.tier >= 2 && !helpRequested) {
    const line = CONFUSION_LINES[0];
    events.push({
      type: 'character',
      tl: line.tl,
      ar: line.ar,
      step_id: step.id,
      ar_hidden: arHiddenForTier(state.tier),
      audio_key: `roleplay:${situation.id}:${step.id}:confusion`,
    });
    state.exchanges.push({
      role: 'character',
      tl: line.tl,
      ar: line.ar,
      step_id: step.id,
    });
    emitSays(events, step, state, situation, { forceCoach: true });
    return 'stayed';
  }

  // Miss 1 at tier 1, or miss 2, or help button: frame + chips when allowed.
  if (chipsVisible(state.tier, miss, helpRequested) || state.tier === 1) {
    events.push(helpPayload(step, state, miss));
    if (step.coach_eg && state.tier >= 2) {
      events.push({
        type: 'coach',
        eg: step.coach_eg,
        moment: 'coach_after_miss',
      });
    }
  } else if (state.tier === 3 && miss === 1) {
    const line = CONFUSION_LINES[0];
    events.push({
      type: 'character',
      tl: line.tl,
      ar: line.ar,
      step_id: step.id,
      ar_hidden: true,
    });
    emitSays(events, step, state, situation, { forceCoach: true });
  }

  return 'stayed';
}

async function advanceAfterStep(opts: {
  events: RoleplayTurnEvent[];
  state: RoleplaySessionState;
  situation: RoleplaySituation;
  step: RoleplayStep;
  hitStay: boolean;
  optionReply: { tl: string; ar: string } | null;
  stepReply: { tl: string; ar: string } | null;
  assisted: boolean;
  deps: RoleplayEngineDeps;
  lookaheadHits: Array<{
    step: RoleplayStep;
    optionReply: { tl: string; ar: string } | null;
    stepReply: { tl: string; ar: string } | null;
    stay: boolean;
  }>;
}): Promise<void> {
  const {
    events,
    state,
    situation,
    step,
    hitStay,
    optionReply,
    stepReply,
    assisted,
    deps,
  } = opts;

  if (hitStay) {
    if (optionReply) {
      emitReply(events, optionReply, state, situation, step.id);
    }
    // Stay: keep current_step_id.
    return;
  }

  if (assisted) {
    if (!state.assisted_steps.includes(step.id)) {
      state.assisted_steps.push(step.id);
    }
  } else if (!state.alone_steps.includes(step.id)) {
    state.alone_steps.push(step.id);
  }

  // Option reply wins over step reply.
  const reply = optionReply ?? stepReply;
  if (reply) {
    emitReply(events, reply, state, situation, step.id);
  }

  if (deps.progressWriter) {
    await creditRoleplayItems({
      situation,
      sessionId: state.id,
      day: situation.recommended_day,
      assisted,
      write: deps.progressWriter,
      // Credit whole situation items once at end would over-count; credit none
      // per step unless we track — for now credit nothing mid-turn; end session
      // credits. Kept hook for future per-item mapping.
      itemIds: [],
    });
  }

  // Process look-ahead completions (reply only, no says).
  let lastStep = step;
  for (const la of opts.lookaheadHits) {
    if (la.stay) {
      if (la.optionReply) {
        emitReply(events, la.optionReply, state, situation, la.step.id);
      }
      state.current_step_id = la.step.id;
      return;
    }
    if (!state.alone_steps.includes(la.step.id)) {
      state.alone_steps.push(la.step.id);
    }
    const r = la.optionReply ?? la.stepReply;
    if (r) emitReply(events, r, state, situation, la.step.id);
    lastStep = la.step;
  }

  // Next playable step after last completed.
  const slots = state.slots;
  const remaining = remainingPlayableSteps(
    situation,
    state.tier,
    slots,
    lastStep.id,
  );
  // remaining starts at lastStep — always skip it and any already completed.
  const completed = new Set([
    ...state.alone_steps,
    ...state.assisted_steps,
    lastStep.id,
  ]);
  const next = remaining.find((s) => !completed.has(s.id));

  if (!next) {
    // Closing + done.
    const closing = pickLine(situation.closing, state.gender);
    if (closing) {
      emitReply(
        events,
        {
          tl: applyLearnerName(closing.tl, state.learner_name),
          ar: applyLearnerName(closing.ar, state.learner_name),
        },
        state,
        situation,
        'closing',
      );
    }
    state.current_step_id = null;
    state.status = 'done';
    const alone = state.alone_steps.length;
    const assistedCount = state.assisted_steps.length;
    const nextTier =
      state.tier < 3 ? ((state.tier + 1) as RoleplayTier) : null;
    events.push({
      type: 'result',
      tier: state.tier,
      star: state.tier,
      alone,
      assisted: assistedCount,
      key_phrases: [...state.key_phrases_said],
      corrections: [...state.corrections],
      summary_eg: situation.summary_eg,
      next_tier: nextTier,
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
    return;
  }

  state.current_step_id = next.id;
  emitSays(events, next, state, situation);
}

/**
 * Open / resume: emit current says + optional «كنا فين» on resume.
 */
export function startRoleplayScene(opts: {
  situation: RoleplaySituation;
  state: RoleplaySessionState;
  resume?: boolean;
}): RoleplayTurnResult {
  const { situation, state } = opts;
  const events: RoleplayTurnEvent[] = [];
  if (opts.resume && state.current_step_id) {
    events.push({
      type: 'coach',
      eg: 'كنا فين — نكمّل من هنا.',
      moment: 'resume',
    });
  }
  const step = situation.steps.find((s) => s.id === state.current_step_id);
  if (step) {
    emitSays(events, step, state, situation);
  }
  events.push(progressEvent(situation, state));
  events.push(sessionEvent(state));
  events.push({ type: 'done', finished: state.status === 'done' });
  return { state, events };
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
    tier: state.tier,
    gender: state.gender,
    characterName: characterName(situation),
  });

  const helpRequested = Boolean(input.help) || side.kind === 'help';

  if (side.kind === 'language' || side.kind === 'arabic_other') {
    events.push({
      type: 'coach',
      eg: side.eg,
      moment: side.kind,
    });
    state.exchanges.push({ role: 'coach', eg: side.eg });
    // Character waits.
    events.push(progressEvent(situation, state));
    events.push(sessionEvent(state));
    events.push({ type: 'done', finished: false });
    return { state, events };
  }

  if (helpRequested && !text) {
    await applyHelpLadder(events, state, situation, current, true, deps);
    events.push(progressEvent(situation, state));
    events.push(sessionEvent(state));
    events.push({ type: 'done', finished: false });
    return { state, events };
  }

  if (helpRequested && (side.kind === 'help' || input.help)) {
    // If they also typed Portuguese, still run help ladder when it's a help phrase.
    if (side.kind === 'help' || (input.help && !text)) {
      await applyHelpLadder(events, state, situation, current, true, deps);
      events.push(progressEvent(situation, state));
      events.push(sessionEvent(state));
      events.push({ type: 'done', finished: false });
      return { state, events };
    }
  }

  if (side.kind === 'help') {
    await applyHelpLadder(events, state, situation, current, true, deps);
    events.push(progressEvent(situation, state));
    events.push(sessionEvent(state));
    events.push({ type: 'done', finished: false });
    return { state, events };
  }

  // Learner Portuguese turn.
  state.exchanges.push({
    role: 'learner',
    tl: text,
    step_id: current.id,
  });
  noteKeyPhrases(state, situation, text);

  const remaining = remainingPlayableSteps(
    situation,
    state.tier,
    state.slots,
    state.current_step_id,
  );
  const hits = matchRoleplayWithLookahead(text, remaining);

  let correctionPromise: Promise<FreeTextCorrection | null> | undefined;
  if (
    shouldFireFreeTextCorrection({
      learnerText: text,
      assisted: Boolean(input.assisted),
      sideChannel: false,
    })
  ) {
    correctionPromise = startFreeTextCorrection({
      answer: text,
      character_tl: characterSaysForTier(
        current,
        state.tier,
        state.gender,
        state.learner_name,
      )?.tl,
      frame_tl: current.help.frame_tl,
      frame_chips: pickChips(
        current.help.chips ?? [],
        current.help.chips_f,
        state.gender,
      ),
    }).catch(() => null);
  }

  if (hits.length === 0) {
    // Off-script: help ladder; optional model reaction at tier 3.
    if (
      deps.modelReactionsEnabled &&
      state.tier === 3 &&
      deps.modelReaction
    ) {
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
    await applyHelpLadder(
      events,
      state,
      situation,
      current,
      Boolean(input.help),
      deps,
    );
    events.push(progressEvent(situation, state));
    events.push(sessionEvent(state));
    events.push({ type: 'done', finished: state.status === 'done' });
    return { state, events, correctionPromise };
  }

  const first = hits[0];
  // Apply slot from first (+ look-ahead) hits.
  for (const h of hits) {
    if (h.slot && h.slot_value) {
      state.slots[h.slot] = h.slot_value;
    }
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

  // Reset misses on success.
  state.misses[firstStep.id] = 0;

  await advanceAfterStep({
    events,
    state,
    situation,
    step: firstStep,
    hitStay: first.stay,
    optionReply,
    stepReply,
    assisted: Boolean(input.assisted),
    deps,
    lookaheadHits,
  });

  events.push(progressEvent(situation, state));
  events.push(sessionEvent(state));
  events.push({ type: 'done', finished: state.status === 'done' });
  return { state, events, correctionPromise };
}
