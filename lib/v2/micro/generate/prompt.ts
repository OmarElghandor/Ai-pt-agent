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
- For rule layout: different REGULAR verbs only; each line has verb_lemma; do not mark endings.
- Output JSON via the tool only.`;

export function buildMicroGenerateUser(opts: {
  clip: OutlineClip;
  seriesTitleAr: string;
  seriesTitleTl: string;
  reuseItemHints?: string[];
}): string {
  const { clip, seriesTitleAr, seriesTitleTl, reuseItemHints } = opts;
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
    reuseItemHints?.length
      ? `Prefer reusing these lesson items when they fit:\n${reuseItemHints.join('\n')}`
      : null,
    `Return title_tl, title_ar, optional note (Egyptian), optional image_spec, and 6–10 lines.`,
  ];
  return parts.filter(Boolean).join('\n\n');
}

export function buildMicroTopUpUser(opts: {
  clip: OutlineClip;
  keptTls: string[];
  need: number;
}): string {
  return [
    `Top-up for clip ${opts.clip.slug} (${opts.clip.layout}).`,
    `Already kept lines (do not repeat):\n${opts.keptTls.map((t) => `- ${t}`).join('\n')}`,
    `Need ${opts.need} more good lines (same rules as before).`,
  ].join('\n\n');
}
