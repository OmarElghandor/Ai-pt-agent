import { isOpenTopicId } from '@/lib/v2/convo/topics/openTopic';

/** True when the session has any goals — always takes the goal path (v4 V1). */
export function sessionHasGoals(session: {
  goals?: ReadonlyArray<unknown> | null;
}): boolean {
  return (session.goals?.length ?? 0) > 0;
}

/**
 * Open-mode (fallback bank / FRAME-HINT) only when there are no goals.
 * A session with goals never takes this path, whatever the topic id.
 */
export function sessionInOpenMode(
  session: {
    goals?: ReadonlyArray<unknown> | null;
    free_step?: { kind?: string } | null;
  },
  topic: { id: string },
): boolean {
  if (sessionHasGoals(session)) return false;
  return (
    isOpenTopicId(topic.id) || session.free_step?.kind === 'open'
  );
}

/** Open API/UI flag: goals force closed (open_mode: false). */
export function startResponseIsOpenMode(opts: {
  hasGoals: boolean;
  topicId: string;
  isLessonDay: boolean;
  freeStepKind?: string | null;
}): boolean {
  if (opts.hasGoals) return false;
  return (
    (isOpenTopicId(opts.topicId) && !opts.isLessonDay) ||
    opts.freeStepKind === 'open'
  );
}
