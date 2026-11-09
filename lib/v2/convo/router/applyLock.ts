import type { ConvoSession } from '@/lib/v2/convo/session/types';
import type { RouterDecision } from './types';

/** Apply a lock decision onto a session (mutates + returns). */
export function applyRouterLock(
  session: ConvoSession,
  decision: Extract<RouterDecision, { kind: 'lock' }>,
  opts?: { learnerLevel?: number },
): ConvoSession {
  session.topic_id = decision.topic_id === 'new' ? session.topic_id : decision.topic_id;
  session.topic_locked = true;
  session.teaching_mode = decision.teaching_mode;
  if (opts?.learnerLevel != null) session.learner_level = opts.learnerLevel;
  return session;
}
