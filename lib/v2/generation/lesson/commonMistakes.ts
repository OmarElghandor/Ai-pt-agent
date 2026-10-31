import type { Rt, RtSegment } from '@/lib/v2/content/rt';
import type { Page } from '@/lib/v2/content/page';
import type { Question } from '@/lib/v2/content/lesson';
import {
  registerKnownNearMisses,
  type KnownNearMiss,
} from '@/lib/v2/answers/knownNearMiss';

export type CommonMistakePair = {
  wrong: string;
  right: string;
  why_eg: string;
};

/**
 * Extract wrong → right pairs from sections explain rt.
 * Pattern: a TL segment with wrong:true, then the next TL segment (correct),
 * then nearby Egyptian text as why.
 */
export function extractCommonMistakes(explain: Rt | undefined): CommonMistakePair[] {
  if (!explain?.length) return [];
  const pairs: CommonMistakePair[] = [];
  for (let i = 0; i < explain.length; i++) {
    const seg = explain[i]!;
    if (seg.lang !== 'tl' || !seg.wrong) continue;
    const wrong = seg.text.trim();
    if (!wrong) continue;
    let right = '';
    let whyParts: string[] = [];
    for (let j = i + 1; j < explain.length; j++) {
      const next = explain[j]!;
      if (next.lang === 'tl' && !next.wrong && !right) {
        right = next.text.trim();
        continue;
      }
      if (next.lang === 'eg' && right) {
        whyParts.push(next.text.trim());
        // Stop at next wrong pair
        const peek = explain[j + 1];
        if (peek?.lang === 'tl' && peek.wrong) break;
        if (whyParts.join(' ').length > 8) break;
      }
      if (next.lang === 'tl' && next.wrong && right) break;
    }
    if (wrong && right) {
      pairs.push({
        wrong,
        right,
        why_eg: whyParts.filter(Boolean).join(' ').trim() || 'الغَلَط الشائع — صحّح كده',
      });
    }
  }
  return pairs.slice(0, 2);
}

/** Count intentional wrong TL segments in explain. */
export function countWrongTlSegments(explain: Rt | undefined): number {
  if (!explain?.length) return 0;
  return explain.filter((s: RtSegment) => s.lang === 'tl' && s.wrong).length;
}

/**
 * Persist common_mistakes on sections pages, register known near_misses,
 * and attach pairs to every writing/speaking question for the day
 * (grammar pages often only have closed reading/listening checks).
 */
export function applyCommonMistakesToQuestions(
  pages: Page[],
  questions: Question[],
): { pages: Page[]; questions: Question[] } {
  const allKnown: KnownNearMiss[] = [];
  const allPairs: CommonMistakePair[] = [];

  const nextPages = pages.map((page) => {
    if (page.mode !== 'sections') return page;
    const pairs = extractCommonMistakes(page.explain);
    if (!pairs.length) return page;
    allPairs.push(...pairs);
    for (const p of pairs) {
      allKnown.push({
        wrong: p.wrong,
        right: p.right,
        feedback_eg: p.why_eg,
        source: `page:${page.id}`,
      });
    }
    return { ...page, common_mistakes: pairs };
  });

  if (allKnown.length) registerKnownNearMisses(allKnown);
  if (!allPairs.length) return { pages: nextPages, questions };

  const nextQuestions = questions.map((q) => {
    if (q.skill !== 'writing' && q.skill !== 'speaking') return q;
    const existing =
      Array.isArray((q as { near_miss?: { tl: string; feedback_eg: string }[] })
        .near_miss)
        ? [
            ...(
              q as { near_miss: { tl: string; feedback_eg: string }[] }
            ).near_miss,
          ]
        : [];
    const seen = new Set(existing.map((n) => n.tl.toLowerCase()));
    for (const p of allPairs) {
      const key = p.wrong.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      existing.push({ tl: p.wrong, feedback_eg: p.why_eg });
    }
    return { ...q, near_miss: existing };
  });

  return { pages: nextPages, questions: nextQuestions };
}
