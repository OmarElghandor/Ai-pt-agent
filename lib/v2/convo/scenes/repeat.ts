import type { ConvoGoal } from '@/lib/v2/convo/goals/types';
import { normalizeSceneText } from './weak';

/**
 * A3 repeat / slow / didn’t-understand (§3).
 * Exception: when the current goal’s examples intentionally include a repeat
 * (e.g. encomenda.sign), treat as Step B.
 */
const REPEAT_PT =
  /^(desculpe\??|pode\s+repetir\??|repete,?\s+por\s+favor|mais\s+devagar|n[aã]o\s+perceb[io]|nao\s+perceb[io])\b/i;

/** Arabic: avoid \\b (JS word-boundary is ASCII-only). */
const REPEAT_AR =
  /^(مش\s*فاهم|مش\s*فاهمة|تاني|تانية|عيد)(?![\p{L}\p{N}])/u;

export function isSceneRepeatRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (REPEAT_AR.test(t)) return true;
  return REPEAT_PT.test(t);
}

/** True when the current goal’s examples intentionally include this line. */
export function goalExamplesIncludeRepeat(
  goal: ConvoGoal | undefined,
  learnerText: string,
): boolean {
  if (!goal?.examples_tl?.length) return false;
  const needle = normalizeSceneText(learnerText);
  if (!needle) return false;
  return goal.examples_tl.some((ex) => {
    const hay = normalizeSceneText(ex);
    return hay.includes(needle) || needle.includes(hay);
  });
}
