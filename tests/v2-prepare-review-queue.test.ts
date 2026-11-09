import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyReviewItem } from '@/lib/v2/generation/prepare/reviewQueue';

describe('classifyReviewItem', () => {
  it('flags blocked drafts as needs_review', () => {
    const item = classifyReviewItem({
      day: 34,
      target_lang: 'pt-PT',
      version: 1,
      status: 'draft',
      meta: {
        issues: [
          {
            rule: 'core_id_missing',
            severity: 'error',
            path: 'x',
            message: 'missing',
          },
        ],
      },
    });
    assert.ok(item);
    assert.equal(item!.kind, 'needs_review');
  });

  it('flags unchecked auto_published lessons', () => {
    const item = classifyReviewItem({
      day: 35,
      target_lang: 'pt-PT',
      version: 2,
      status: 'published',
      meta: {
        auto_published: true,
        auto_published_checked: false,
      },
    });
    assert.ok(item);
    assert.equal(item!.kind, 'auto_published');
  });

  it('skips checked auto_published', () => {
    const item = classifyReviewItem({
      day: 35,
      target_lang: 'pt-PT',
      version: 2,
      status: 'published',
      meta: {
        auto_published: true,
        auto_published_checked: true,
      },
    });
    assert.equal(item, null);
  });
});
