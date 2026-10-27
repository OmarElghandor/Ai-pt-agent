import type { Skill } from '@/lib/v2/content/lesson';
import type { MechanicalQuestion } from './mechanical';

export type SessionQuestion = MechanicalQuestion & {
  bucket: 'due' | 'weak' | 'today' | 'stretch';
};

export type BuildSessionInput = {
  due: MechanicalQuestion[];
  weak: MechanicalQuestion[];
  today: MechanicalQuestion[];
  stretch: MechanicalQuestion[];
  size?: number;
  /** Prefer listen+read for beginners (~70%). */
  beginnerBias?: boolean;
};

const DEFAULT_SIZE = 11;

/**
 * Session mix: 40% due · 30% weak · 20% today · 10% stretch.
 * No two consecutive questions on the same item.
 */
export function buildQuestionSession(
  input: BuildSessionInput,
): SessionQuestion[] {
  const size = input.size ?? DEFAULT_SIZE;
  const counts = {
    due: Math.round(size * 0.4),
    weak: Math.round(size * 0.3),
    today: Math.round(size * 0.2),
    stretch: Math.max(1, size - Math.round(size * 0.4) - Math.round(size * 0.3) - Math.round(size * 0.2)),
  };

  const pools: Record<SessionQuestion['bucket'], MechanicalQuestion[]> = {
    due: [...input.due],
    weak: [...input.weak],
    today: [...input.today],
    stretch: [...input.stretch],
  };

  if (input.beginnerBias !== false) {
    const prefer = (q: MechanicalQuestion) =>
      q.skill === 'listening' || q.skill === 'reading';
    for (const key of Object.keys(pools) as SessionQuestion['bucket'][]) {
      pools[key].sort((a, b) => Number(prefer(b)) - Number(prefer(a)));
    }
  }

  const out: SessionQuestion[] = [];
  const take = (bucket: SessionQuestion['bucket'], n: number) => {
    let got = 0;
    while (got < n && pools[bucket].length) {
      const q = pools[bucket].shift()!;
      const itemId = q.tests[0];
      const prev = out[out.length - 1]?.tests[0];
      if (itemId && itemId === prev) {
        pools[bucket].push(q);
        // try next
        if (pools[bucket].length <= 1) break;
        continue;
      }
      out.push({ ...q, bucket });
      got += 1;
    }
    return n - got;
  };

  let rem =
    take('due', counts.due) +
    take('weak', counts.weak) +
    take('today', counts.today) +
    take('stretch', counts.stretch);

  // Spill from any remaining
  const spillOrder: SessionQuestion['bucket'][] = [
    'due',
    'weak',
    'today',
    'stretch',
  ];
  while (rem > 0 && out.length < size) {
    let progressed = false;
    for (const b of spillOrder) {
      if (rem <= 0) break;
      const before = rem;
      rem = take(b, 1) + (rem - 1);
      if (rem < before) progressed = true;
    }
    if (!progressed) break;
  }

  return out.slice(0, size);
}

export function skillIsClosed(skill: Skill): boolean {
  return skill === 'listening' || skill === 'reading';
}
