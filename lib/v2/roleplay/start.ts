import { playableSteps } from './playable';
import { loadRoleplaySituation } from './load';
import {
  createRoleplaySessionState,
  type RoleplaySessionState,
} from './session';
import { startRoleplayScene } from './engine';
import type { RoleplayTurnEvent } from './events';
import {
  newRoleplaySessionId,
  type RoleplaySessionStore,
} from './store';
import type { RoleplayGender } from './text';

export type StartRoleplayInput = {
  userId: string;
  situationId: string;
  gender?: RoleplayGender;
  learnerName?: string | null;
  /** Resume an existing session id when provided. */
  sessionId?: string;
  /**
   * When false, always open a fresh session (abandon any active for this
   * situation). When true, resume an active session. When omitted, resume if
   * an active session exists (legacy).
   */
  resume?: boolean;
  store: RoleplaySessionStore;
};

export type StartRoleplayResult = {
  state: RoleplaySessionState;
  events: RoleplayTurnEvent[];
  resumed: boolean;
};

async function abandonActive(
  store: RoleplaySessionStore,
  userId: string,
  situationId: string,
): Promise<void> {
  const active = await store.findActive(userId, situationId);
  if (!active) return;
  active.status = 'done';
  active.updated_at = new Date().toISOString();
  await store.save(active);
}

export async function startRoleplaySession(
  input: StartRoleplayInput,
): Promise<StartRoleplayResult> {
  const situation = loadRoleplaySituation(input.situationId);
  const gender = input.gender ?? 'm';

  const wantResume = input.resume === true;
  const wantFresh = input.resume === false;

  if (!wantFresh) {
    if (input.sessionId) {
      const existing = await input.store.get(input.sessionId, input.userId);
      if (existing && existing.status === 'active') {
        const { state, events } = startRoleplayScene({
          situation,
          state: existing,
          resume: true,
        });
        await input.store.save(state);
        return { state, events, resumed: true };
      }
    }

    if (wantResume || input.resume === undefined) {
      const active = await input.store.findActive(
        input.userId,
        input.situationId,
      );
      if (active) {
        const { state, events } = startRoleplayScene({
          situation,
          state: active,
          resume: true,
        });
        await input.store.save(state);
        return { state, events, resumed: true };
      }
    }
  } else {
    await abandonActive(input.store, input.userId, input.situationId);
  }

  const playable = playableSteps(situation, {});
  if (!playable.length) {
    throw new Error(`no playable steps for ${input.situationId}`);
  }

  const state = createRoleplaySessionState({
    id: newRoleplaySessionId(),
    user_id: input.userId,
    situation_id: situation.id,
    first_step_id: playable[0].id,
    gender,
    learner_name: input.learnerName ?? null,
  });
  const started = startRoleplayScene({ situation, state, resume: false });
  await input.store.save(started.state);
  return { state: started.state, events: started.events, resumed: false };
}
