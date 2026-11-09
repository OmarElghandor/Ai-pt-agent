import type { ConvoItemSurface, ConvoPackData } from '@/lib/v2/convo/pack';

export type PackItemMatch =
  | {
      kind: 'item';
      item_id: string;
      tl: string;
      coach_eg: string;
    }
  | {
      kind: 'map_node';
      node_id: string;
      label_tl: string;
      coach_eg: string;
    };

/** Extra Arabic glosses for directions (day 18 coach intros + common synonyms). */
const ARABIC_GLOSS: Record<string, string[]> = {
  'word.station': ['المحطة', 'محطة'],
  'word.street': ['الشارع', 'شارع'],
  'word.pharmacy': ['الصيدلية', 'صيدلية'],
  'word.right': ['يمين', 'اليمين'],
  'word.left': ['شمال', 'يسار', 'الشمال', 'اليسار'],
  'phrase.go_straight': ['على طول', 'طوّل', 'قدّام'],
};

function normalizeLatin(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/^a\s+/, '')
    .replace(/^à\s+/, '')
    .trim();
}

function latinTokens(text: string): string[] {
  return (text.match(/[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)*/g) ?? []).map((t) =>
    t.trim(),
  );
}

/**
 * Match a language question to a pack item surface / coach gloss,
 * or a map node label (e.g. esquina).
 */
export function matchPackItemQuestion(
  learnerText: string,
  pack: ConvoPackData,
  surfaces: ConvoItemSurface[],
): PackItemMatch | null {
  const text = learnerText.trim();
  if (!text) return null;

  const packItemIds = new Set(Object.keys(pack.items));
  const packSurfaces = surfaces.filter((s) => packItemIds.has(s.id));

  // 1) Latin token matches item tl (longest first)
  const tokens = latinTokens(text).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const norm = normalizeLatin(token);
    if (norm.length < 2) continue;
    for (const s of packSurfaces) {
      const tlNorm = normalizeLatin(s.tl);
      if (
        tlNorm === norm ||
        tlNorm.includes(norm) ||
        norm.includes(tlNorm.replace(/^(a|o|as|os)\s+/, ''))
      ) {
        const bank = pack.items[s.id];
        return {
          kind: 'item',
          item_id: s.id,
          tl: s.tl,
          coach_eg:
            bank?.coach_intro_eg?.trim() ||
            `${s.tl} — جرّب تقولها`,
        };
      }
    }
  }

  // 2) Arabic gloss from coach intros / synonym table
  for (const s of packSurfaces) {
    const glosses = [
      ...(ARABIC_GLOSS[s.id] ?? []),
      ...extractArabicGlosses(pack.items[s.id]?.coach_intro_eg ?? ''),
    ];
    for (const g of glosses) {
      if (g && text.includes(g)) {
        const bank = pack.items[s.id];
        return {
          kind: 'item',
          item_id: s.id,
          tl: s.tl,
          coach_eg:
            bank?.coach_intro_eg?.trim() ||
            `${s.tl} — جرّب تقولها`,
        };
      }
    }
  }

  // 3) Map node labels (esquina, metro, …)
  if (pack.visual.type === 'map') {
    for (const token of tokens) {
      const norm = normalizeLatin(token);
      for (const node of pack.visual.nodes) {
        if (normalizeLatin(node.label_tl) === norm) {
          const gloss =
            norm === 'esquina'
              ? 'يعني الزاوية / الركن'
              : 'دي على الخريطة';
          return {
            kind: 'map_node',
            node_id: node.id,
            label_tl: node.label_tl,
            coach_eg: `${node.label_tl} ${gloss} — جرّب تقولها`,
          };
        }
      }
    }
  }

  return null;
}

/** Pull Arabic word(s) before بنقول / عشان نقول from coach_intro_eg. */
function extractArabicGlosses(intro: string): string[] {
  const out: string[] = [];
  const m = intro.match(
    /(?:عشان\s*نقول|بنقول)\s+([\u0600-\u06FF\s]+?)(?:\s*بنقول|\s*$)/,
  );
  // Patterns like: عشان نقول يمين بنقول direita / الشارع بنقول rua
  const before = intro.match(
    /([\u0600-\u06FF][\u0600-\u06FF\s]{0,20}?)(?:\s*بنقول)/,
  );
  if (before?.[1]) {
    const g = before[1].replace(/^عشان\s*نقول\s*/, '').trim();
    if (g) out.push(g);
  }
  void m;
  return out;
}
