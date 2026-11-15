import { normalizedContains } from './normalize';
import type {
  RoleplaySituation,
  RoleplayStep,
  RoleplayValidationIssue,
} from './types';

function issue(
  situation_id: string,
  path: string,
  message: string,
): RoleplayValidationIssue {
  return { situation_id, path, message };
}

function collectStrings(
  value: unknown,
  path: string,
  out: Array<{ path: string; value: string }>,
): void {
  if (typeof value === 'string') {
    out.push({ path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
}

function stepKeywordPool(step: RoleplayStep): string[] {
  const pool = [...(step.expects.keywords ?? [])];
  for (const opt of step.expects.options ?? []) {
    pool.push(...(opt.keywords ?? []));
  }
  return pool;
}

function textMatchesPool(text: string, pool: string[]): boolean {
  if (pool.length === 0) return false;
  return pool.some((kw) => normalizedContains(text, kw));
}

/**
 * Validate one situation. Never mutates content — report only.
 */
export function validateRoleplaySituation(
  situation: RoleplaySituation,
): RoleplayValidationIssue[] {
  const issues: RoleplayValidationIssue[] = [];
  const id = situation.id;

  if (!situation.steps.length) {
    issues.push(issue(id, 'steps', 'no steps'));
    return issues;
  }

  const first = situation.steps[0];
  if (!first.says) {
    issues.push(issue(id, 'steps[0].says', 'first step must have says'));
  }

  // Slot declarations seen so far (for if_slot checks).
  const declaredSlots = new Map<string, Set<string>>();

  for (let i = 0; i < situation.steps.length; i++) {
    const step = situation.steps[i];
    const base = `steps[${i}](${step.id})`;

    if (!step.do_eg?.trim()) {
      issues.push(issue(id, `${base}.do_eg`, 'do_eg required'));
    }

    if (step.if_slot) {
      for (const [slot, value] of Object.entries(step.if_slot)) {
        const values = declaredSlots.get(slot);
        if (!values) {
          issues.push(
            issue(
              id,
              `${base}.if_slot.${slot}`,
              `refers to slot "${slot}" before any earlier step declares it`,
            ),
          );
        } else if (!values.has(value)) {
          issues.push(
            issue(
              id,
              `${base}.if_slot.${slot}`,
              `value "${value}" is not an option of earlier slot "${slot}"`,
            ),
          );
        }
      }
    }

    const exp = step.expects;
    if (exp?.slot && Array.isArray(exp.options)) {
      const set = declaredSlots.get(exp.slot) ?? new Set<string>();
      for (const opt of exp.options) {
        if (typeof opt.value === 'string') set.add(opt.value);
      }
      declaredSlots.set(exp.slot, set);
    }

    const pool = stepKeywordPool(step);
    const free = Boolean(exp?.free_answer);

    for (const [field, list] of [
      ['expects.examples_tl', exp?.examples_tl ?? []],
      ['expects.examples_tl_f', exp?.examples_tl_f ?? []],
    ] as const) {
      for (let j = 0; j < list.length; j++) {
        const text = list[j];
        if (free && pool.length === 0) continue;
        if (!textMatchesPool(text, pool)) {
          issues.push(
            issue(
              id,
              `${base}.${field}[${j}]`,
              `example does not match step keywords or options: ${JSON.stringify(text)}`,
            ),
          );
        }
      }
    }

    for (const [field, list] of [
      ['help.chips', step.help?.chips ?? []],
      ['help.chips_f', step.help?.chips_f ?? []],
    ] as const) {
      for (let j = 0; j < list.length; j++) {
        const text = list[j];
        if (!textMatchesPool(text, pool)) {
          issues.push(
            issue(
              id,
              `${base}.${field}[${j}]`,
              `chip does not match step keywords or options: ${JSON.stringify(text)}`,
            ),
          );
        }
      }
    }
  }

  // No "/" and no empty ar in authored learner-facing strings.
  const strings: Array<{ path: string; value: string }> = [];
  collectStrings(situation, '', strings);
  for (const { path: p, value } of strings) {
    // Skip structural ids / item ids / file metadata.
    if (
      /(^|\.)(id|target_lang|address|item_ids|new_tl|speaker|slot|value|gender|name)$/.test(
        p,
      ) ||
      /\.item_ids\[/.test(p) ||
      /\.new_tl\[/.test(p)
    ) {
      continue;
    }
    if (value.includes('/')) {
      issues.push(
        issue(id, p || '(root)', `contains "/": ${JSON.stringify(value.slice(0, 80))}`),
      );
    }
    if (/(^|\.)ar(_f)?$/.test(p) && value.trim() === '') {
      issues.push(issue(id, p, 'empty ar'));
    }
  }

  return issues;
}

export function validateAllRoleplaySituations(
  situations: RoleplaySituation[],
): RoleplayValidationIssue[] {
  return situations.flatMap(validateRoleplaySituation);
}
