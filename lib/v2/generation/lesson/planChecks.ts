/**
 * Cross-file checks for the base plan files (core-items × days × conjugations).
 * Each rule here matches a generation-time rule that would otherwise fire on
 * every run of that day. Run by `npm run v2:validate-core-items`.
 */
import type { CoreItemsFile, CoreItemsValidationIssue } from './coreItems';
import type { PlanFile } from './plan';

type SeedLike = { verbs: { lemma: string }[] };

/** Same split rule as the items job / story checks (one sentence per line). */
function sentenceCount(tl: string): number {
  // "Estou? / Sim?" = variants (split by the items job); "…" = a slot.
  const first = tl.split(/\s*\/\s*/)[0] ?? tl;
  return first
    .split(/(?<=[.!?])\s+(?=\S)|\s+—\s+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

export function validatePlanCrossRefs(
  core: CoreItemsFile,
  plan: PlanFile,
  seed: SeedLike,
): CoreItemsValidationIssue[] {
  const issues: CoreItemsValidationIssue[] = [];
  const lemmas = new Set(seed.verbs.map((v) => v.lemma));
  const planByDay = new Map(plan.days.map((d) => [d.day, d] as const));
  const known = new Set<string>();

  for (const day of [...core.days].sort((a, b) => a.day - b.day)) {
    const p = (path: string) => `days[day=${day.day}].${path}`;
    const today = new Set(day.core_items.map((c) => c.id));
    const dayPlan = planByDay.get(day.day);
    const gen = dayPlan?.generation ?? {};

    // brief.dayEmitsGrammarPage: no grammar_focus → pattern/compare page dropped.
    const patterns = day.core_items.filter((c) => c.kind === 'pattern');
    if (patterns.length > 0 && !gen.grammar_focus) {
      issues.push({
        path: p('generation.grammar_focus'),
        rule: 'grammar_focus_missing',
        message: `day has pattern(s) ${patterns.map((c) => c.id).join(', ')} but days.json grammar_focus is empty → no grammar page`,
      });
    }

    for (const [i, c] of day.core_items.entries()) {
      // bad_form_id (error) for every form of a verb missing from the table.
      if (c.kind === 'verb') {
        const lemma = c.id.slice('verb.'.length);
        if (!lemmas.has(lemma)) {
          issues.push({
            path: p(`core_items[${i}]`),
            rule: 'verb_not_in_conjugations',
            message: `${c.id}: lemma "${lemma}" missing from content/v2/conjugations`,
          });
        }
      }
      // splitSlashTl splits on "/" only: "a / b · c / d" becomes garbage variants.
      if (c.kind !== 'pattern' && c.tl.includes('/') && c.tl.includes('·')) {
        issues.push({
          path: p(`core_items[${i}].tl`),
          rule: 'tl_slash_bundle',
          message: `${c.id}: "${c.tl}" mixes "/" and "·" — use "a · b" or one "a / b"`,
        });
      }
      if (c.kind === 'phrase' && sentenceCount(c.tl) > 1) {
        issues.push({
          path: p(`core_items[${i}].tl`),
          rule: 'phrase_multi_sentence',
          message: `${c.id}: "${c.tl}" is more than one sentence`,
        });
      }
      // unknown_item_ref (error at validate) when a fill isn't in the day bank.
      for (const f of c.fills ?? []) {
        if (!today.has(f) && !known.has(f)) {
          issues.push({
            path: p(`core_items[${i}].fills`),
            rule: 'fill_not_known',
            message: `${c.id} fills ${f}, which isn't taught today or before`,
          });
        }
      }
    }

    for (const r of (gen as { recycle?: string[] }).recycle ?? []) {
      if (!today.has(r) && !known.has(r)) {
        issues.push({
          path: p('generation.recycle'),
          rule: 'plan_recycle_unknown',
          message: `days.json recycle ${r} isn't a core item taught before`,
        });
      }
    }

    for (const c of day.core_items) known.add(c.id);
  }
  return issues;
}
