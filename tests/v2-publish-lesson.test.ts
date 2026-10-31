import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isBlockedForPublish } from '../lib/v2/generation/lesson/issueResolve';

describe('publishLesson gate helpers', () => {
  it('isBlockedForPublish blocks unresolved high critic issues', () => {
    assert.equal(
      isBlockedForPublish({
        critic_issues: [
          {
            path: 'blocks[0]',
            message: 'bad',
            severity: 'high',
            page_index: 0,
          },
        ],
      }),
      true,
    );
  });

  it('setLessonStatus refuses published (type + runtime message)', async () => {
    const { setLessonStatus } = await import(
      '../lib/v2/generation/lesson/save'
    );
    await assert.rejects(
      () =>
        setLessonStatus({
          day: 1,
          // @ts-expect-error published must go through publishLesson
          status: 'published',
        }),
      /refuses 'published'|MongoDB not configured/,
    );
  });
});
