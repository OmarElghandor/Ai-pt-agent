/**
 * Known near_miss pairs from grammar explain common-mistakes (and static seeds).
 * Used by evaluate (code path) and injected into the grader prompt.
 */

export type KnownNearMiss = {
  wrong: string;
  right: string;
  feedback_eg: string;
  source?: string;
};

/** Static seeds typical of Arabic/English L1 slips in pt-PT A1. */
export const STATIC_KNOWN_NEAR_MISS: KnownNearMiss[] = [
  {
    wrong: 'Chamome',
    right: 'Chamo-me',
    feedback_eg: 'الضمير بيتلصق بالفعل بشرطة',
    source: 'static',
  },
  {
    wrong: 'Sou cansado',
    right: 'Estou cansado',
    feedback_eg: 'الحالة بـ estar مش ser',
    source: 'static',
  },
];

let sessionPairs: KnownNearMiss[] = [];

export function registerKnownNearMisses(pairs: KnownNearMiss[]): void {
  const seen = new Set(
    [...STATIC_KNOWN_NEAR_MISS, ...sessionPairs].map(
      (p) => `${p.wrong.toLowerCase()}→${p.right.toLowerCase()}`,
    ),
  );
  for (const p of pairs) {
    const key = `${p.wrong.toLowerCase()}→${p.right.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sessionPairs.push(p);
  }
}

export function clearSessionKnownNearMisses(): void {
  sessionPairs = [];
}

export function allKnownNearMisses(): KnownNearMiss[] {
  return [...STATIC_KNOWN_NEAR_MISS, ...sessionPairs];
}

/** Match an answer against known wrong forms. */
export function matchKnownNearMiss(
  answer: string,
): KnownNearMiss | undefined {
  const norm = answer.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!norm) return undefined;
  for (const p of allKnownNearMisses()) {
    if (p.wrong.replace(/\s+/g, ' ').trim().toLowerCase() === norm) return p;
  }
  return undefined;
}

/** Compact lines for the grader system/user prompt. */
export function formatKnownNearMissForGrader(): string {
  const pairs = allKnownNearMisses();
  if (!pairs.length) return '';
  return pairs
    .slice(0, 20)
    .map((p) => `- "${p.wrong}" → "${p.right}" (${p.feedback_eg})`)
    .join('\n');
}
