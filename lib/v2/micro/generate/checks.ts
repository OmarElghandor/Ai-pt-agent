import { findBrazilianLeak } from '@/lib/v2/convo/output/checks';
import type { MicroLayout } from '@/lib/v2/micro/outline';
import type { Person } from '@/lib/v2/content/items';
import {
  highlightFormInLine,
  highlightTokensInLine,
  isRegularVerifiedLemma,
  lemmaInVerifiedTable,
  type HighlightSpan,
} from './highlight';
import { resolveForm } from '@/lib/v2/content/conjugations/resolve';
import type { GeneratedLine } from './schema';

const ARABIC_RE = /[\u0600-\u06FF]/
const LATIN_RE = /[A-Za-zÀ-ÿ]/
const CONCEPT_EN_RE = /^[a-z][a-z0-9_]*$/;

export type MicroDropReason =
  | 'brazilian'
  | 'too_many_words'
  | 'pairs_too_long'
  | 'ar_empty'
  | 'ar_not_arabic'
  | 'concept_en_bad'
  | 'scene_no_region'
  | 'verb_form_not_in_table'
  | 'rule_irregular'
  | 'rule_repeat_verb'
  | 'rule_not_in_table'
  | 'rule_breaks'
  | 'duplicate_tl';

export type CheckedMicroLine = GeneratedLine & {
  highlight?: HighlightSpan;
  drop_conjugations?: true;
};

export type MicroCheckResult = {
  kept: CheckedMicroLine[];
  dropped: { line: GeneratedLine; reason: MicroDropReason }[];
};

export type RuleTense = 'pres' | 'pret' | 'imperf' | 'fut' | 'inf';
export type RulePerson = Person;
export type RuleKind = 'verb_ending' | 'pattern';

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function hasBrazilian(text: string): boolean {
  return Boolean(findBrazilianLeak(text));
}

export function normalizeRulePersons(
  rulePerson?: RulePerson | RulePerson[],
): RulePerson[] {
  if (!rulePerson) return ['eu'];
  return Array.isArray(rulePerson) ? rulePerson : [rulePerson];
}

/**
 * Drop failing lines (19 §5). Never rewrite Portuguese/Arabic by hand.
 * For rule clips: irregular / repeated / missing-from-table verbs are dropped;
 * ending highlight is computed from the verified table.
 * Pattern rule clips skip verb checks and highlight rule_highlight tokens.
 */
export function checkMicroLines(
  lines: GeneratedLine[],
  opts: {
    layout: MicroLayout;
    /** When set, every verb_lemma must be this (daily-verb clips). */
    requireLemma?: string;
    ruleKind?: RuleKind;
    /** Rule clip: tense/person used to resolve forms for highlight. */
    ruleTense?: RuleTense;
    rulePerson?: RulePerson | RulePerson[];
    ruleHighlight?: string[];
  },
): MicroCheckResult {
  const kept: CheckedMicroLine[] = [];
  const dropped: MicroCheckResult['dropped'] = [];
  const seenTl = new Set<string>();
  const seenLemmas = new Set<string>();
  const maxWords = opts.layout === 'pairs' ? 4 : 8;
  const ruleKind = opts.ruleKind ?? 'verb_ending';
  const persons = normalizeRulePersons(opts.rulePerson);

  for (const raw of lines) {
    const { conjugations: _c, ...rest } = raw;
    void _c;
    const line: GeneratedLine = rest;

    if (hasBrazilian(line.tl)) {
      dropped.push({ line, reason: 'brazilian' });
      continue;
    }
    if (wordCount(line.tl) > maxWords) {
      dropped.push({
        line,
        reason: opts.layout === 'pairs' ? 'pairs_too_long' : 'too_many_words',
      });
      continue;
    }
    if (!line.ar?.trim()) {
      dropped.push({ line, reason: 'ar_empty' });
      continue;
    }
    if (!ARABIC_RE.test(line.ar) || LATIN_RE.test(line.ar)) {
      // Allow short MSA without Latin; reject mixed
      if (LATIN_RE.test(line.ar)) {
        dropped.push({ line, reason: 'ar_not_arabic' });
        continue;
      }
    }
    if (line.concept_en && !CONCEPT_EN_RE.test(line.concept_en)) {
      dropped.push({ line, reason: 'concept_en_bad' });
      continue;
    }
    if (opts.layout === 'scene' && !line.region_hint?.trim()) {
      dropped.push({ line, reason: 'scene_no_region' });
      continue;
    }

    const tlKey = line.tl.trim().toLowerCase();
    if (seenTl.has(tlKey)) {
      dropped.push({ line, reason: 'duplicate_tl' });
      continue;
    }

    if (opts.layout === 'rule' && ruleKind === 'pattern') {
      const highlight = highlightTokensInLine(
        line.tl,
        opts.ruleHighlight ?? [],
      );
      if (!highlight) {
        dropped.push({ line, reason: 'rule_breaks' });
        continue;
      }
      seenTl.add(tlKey);
      kept.push({
        ...line,
        highlight,
        drop_conjugations: true,
      });
      continue;
    }

    if (opts.layout === 'rule') {
      const lemma = line.verb_lemma?.trim().toLowerCase();
      if (!lemma || !lemmaInVerifiedTable(lemma)) {
        dropped.push({ line, reason: 'rule_not_in_table' });
        continue;
      }
      if (!isRegularVerifiedLemma(lemma)) {
        dropped.push({ line, reason: 'rule_irregular' });
        continue;
      }
      if (seenLemmas.has(lemma)) {
        dropped.push({ line, reason: 'rule_repeat_verb' });
        continue;
      }
      const tense = opts.ruleTense ?? 'pres';
      const lowerTl = line.tl.toLowerCase();
      let matchedForm = null as ReturnType<typeof resolveForm>;
      for (const person of persons) {
        const form = resolveForm(`verb.${lemma}:${tense}:${person}`);
        if (form && lowerTl.includes(form.tl.toLowerCase())) {
          matchedForm = form;
          break;
        }
      }
      if (!matchedForm) {
        // Future / estar-a clips may only need the infinitive present
        if (tense !== 'inf' && tense !== 'fut') {
          dropped.push({ line, reason: 'rule_breaks' });
          continue;
        }
      }
      seenLemmas.add(lemma);
      const highlight = matchedForm
        ? highlightFormInLine(line.tl, matchedForm)
        : undefined;
      seenTl.add(tlKey);
      kept.push({
        ...line,
        verb_lemma: lemma,
        highlight: highlight ?? undefined,
        drop_conjugations: true,
      });
      continue;
    }

    // Verb clips: if verb_lemma set, require table form in the line
    if (line.verb_lemma || opts.requireLemma) {
      const lemma = (line.verb_lemma || opts.requireLemma || '')
        .trim()
        .toLowerCase();
      if (lemma && !lemmaInVerifiedTable(lemma)) {
        dropped.push({ line, reason: 'verb_form_not_in_table' });
        continue;
      }
      // Strip any model conjugations field (already omitted); never keep model forms
      if (raw.conjugations != null) {
        // line kept only if tl doesn't depend on free-form conjugations blob
      }
    }

    seenTl.add(tlKey);
    kept.push({ ...line, drop_conjugations: true });
  }

  return { kept, dropped };
}
