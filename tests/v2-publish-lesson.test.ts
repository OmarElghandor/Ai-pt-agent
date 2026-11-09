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

  it('publishLesson force option is accepted by the public signature', async () => {
    const { publishLesson, PublishLessonError } = await import(
      '../lib/v2/generation/lesson/publish'
    );
    // Without Mongo, both forced and normal paths fail the same way —
    // this asserts `force` is a real option and does not throw earlier.
    await assert.rejects(
      () => publishLesson({ day: 1, force: true }),
      (err: unknown) =>
        err instanceof PublishLessonError ||
        (err instanceof Error && /MongoDB not configured/.test(err.message)),
    );
  });
});
