import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isBlockedForPublish,
  mergeCriticIssues,
  pathsMatch,
  recomputeFlaggedAfterLangCheck,
  resolveCriticIssuesByPatches,
} from '../lib/v2/generation/lesson/issueResolve';

describe('pathsMatch', () => {
  it('matches pages[N] patch to page-local critic path', () => {
    assert.equal(
      pathsMatch(
        'pages[3].blocks[0].lines[3].tl',
        'blocks[0].lines[3].tl',
        3,
      ),
      true,
    );
  });

  it('rejects wrong page index', () => {
    assert.equal(
      pathsMatch(
        'pages[2].blocks[0].lines[3].tl',
        'blocks[0].lines[3].tl',
        3,
      ),
      false,
    );
  });

  it('matches identical suffixes', () => {
    assert.equal(
      pathsMatch('items[pattern.x.ex.1].tl', 'items[pattern.x.ex.1].tl'),
      true,
    );
  });
});

describe('resolveCriticIssuesByPatches', () => {
  it('marks matching highs resolved_by lang_check', () => {
    const issues = mergeCriticIssues(undefined, 3, [
      {
        path: 'blocks[0].lines[3].tl',
        message: 'bad reply',
        severity: 'high',
      },
      {
        path: 'blocks[1].tip',
        message: 'tip nit',
        severity: 'low',
      },
    ]);
    const next = resolveCriticIssuesByPatches(issues, [
      'pages[3].blocks[0].lines[3].tl',
    ]);
    assert.equal(next[0]!.resolved_by, 'lang_check');
    assert.equal(next[1]!.resolved_by, undefined);
  });
});

describe('isBlockedForPublish + recomputeFlagged', () => {
  it('blocks on unresolved high critic', () => {
    assert.equal(
      isBlockedForPublish({
        flagged: true,
        critic_issues: [
          {
            path: 'blocks[0].tl',
            message: 'x',
            severity: 'high',
            page_index: 0,
          },
        ],
      }),
      true,
    );
  });

  it('allows publish when highs are resolved_by lang_check', () => {
    assert.equal(
      isBlockedForPublish({
        flagged: false,
        critic_issues: [
          {
            path: 'blocks[0].lines[0].tl',
            message: 'x',
            severity: 'high',
            page_index: 0,
            resolved_by: 'lang_check',
          },
        ],
        lang_check: { discarded: [] },
      }),
      false,
    );
  });

  it('still blocks when lang_check discarded patches', () => {
    assert.equal(
      isBlockedForPublish({
        flagged: false,
        critic_issues: [],
        lang_check: { discarded: [{ path: 'x' }] },
      }),
      true,
    );
  });

  it('recomputeFlagged clears after resolve with no discards', () => {
    const resolved = resolveCriticIssuesByPatches(
      [
        {
          path: 'blocks[0].lines[0].tl',
          message: 'x',
          severity: 'high',
          page_index: 1,
        },
      ],
      ['pages[1].blocks[0].lines[0].tl'],
    );
    assert.equal(
      recomputeFlaggedAfterLangCheck({
        critic_issues: resolved,
        discardedCount: 0,
      }),
      false,
    );
  });
});
