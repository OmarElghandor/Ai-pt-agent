/** Grammar minimal pairs for TL distractors — never scramble characters. */
export const GRAMMAR_MINIMAL_PAIRS: Array<[string, string]> = [
  ['um', 'uma'],
  ['o', 'a'],
  ['os', 'as'],
  ['Queria', 'Quero'],
  ['queria', 'quero'],
];

const ENDING_PAIRS: Array<[RegExp, string]> = [
  [/o$/i, 'a'],
  [/a$/i, 'o'],
];

export function minimalPairDistractors(correct: string, need: number): string[] {
  const out: string[] = [];
  const lower = correct.toLowerCase();
  for (const [a, b] of GRAMMAR_MINIMAL_PAIRS) {
    if (out.length >= need) break;
    if (lower === a.toLowerCase()) out.push(swapCaseLike(correct, b));
    else if (lower === b.toLowerCase()) out.push(swapCaseLike(correct, a));
    else if (lower.includes(` ${a.toLowerCase()} `)) {
      out.push(correct.replace(new RegExp(`\\b${a}\\b`, 'i'), b));
    } else if (lower.includes(` ${b.toLowerCase()} `)) {
      out.push(correct.replace(new RegExp(`\\b${b}\\b`, 'i'), a));
    }
  }
  for (const [re, repl] of ENDING_PAIRS) {
    if (out.length >= need) break;
    if (re.test(correct) && correct.length > 2) {
      const swapped = correct.replace(re, repl);
      if (swapped !== correct) out.push(swapped);
    }
  }
  return [...new Set(out)].filter((x) => x && x !== correct).slice(0, need);
}

function swapCaseLike(sample: string, next: string): string {
  if (!sample) return next;
  if (sample[0] === sample[0]!.toUpperCase()) {
    return next.charAt(0).toUpperCase() + next.slice(1);
  }
  return next.toLowerCase();
}

export function isMinimalPairOf(correct: string, candidate: string): boolean {
  if (!correct || !candidate || correct === candidate) return false;
  const pairs = minimalPairDistractors(correct, 8);
  return pairs.some((p) => p.toLowerCase() === candidate.toLowerCase());
}
