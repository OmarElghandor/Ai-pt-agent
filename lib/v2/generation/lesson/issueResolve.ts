import type { Issue } from '@/lib/v2/content/validate';
import type { CriticIssueRecord, GenerationMeta } from './save';

export type { CriticIssueRecord };

const PAGES_PREFIX_RE = /^pages\[(\d+)\]\./i;

/** Strip pages[N]. prefix; return { pageIndex, rest }. */
export function stripPagesPrefix(path: string): {
  pageIndex: number | null;
  rest: string;
} {
  const m = path.trim().match(PAGES_PREFIX_RE);
  if (!m) return { pageIndex: null, rest: path.trim() };
  return { pageIndex: Number(m[1]), rest: path.trim().slice(m[0].length) };
}

/**
 * Match a lang_check patch path to a critic issue path.
 * `pages[3].blocks[0].lines[3].tl` matches critic `blocks[0].lines[3].tl` on page 3.
 */
export function pathsMatch(
  patchPath: string,
  issuePath: string,
  pageIndex?: number,
): boolean {
  const patch = stripPagesPrefix(patchPath);
  const issue = stripPagesPrefix(issuePath);
  if (
    patch.pageIndex != null &&
    pageIndex != null &&
    patch.pageIndex !== pageIndex
  ) {
    return false;
  }
  if (
    patch.pageIndex != null &&
    issue.pageIndex != null &&
    patch.pageIndex !== issue.pageIndex
  ) {
    return false;
  }
  const a = patch.rest.toLowerCase();
  const b = issue.rest.toLowerCase();
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

/** Merge new page critic issues into the lesson list (replace that page's entries). */
export function mergeCriticIssues(
  prev: CriticIssueRecord[] | undefined,
  pageIndex: number,
  issues: Array<{
    path?: string;
    message: string;
    severity: 'high' | 'medium' | 'low';
  }>,
): CriticIssueRecord[] {
  const kept = (prev ?? []).filter((i) => i.page_index !== pageIndex);
  const next: CriticIssueRecord[] = issues.map((i) => ({
    path: i.path ?? `page.${pageIndex}`,
    message: i.message,
    severity: i.severity,
    page_index: pageIndex,
  }));
  return [...kept, ...next];
}

/** Mark critic issues whose path matches an applied patch as resolved_by lang_check. */
export function resolveCriticIssuesByPatches(
  issues: CriticIssueRecord[],
  patchPaths: string[],
): CriticIssueRecord[] {
  if (!patchPaths.length) return issues;
  return issues.map((issue) => {
    if (issue.resolved_by) return issue;
    const hit = patchPaths.some((p) =>
      pathsMatch(p, issue.path, issue.page_index),
    );
    return hit ? { ...issue, resolved_by: 'lang_check' as const } : issue;
  });
}

/** Assemble / publish fatals — only these block the gate (00 §3 stop rule). */
const FATAL_ASSEMBLE_RULES = new Set([
  'dialogue_check',
  'core_id_missing',
  'duplicate_ar',
  'duplicate_options',
  'ar_sentence_gap',
  'greeting_hello_collision',
  'slash_in_tl',
  'variant_group_uncovered',
  'phrase_not_on_phrases_page',
]);

function hasDialogueFatal(issues: Issue[] | undefined): boolean {
  return (issues ?? []).some((i) => i.rule === 'dialogue_check');
}

function hasHardAssembleError(issues: Issue[] | undefined): boolean {
  return (issues ?? []).some(
    (i) =>
      i.severity === 'error' &&
      (FATAL_ASSEMBLE_RULES.has(i.rule) ||
        i.rule === 'dialogue_check' ||
        i.rule === 'core_id_missing'),
  );
}

export type PublishBlockMeta = Pick<
  GenerationMeta,
  'flagged' | 'issues' | 'critic_issues' | 'lang_check'
>;

/**
 * True when reviewed/published must be refused.
 * Stop rule (00 §3): only fatals block. Critic high/medium/low and soft
 * warnings go to the review report; `meta.flagged` alone does not block.
 */
export function isBlockedForPublish(meta: PublishBlockMeta | null | undefined): boolean {
  if (!meta) return false;
  if (hasDialogueFatal(meta.issues) || hasHardAssembleError(meta.issues)) {
    return true;
  }
  const lc = meta.lang_check as { discarded?: unknown[] } | undefined;
  if (Array.isArray(lc?.discarded) && lc!.discarded!.length > 0) return true;
  return false;
}

/**
 * Recompute flagged after lang_check apply + resolve.
 * Flagged marks the review report; only fatals / discarded patches are true blocks.
 */
export function recomputeFlaggedAfterLangCheck(opts: {
  critic_issues: CriticIssueRecord[];
  discardedCount: number;
  assembleIssues?: Issue[];
}): boolean {
  if (opts.discardedCount > 0) return true;
  if (hasDialogueFatal(opts.assembleIssues) || hasHardAssembleError(opts.assembleIssues)) {
    return true;
  }
  // Soft: unresolved critic still flags the review report
  const hasCritic = (opts.critic_issues ?? []).some((i) => !i.resolved_by);
  return hasCritic;
}
