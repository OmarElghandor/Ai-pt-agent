/**
 * The only validation rules that block a lesson (00 soft principle: structure
 * fatal, content = warning). Shared by assemble and the publish gate so a
 * lesson that passed assemble is never refused at publish for a rule
 * assemble already downgraded.
 */
export const HARD_PACK_RULES = new Set([
  'core_id_missing',
  'sections_explain_missing',
]);

/** Question-shape errors: assemble drops the question; if one survives, it is hard. */
export const DROP_QUESTION_RULES = new Set([
  'question_stimulus',
  'pattern_not_testable',
  'question_accepted',
]);

export function isHardPackIssue(issue: {
  rule: string;
  severity: 'error' | 'warning';
}): boolean {
  return (
    issue.severity === 'error' &&
    (HARD_PACK_RULES.has(issue.rule) || DROP_QUESTION_RULES.has(issue.rule))
  );
}
