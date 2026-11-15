import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pathTileStatus } from '../lib/v2/progress/learnerPath';

describe('S4 · path tiles from server status', () => {
  it('a day with only practice in session storage is not shown as done', () => {
    // Session storage is irrelevant: status comes only from learner_status.
    const status = pathTileStatus({
      learner_status: 'in_progress',
      bakra: false,
      href: '/day/3',
      status: 'available',
    });
    assert.notEqual(status, 'done');
    assert.equal(
      pathTileStatus({
        learner_status: 'completed',
        bakra: false,
        href: '/day/3',
        status: 'available',
      }),
      'done',
    );
  });
});
