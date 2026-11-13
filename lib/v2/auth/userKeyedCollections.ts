/**
 * Every Mongo collection that stores learner-personal data keyed by v2 user id.
 * Account deletion and the user-id migration must both use this list.
 * If you add a new user-keyed `v2_*` collection, add it here — tests will fail otherwise.
 */
export const USER_KEYED_V2_COLLECTIONS = [
  'v2_item_state',
  'v2_sessions',
  'v2_convo_sessions',
  'v2_errors',
  'v2_answer_idempotency',
  'v2_reports',
  'v2_topic_requests',
  'v2_lesson_progress',
  'v2_weak_spots',
  'v2_card_decks',
  'v2_activity_days',
  'v2_problem_requests',
  'v2_progress_event_idempotency',
  'v2_user_decks',
  'v2_deck_reports',
  'v2_custom_deck_jobs',
] as const;

export type UserKeyedV2Collection = (typeof USER_KEYED_V2_COLLECTIONS)[number];

/** Auth tables owned by Better Auth (deleted with the user via Better Auth / explicit wipe). */
export const AUTH_USER_COLLECTIONS = [
  'v2_users',
  'v2_auth_sessions',
  'v2_auth_accounts',
  'v2_auth_verifications',
] as const;

/** Field name used for the learner id in USER_KEYED_V2_COLLECTIONS. */
export const USER_ID_FIELD = 'user_id' as const;
