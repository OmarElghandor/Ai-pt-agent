import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUTH_USER_COLLECTIONS,
  USER_KEYED_V2_COLLECTIONS,
} from '../lib/v2/auth/userKeyedCollections';

describe('account deletion collection list', () => {
  it('covers every user-keyed learner collection plus auth tables', () => {
    const all = new Set<string>([
      ...USER_KEYED_V2_COLLECTIONS,
      ...AUTH_USER_COLLECTIONS,
    ]);
    for (const name of [
      'v2_item_state',
      'v2_sessions',
      'v2_convo_sessions',
      'v2_errors',
      'v2_answer_idempotency',
      'v2_reports',
      'v2_topic_requests',
      'v2_users',
      'v2_auth_sessions',
      'v2_auth_accounts',
    ]) {
      assert.ok(all.has(name), `missing ${name}`);
    }
  });
});
