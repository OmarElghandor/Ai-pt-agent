import {
  contextMatchCoachSegments,
  flattenCoachSegments,
} from './coachSegments';
import { normalizeAr } from './normalizeAr';

export type ContextLine = {
  tl: string;
  ar?: string;
  /** Prefer share/ask over chips when scores tie. */
  weight?: number;
};

export type ContextMatch = {
  tl: string;
  ar?: string;
  score: number;
};

/**
 * Synonym groups: any learner token in `from` expands to all `to` tokens
 * (and the originals) for overlap scoring against candidate tl/ar.
 */
const SYNONYM_GROUPS: Array<{ from: string[]; to: string[] }> = [
  {
    from: ['بتمرن', 'اتمرن', 'تمرن', 'اتدرب', 'train', 'training', 'workout', 'gym'],
    to: ['treino', 'treinar', 'ginasio', 'ginásio', 'desporto', 'esporte'],
  },
  {
    from: ['جيم', 'نادي', 'رياضه', 'رياضة', 'gym', 'fitness'],
    to: ['ginasio', 'ginásio', 'desporto'],
  },
  {
    from: ['مرات', 'مره', 'مرة', 'times', 'time'],
    to: ['vezes', 'vez'],
  },
  {
    from: ['اسبوع', 'أسبوع', 'week', 'weekly'],
    to: ['semana'],
  },
  {
    from: ['1', 'واحد', 'واحده', 'one'],
    to: ['um', 'uma', 'uma'],
  },
  {
    from: ['2', 'اتنين', 'اثنين', 'two'],
    to: ['dois', 'duas'],
  },
  {
    from: ['3', 'تلات', 'ثلاث', 'تلاته', 'ثلاثة', 'three'],
    to: ['tres', 'três'],
  },
  {
    from: ['4', 'اربعه', 'أربعة', 'four'],
    to: ['quatro'],
  },
  {
    from: ['5', 'خمسه', 'خمسة', 'five'],
    to: ['cinco'],
  },
];

const QUESTION_NOISE = new Set([
  'ازاي',
  'ازاى',
  'كيف',
  'اقول',
  'نقول',
  'بيقولوا',
  'بقول',
  'يعني',
  'ايه',
  'معنى',
  'معناها',
  'ترجمه',
  'بالبرتغالي',
  'قولي',
  'how',
  'do',
  'i',
  'can',
  'say',
  'what',
  'does',
  'mean',
  'is',
  'the',
  'a',
  'an',
  'to',
  'in',
  'of',
  'for',
  'my',
  'you',
  'please',
  'translate',
]);

function foldLatin(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tokenizeLearner(text: string): string[] {
  const ar = normalizeAr(text);
  const latin = foldLatin(text);
  const raw = [
    ...(ar.match(/[\u0600-\u06FFa-z0-9]+/gi) ?? []),
    ...(latin.match(/[a-z0-9]+/g) ?? []),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const tok = t.toLowerCase();
    if (!tok || QUESTION_NOISE.has(tok) || seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

/** Expand learner tokens with synonym targets for matching. */
export function expandLearnerSignals(text: string): Set<string> {
  const tokens = tokenizeLearner(text);
  const signals = new Set<string>(tokens);
  for (const tok of tokens) {
    for (const group of SYNONYM_GROUPS) {
      if (group.from.includes(tok)) {
        for (const t of group.to) signals.add(foldLatin(t));
        for (const f of group.from) signals.add(f);
      }
    }
  }
  return signals;
}

function candidateBlob(line: ContextLine): string {
  const parts = [foldLatin(line.tl)];
  if (line.ar) parts.push(normalizeAr(line.ar), foldLatin(line.ar));
  return parts.join(' ');
}

function scoreLine(signals: Set<string>, line: ContextLine): number {
  if (!line.tl.trim()) return 0;
  const blob = candidateBlob(line);
  const blobTokens = new Set(
    (blob.match(/[\u0600-\u06FFa-z0-9]+/gi) ?? []).map((t) => t.toLowerCase()),
  );
  let hits = 0;
  for (const sig of signals) {
    const folded = foldLatin(sig);
    if (blobTokens.has(sig) || blobTokens.has(folded) || blob.includes(folded)) {
      hits += 1;
    }
  }
  return hits + (line.weight ?? 0) * 0.01;
}

/**
 * Find the best Portuguese line in conversation context for a language question.
 * Returns null when confidence is too low (needs ≥2 signal hits).
 */
export function matchContextLine(
  learnerText: string,
  candidates: ContextLine[],
): ContextMatch | null {
  const signals = expandLearnerSignals(learnerText);
  if (signals.size === 0) return null;

  let best: ContextMatch | null = null;
  for (const line of candidates) {
    const score = scoreLine(signals, line);
    if (score < 2) continue;
    if (!best || score > best.score) {
      best = {
        tl: line.tl.replace(/\s+/g, ' ').trim(),
        ...(line.ar ? { ar: line.ar } : {}),
        score,
      };
    }
  }
  return best;
}

/** Flat coach EG (no markdown) when answering from a character line. */
export function contextMatchCoachEg(
  tl: string,
  characterName?: string | null,
): string {
  return flattenCoachSegments(contextMatchCoachSegments(tl, characterName));
}

export { contextMatchCoachSegments };
/**
 * Collect candidate lines from a free-chat thread + frame + recent character TLs.
 */
export function collectFreeContextCandidates(opts: {
  share?: { tl: string; ar: string } | null;
  ask?: { tl: string; ar: string } | null;
  followUps?: Array<{ tl: string; ar: string }>;
  frame?: { tl: string; chips?: string[] } | null;
  recentCharacterTls?: string[];
  /** Optional ar lookup by exact tl (from thread lines). */
  arByTl?: Map<string, string>;
}): ContextLine[] {
  const out: ContextLine[] = [];
  const push = (tl: string, ar: string | undefined, weight: number) => {
    const clean = tl.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    out.push({
      tl: clean,
      ...(ar ? { ar } : {}),
      weight,
    });
  };

  if (opts.share) push(opts.share.tl, opts.share.ar, 3);
  if (opts.ask) push(opts.ask.tl, opts.ask.ar, 2);
  for (const fu of opts.followUps ?? []) {
    push(fu.tl, fu.ar, 2);
  }
  if (opts.frame?.tl) push(opts.frame.tl, undefined, 1);
  for (const chip of opts.frame?.chips ?? []) {
    push(chip, undefined, 1);
  }
  for (const tl of opts.recentCharacterTls ?? []) {
    const ar = opts.arByTl?.get(tl.replace(/\s+/g, ' ').trim());
    push(tl, ar, 2);
  }
  return out;
}
