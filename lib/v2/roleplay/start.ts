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
import type { RoleplayTier } from './types';
import type { RoleplayGender } from './text';

export type StartRoleplayInput = {
  userId: string;
  situationId: string;
  tier: RoleplayTier;
  gender?: RoleplayGender;
  learnerName?: string | null;
  /** Resume an existing session id when provided. */
  sessionId?: string;
  store: RoleplaySessionStore;
};

export type StartRoleplayResult = {
  state: RoleplaySessionState;
  events: RoleplayTurnEvent[];
  resumed: boolean;
};

export async function startRoleplaySession(
  input: StartRoleplayInput,
): Promise<StartRoleplayResult> {
  const situation = loadRoleplaySituation(input.situationId);
  const tier = input.tier;
  const gender = input.gender ?? 'm';

  if (input.sessionId) {
    const existing = await input.store.get(input.sessionId, input.userId);
    if (existing && existing.status === 'active') {
      const { state, events } = startRoleplayScene({
        situation,
        state: existing,
        resume: true,
      });
      return { state, events, resumed: true };
    }
  }

  const active = await input.store.findActive(
    input.userId,
    input.situationId,
    tier,
  );
  if (active) {
    const { state, events } = startRoleplayScene({
      situation,
      state: active,
      resume: true,
    });
    return { state, events, resumed: true };
  }

  const playable = playableSteps(situation, tier, {});
  if (!playable.length) {
    throw new Error(`no playable steps for ${input.situationId} tier ${tier}`);
  }

  const state = createRoleplaySessionState({
    id: newRoleplaySessionId(),
    user_id: input.userId,
    situation_id: situation.id,
    tier,
    first_step_id: playable[0].id,
    gender,
    learner_name: input.learnerName ?? null,
  });
  const started = startRoleplayScene({ situation, state, resume: false });
  await input.store.save(started.state);
  return { state: started.state, events: started.events, resumed: false };
}
