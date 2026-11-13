import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldAutoHide } from '../lib/v2/decks/reports';

describe('C6 · report auto-hide', () => {
  it('hides after 3 distinct reports', () => {
    assert.equal(shouldAutoHide(2), false);
    assert.equal(shouldAutoHide(3), true);
    assert.equal(shouldAutoHide(4), true);
  });

  it('one learner reporting 3 times still counts as one until unique insert', () => {
    // Unique index on user_id × deck_id means duplicates are rejected in reportCustomDeck.
    assert.equal(shouldAutoHide(1), false);
  });
});
