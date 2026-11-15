import type { RoleplayActor } from './actor';
import { runRoleplayTurn, startRoleplayScene } from './engine';
import { playableSteps } from './playable';
import {
  createRoleplaySessionState,
  type RoleplaySessionState,
} from './session';
import { pickChips } from './text';
import type { RoleplaySituation } from './types';
import type { RoleplayTurnEvent } from './events';

export type ScriptTurn = {
  text: string;
  help?: boolean;
  /** Chip tap — skips the free-text correction. */
  assisted?: boolean;
};

export type ScriptResult = {
  state: RoleplaySessionState;
  events: RoleplayTurnEvent[];
  modelCalls: number;
};

/**
 * Run a scripted sequence of learner turns (delays are 0 — engine has none).
 * Pass `actor` for stub-model goldens; omit for file-fallback path.
 */
export async function runRoleplayScript(opts: {
  situation: RoleplaySituation;
  turns: ScriptTurn[];
  gender?: 'm' | 'f';
  actor?: RoleplayActor;
}): Promise<ScriptResult> {
  const playable = playableSteps(opts.situation, {});
  let state = createRoleplaySessionState({
    id: `script-${opts.situation.id}`,
    user_id: 'script',
    situation_id: opts.situation.id,
    first_step_id: playable[0].id,
    gender: opts.gender ?? 'm',
  });
  const started = startRoleplayScene({
    situation: opts.situation,
    state,
  });
  state = started.state;
  const allEvents: RoleplayTurnEvent[] = [...started.events];

  for (const turn of opts.turns) {
    const r = await runRoleplayTurn(
      {
        situation: opts.situation,
        state,
        learnerText: turn.text,
        help: turn.help,
        assisted: turn.assisted,
      },
      {
        ...(opts.actor ? { actor: opts.actor } : {}),
      },
    );
    state = r.state;
    allEvents.push(...r.events);
  }

  return {
    state,
    events: allEvents,
    modelCalls: state.model_calls,
  };
}

/** Finish a situation using only the first help chip each step. */
export async function finishWithChips(opts: {
  situation: RoleplaySituation;
  maxTurns?: number;
}): Promise<ScriptResult> {
  const maxTurns = opts.maxTurns ?? 40;
  const playable = playableSteps(opts.situation, {});
  let state = createRoleplaySessionState({
    id: `chips-${opts.situation.id}`,
    user_id: 'chips',
    situation_id: opts.situation.id,
    first_step_id: playable[0].id,
  });
  state = startRoleplayScene({ situation: opts.situation, state }).state;
  const allEvents: RoleplayTurnEvent[] = [];
  let turns = 0;

  while (
    state.status === 'active' &&
    state.current_step_id &&
    !state.task_done &&
    turns < maxTurns
  ) {
    turns += 1;
    const step = opts.situation.steps.find((s) => s.id === state.current_step_id);
    if (!step) break;
    const chips = pickChips(step.help.chips ?? [], step.help.chips_f, 'm');
    let text = chips[0];
    if (!text) {
      if (step.expects.free_answer) text = 'Omar';
      else if (step.expects.examples_tl[0]) text = step.expects.examples_tl[0];
      else text = 'Sim.';
    }
    const r = await runRoleplayTurn({
      situation: opts.situation,
      state,
      learnerText: text,
      assisted: true,
    });
    state = r.state;
    allEvents.push(...r.events);
  }

  if (state.status === 'active' && state.task_done) {
    const bye = await runRoleplayTurn({
      situation: opts.situation,
      state,
      learnerText: 'Adeus!',
    });
    state = bye.state;
    allEvents.push(...bye.events);
  }

  return { state, events: allEvents, modelCalls: state.model_calls };
}

export function characterStepIds(events: RoleplayTurnEvent[]): string[] {
  return events
    .filter((e): e is Extract<RoleplayTurnEvent, { type: 'character' }> => e.type === 'character')
    .map((e) => e.step_id)
    .filter((id): id is string => Boolean(id));
}

/** Character bubbles only (one per learner turn after start). */
export function characterBubbles(
  events: RoleplayTurnEvent[],
): Array<Extract<RoleplayTurnEvent, { type: 'character' }>> {
  return events.filter(
    (e): e is Extract<RoleplayTurnEvent, { type: 'character' }> =>
      e.type === 'character',
  );
}
