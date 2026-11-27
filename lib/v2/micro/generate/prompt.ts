import type { OutlineClip } from '@/lib/v2/micro/outline';

export const MICRO_GENERATE_SYSTEM = `You generate ONE micro-clip (لقطة) of European Portuguese (pt-PT) for Egyptian Arabic speakers.
Rules:
- pt-PT only. Never Brazilian (você as default address in examples is ok as formal; never Brazilian lexicon: ônibus, celular, banheiro, trem, café da manhã, etc.).
- Postverbal clitics in pt-PT (obrigam-me, dói-me). Prefer "estar a + infinitivo" over Brazilian gerund progressive.
- Meanings (ar) in simple Modern Standard Arabic. Optional note in Egyptian Arabic only when asked.
- 6–10 lines. Each line ≤ 8 words (≤ 4 for pairs layout).
- Lines in a natural fixed order that tells a small sequence when possible.
- NEVER invent conjugated verb forms. If a line needs a conjugated form, write the infinitive in verb_lemma and use only forms that would come from a verified table; prefer everyday present.
- For scene layout every line needs region_hint (what in the picture it points at).
- For rule layout follow the user prompt: verb_ending clips use only the listed regular verbs (each line has verb_lemma; do not mark endings); pattern clips need no verb_lemma and must include a rule_highlight token in each line.
- Output JSON via the tool only.`;

export function buildMicroGenerateUser(opts: {
  clip: OutlineClip;
  seriesTitleAr: string;
  seriesTitleTl: string;
  reuseItemHints?: string[];
  /** Regular verified lemmas allowed for verb_ending rule clips. */
  regularLemmas?: string[];
}): string {
  const { clip, seriesTitleAr, seriesTitleTl, reuseItemHints, regularLemmas } =
    opts;
  const ruleKind = clip.rule_kind ?? 'verb_ending';
  const ruleParts: string[] = [];
  if (clip.layout === 'rule') {
    if (ruleKind === 'pattern') {
      ruleParts.push(
        `Rule kind: pattern. verb_lemma is NOT needed. Every line must contain one of these tokens to highlight: ${(clip.rule_highlight ?? []).join(', ') || '(see brief)'}.`,
      );
    } else {
      ruleParts.push(
        `Rule kind: verb_ending. Use ONLY these regular verified lemmas (different verb per line); set verb_lemma on each line: ${(regularLemmas ?? []).join(', ') || '(none)'}.`,
      );
      if (clip.rule_tense) {
        ruleParts.push(`Target tense: ${clip.rule_tense}.`);
      }
      const persons = clip.rule_person
        ? Array.isArray(clip.rule_person)
          ? clip.rule_person
          : [clip.rule_person]
        : ['eu'];
      ruleParts.push(`Target person(s): ${persons.join(', ')}.`);
    }
  }

  const parts = [
    `Series: ${seriesTitleTl} / ${seriesTitleAr}`,
    `Clip slug: ${clip.slug}`,
    `Layout: ${clip.layout}`,
    `Level: ${clip.level}`,
    `Title hint TL: ${clip.title_tl}`,
    `Title hint AR: ${clip.title_ar}`,
    clip.legacy_ref ? `Legacy ref: ${clip.legacy_ref}` : null,
    clip.prompt_guidance
      ? `Topic brief:\n${clip.prompt_guidance}`
      : null,
    clip.extra_brief ? `Extra brief:\n${clip.extra_brief}` : null,
    clip.rule_card
      ? `Rule card: ${JSON.stringify(clip.rule_card)}`
      : null,
    ruleParts.length ? ruleParts.join('\n') : null,
    reuseItemHints?.length
      ? `Prefer reusing these lesson items when they fit:\n${reuseItemHints.join('\n')}`
      : null,
    `Return title_tl, title_ar, optional note (Egyptian), required image_spec (1–2 English sentences: Lisbon watercolour main-picture subject for this clip), and 6–10 lines.`,
  ];
  return parts.filter(Boolean).join('\n\n');
}

export function buildMicroTopUpUser(opts: {
  clip: OutlineClip;
  keptTls: string[];
  need: number;
  regularLemmas?: string[];
}): string {
  const ruleKind = opts.clip.rule_kind ?? 'verb_ending';
  const extra =
    opts.clip.layout === 'rule'
      ? ruleKind === 'pattern'
        ? `Pattern rule: each new line must include one of: ${(opts.clip.rule_highlight ?? []).join(', ')}. No verb_lemma needed.`
        : `Verb-ending rule: only these lemmas: ${(opts.regularLemmas ?? []).join(', ')}.`
      : null;
  return [
    `Top-up for clip ${opts.clip.slug} (${opts.clip.layout}).`,
    `Already kept lines (do not repeat):\n${opts.keptTls.map((t) => `- ${t}`).join('\n')}`,
    `Need ${opts.need} more good lines (same rules as before).`,
    extra,
  ]
    .filter(Boolean)
    .join('\n\n');
}
