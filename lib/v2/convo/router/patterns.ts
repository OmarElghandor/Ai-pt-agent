/**
 * Explicit topic-request patterns (PT / Egyptian). Code runs these first;
 * the structured router may refine the id.
 */

export type ExplicitTopicRequest = {
  label: string;
  /** Hint id when the pattern names a known topic. */
  hint_id?: string;
};

const PT_TOPIC_RE =
  /(?:quero\s+falar\s+(?:de|sobre)|vamos\s+falar\s+(?:de|sobre)|falar\s+(?:de|sobre)|sobre)\s+(.+?)[.!?]*$/i;

/** عايز/نفسي/محتاج + أتكلم|أتعلم|افهم… (+ optional عن) + label */
const AR_TOPIC_RE =
  /(?:عايزه?|عاوزه?|أريد|ابغى|نبي|نفسي|محتاجه?)\s+(?:أتكلم|اتكلم|أتعلم|اتعلم|اعلم|نتكلم|نتعلم|افهم|اعرف)\s+(?:عن|على)?\s*(.+)$/u;

/** علمني / فهمني / هتعلمني + label */
const AR_TEACH_ME_RE = /(?:هتعلمني|علمني|فهمني)\s+(.+)$/u;

const KNOWN_LABEL_TO_ID: Array<{ re: RegExp; id: string }> = [
  { re: /trabalho|الشغل|العمل|job|work/i, id: 'trabalho' },
  { re: /casa|البيت|المنزل|home/i, id: 'casa' },
  { re: /comida|أكل|اكل|food/i, id: 'comida' },
  { re: /direc|اتجاه|طريق|directions?/i, id: 'direcoes' },
  { re: /futebol|كرة|كوره|football|soccer/i, id: 'futebol' },
  {
    re: /apresent|تعارف|اسم|introduc/i,
    id: 'day-1',
  },
];

function hintFor(label: string, full: string): string | undefined {
  for (const row of KNOWN_LABEL_TO_ID) {
    if (row.re.test(label) || row.re.test(full)) return row.id;
  }
  return undefined;
}

export function extractExplicitTopicRequest(
  text: string,
): ExplicitTopicRequest | null {
  const t = text.trim();
  if (!t) return null;

  let label: string | null = null;
  const pt = t.match(PT_TOPIC_RE);
  if (pt?.[1]) label = pt[1].trim();
  if (!label) {
    const ar = t.match(AR_TOPIC_RE);
    if (ar?.[1]) label = ar[1].trim();
  }
  if (!label) {
    const teach = t.match(AR_TEACH_ME_RE);
    if (teach?.[1]) label = teach[1].trim();
  }
  if (!label) return null;

  label = label
    .replace(/^o\s+meu\s+/i, '')
    .replace(/^a\s+/i, '')
    .replace(/^ال/, '')
    .trim();
  if (!label) return null;

  const hint_id = hintFor(label, t);
  return hint_id ? { label, hint_id } : { label };
}

/** True when the learner explicitly asks to change / name a topic. */
export function isExplicitTopicRequest(text: string): boolean {
  return extractExplicitTopicRequest(text) != null;
}
