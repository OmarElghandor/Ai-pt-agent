import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  countLessonStatuses,
  imageCapLimitFromEnv,
} from '../lib/v2/admin/dashboardSummary';

const root = join(__dirname, '..');

describe('admin dashboard D1 · lesson counts', () => {
  it('matches seeded statuses for published / review / failed / missing', () => {
    const planDays = [1, 2, 3, 4, 5];
    const counts = countLessonStatuses(planDays, [
      { day: 1, status: 'published' },
      { day: 2, status: 'reviewed' },
      { day: 3, status: 'draft', flagged: true },
      { day: 4, status: 'draft', prepare_error_eg: 'فشل التجهيز' },
      // day 5 missing
    ]);
    assert.deepEqual(counts, {
      published: 1,
      ready_for_review: 1,
      failed: 2,
      not_generated: 1,
    });
  });

  it('treats plain drafts as ready_for_review', () => {
    const counts = countLessonStatuses([1], [{ day: 1, status: 'draft' }]);
    assert.equal(counts.ready_for_review, 1);
    assert.equal(counts.failed, 0);
  });
});

describe('admin dashboard D1 · image cap env', () => {
  it('reads CUSTOM_DECK_IMAGE_DAILY_LIMIT or null', () => {
    assert.equal(imageCapLimitFromEnv({}), null);
    assert.equal(
      imageCapLimitFromEnv({ CUSTOM_DECK_IMAGE_DAILY_LIMIT: '40' }),
      40,
    );
    assert.equal(
      imageCapLimitFromEnv({ CUSTOM_DECK_IMAGE_DAILY_LIMIT: 'nope' }),
      null,
    );
  });
});

describe('admin dashboard D1 · routes and gate', () => {
  it('summary API calls denyUnlessV2Admin first', () => {
    const src = readFileSync(
      join(root, 'app/api/v2/admin/dashboard/summary/route.ts'),
      'utf8',
    );
    assert.match(src, /denyUnlessV2Admin/);
    const gate = src.indexOf('await denyUnlessV2Admin()');
    assert.ok(gate >= 0, 'missing await denyUnlessV2Admin()');
    const bodyStart = src.indexOf('{', src.indexOf('export async function GET'));
    assert.ok(bodyStart >= 0);
    assert.ok(gate > bodyStart, 'gate must run inside GET');
    assert.ok(src.indexOf('loadDashboardSummary', gate) > gate);
  });

  it('admin layout still refuses non-admins', () => {
    const src = readFileSync(
      join(root, 'app/(v2)/v2-admin/layout.tsx'),
      'utf8',
    );
    assert.match(src, /role !== 'admin'/);
    assert.match(src, /AdminShell/);
  });

  it('lessons console lives at /v2-admin/lessons and home is separate', () => {
    const lessons = readFileSync(
      join(root, 'app/(v2)/v2-admin/lessons/page.tsx'),
      'utf8',
    );
    const home = readFileSync(
      join(root, 'app/(v2)/v2-admin/page.tsx'),
      'utf8',
    );
    assert.match(lessons, /v2-admin\/lessons/);
    assert.match(home, /AdminHome/);
    assert.doesNotMatch(home, /prepare\/range/);
  });

  it('shell is RTL with the §2.1 rail labels', () => {
    const src = readFileSync(
      join(root, 'components/v2/admin/AdminShell.tsx'),
      'utf8',
    );
    assert.match(src, /dir="rtl"/);
    for (const label of [
      'الرئيسية',
      'الدروس',
      'الكروت',
      'الصور',
      'الشغل',
      'التكلفة',
      'المكتبة',
      'الشخصيات',
    ]) {
      assert.match(src, new RegExp(label));
    }
  });

  it('new dashboard pages exist under v2-admin', () => {
    const pages = [
      'app/(v2)/v2-admin/page.tsx',
      'app/(v2)/v2-admin/lessons/page.tsx',
      'app/(v2)/v2-admin/cards/page.tsx',
      'app/(v2)/v2-admin/images/page.tsx',
      'app/(v2)/v2-admin/jobs/page.tsx',
      'app/(v2)/v2-admin/cost/page.tsx',
    ];
    for (const p of pages) {
      assert.ok(statSync(join(root, p)).isFile(), p);
    }
  });

  it('§0c and 15 doc are in the pack', () => {
    const decisions = readFileSync(
      join(root, 'docs/az-talkie-v2/00-decisions.md'),
      'utf8',
    );
    const fifteen = readFileSync(
      join(root, 'docs/az-talkie-v2/15-admin-dashboard.md'),
      'utf8',
    );
    const readme = readFileSync(
      join(root, 'docs/az-talkie-v2/README.md'),
      'utf8',
    );
    assert.match(decisions, /## 0c\. Admin dashboard/);
    assert.match(fifteen, /Admin dashboard/);
    assert.match(readme, /15-admin-dashboard\.md/);
  });
});
