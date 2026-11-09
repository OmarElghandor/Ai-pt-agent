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
 * and attach pairs only to questions whose tests include the pattern
 * (or an item that contains the right TL form) — never unrelated items.
 */
export function applyCommonMistakesToQuestions(
  pages: Page[],
  questions: Question[],
  opts?: { items?: Array<{ id: string; tl?: string; type?: string }> },
): { pages: Page[]; questions: Question[] } {
  const allKnown: KnownNearMiss[] = [];
  /** Pairs keyed by the pattern / page that produced them. */
  const pairsBySource: Array<{
    pageId: string;
    introduces: string[];
    pairs: CommonMistakePair[];
  }> = [];

  const nextPages = pages.map((page) => {
    if (page.mode !== 'sections') return page;
    const pairs = extractCommonMistakes(page.explain);
    if (!pairs.length) return page;
    const introduces = Array.isArray(
      (page as unknown as { introduces?: string[] }).introduces,
    )
      ? ((page as unknown as { introduces: string[] }).introduces ?? [])
      : [];
    // Also look at formula / examples block item refs
    const blockIds: string[] = [];
    for (const b of page.blocks ?? []) {
      if (!b || typeof b !== 'object') continue;
      const items = (b as { items?: string[] }).items;
      if (Array.isArray(items)) blockIds.push(...items.map(String));
      const formula = (b as { formula?: { pattern?: string } }).formula;
      if (formula?.pattern) blockIds.push(formula.pattern);
    }
    pairsBySource.push({
      pageId: page.id,
      introduces: [...introduces, ...blockIds],
      pairs,
    });
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
  if (!pairsBySource.length) return { pages: nextPages, questions };

  const items = opts?.items ?? [];
  const itemTl = (id: string) => {
    const it = items.find((i) => i.id === id);
    return it && typeof it.tl === 'string' ? it.tl : '';
  };

  const questionMatchesPairs = (
    q: Question,
    source: (typeof pairsBySource)[number],
  ): boolean => {
    const tests = Array.isArray(q.tests) ? q.tests.map(String) : [];
    for (const t of tests) {
      for (const intro of source.introduces) {
        if (!intro) continue;
        if (t === intro) return true;
        if (t.startsWith(`${intro}.`) || intro.startsWith(`${t}.`)) return true;
        if (t.replace(/\.ex\.\d+$/, '') === intro) return true;
      }
      const tl = itemTl(t).toLowerCase();
      if (!tl) continue;
      for (const p of source.pairs) {
        const right = p.right.toLowerCase();
        if (right && (tl.includes(right) || right.includes(tl.split(/\s+/)[0]!))) {
          return true;
        }
      }
    }
    // Grammar skill + pattern page → attach
    if (q.skill === 'grammar') {
      return source.introduces.some((id) => id.startsWith('pattern.'));
    }
    return false;
  };

  const nextQuestions = questions.map((q) => {
    if (q.skill !== 'writing' && q.skill !== 'speaking' && q.skill !== 'grammar') {
      return q;
    }
    const existing =
      Array.isArray(
        (q as unknown as { near_miss?: { tl: string; feedback_eg: string }[] })
          .near_miss,
      )
        ? [
            ...(
              q as unknown as {
                near_miss: { tl: string; feedback_eg: string }[];
              }
            ).near_miss,
          ]
        : [];
    const seen = new Set(existing.map((n) => n.tl.toLowerCase()));
    let changed = false;
    for (const source of pairsBySource) {
      if (!questionMatchesPairs(q, source)) continue;
      for (const p of source.pairs) {
        const key = p.wrong.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        existing.push({ tl: p.wrong, feedback_eg: p.why_eg });
        changed = true;
      }
    }
    return changed ? { ...q, near_miss: existing } : q;
  });

  return { pages: nextPages, questions: nextQuestions };
}
