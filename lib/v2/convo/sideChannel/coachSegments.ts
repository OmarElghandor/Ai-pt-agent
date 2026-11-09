/** Structured coach note segments (K6) — no markdown. */
export type CoachSegment =
  | { type: 'eg'; text: string }
  | { type: 'tl'; text: string };

export function flattenCoachSegments(segments: CoachSegment[]): string {
  return segments.map((s) => s.text).join('');
}

export function contextMatchCoachSegments(
  tl: string,
  characterName?: string | null,
): CoachSegment[] {
  const name = characterName?.trim() || 'الشخصية';
  const clean = tl.replace(/[💪😅😊🔥]+/gu, '').replace(/\s+/g, ' ').trim();
  return [
    { type: 'eg', text: `زي ما ${name} قال: ` },
    { type: 'tl', text: clean },
    { type: 'eg', text: ' — جرّب تقولها' },
  ];
}

export function frameFallbackCoachSegments(frameTl: string): CoachSegment[] {
  const tl = frameTl.replace(/\s+/g, ' ').trim();
  return [
    { type: 'eg', text: 'تقدر تقول: ' },
    { type: 'tl', text: tl },
  ];
}

export function frameFitCoachSegments(fitted: string): CoachSegment[] {
  return [
    { type: 'eg', text: 'بالبرتغالي: «' },
    { type: 'tl', text: fitted },
    { type: 'eg', text: '» — جرّب تقولها' },
  ];
}

/** Split a coach EG that already mixes Arabic + Latin into segments. */
export function splitCoachEgToSegments(eg: string): CoachSegment[] {
  const PT_RUN =
    /[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9'«»"\-?!,.;:…]*(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ0-9'«»"\-?!,.;:…]+)*/g;
  const segments: CoachSegment[] = [];
  let last = 0;
  for (const m of eg.matchAll(PT_RUN)) {
    const start = m.index ?? 0;
    if (start > last) {
      segments.push({ type: 'eg', text: eg.slice(last, start) });
    }
    segments.push({ type: 'tl', text: m[0]! });
    last = start + m[0]!.length;
  }
  if (last < eg.length) {
    segments.push({ type: 'eg', text: eg.slice(last) });
  }
  return segments.length > 0 ? segments : [{ type: 'eg', text: eg }];
}
