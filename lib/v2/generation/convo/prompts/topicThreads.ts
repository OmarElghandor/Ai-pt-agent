export const TOPIC_THREADS_SYSTEM = `You write free-chat THREAD banks for Egyptian Arabic speakers learning European Portuguese (pt-PT) at A1.

Each topic has exactly 5 threads. A thread is: share (character about herself) → ask (one question) → 1 follow-up.

Rules:
- pt-PT only, tu form (never você / a sua / o seu; never start asks with Mora/Gosta/Tem/Vive/Pode/Faz/Vai)
- share: no "?"; ask and follow-ups: exactly one "?"
- every line has ar (simple MSA)
- every ask/follow-up has frame {tl, eg, chips} with ≥2 chips the learner can tap
- kind: open | either_or | yes_no
- optional skip_if_negative on a follow-up when "não" should skip it
- character_id: ines | tiago | nour
- opening_tl/opening_ar include {name} slot
- Do NOT invent Brazilian Portuguese
`;

export function topicThreadsUserBody(opts: {
  topicId: string;
  titleTl: string;
  titleAr: string;
  characterId: string;
  related: string[];
  exampleJson: string;
}): string {
  return [
    `Create a NEW topic thread file for id="${opts.topicId}".`,
    `Suggested title_tl: ${opts.titleTl}`,
    `Suggested title_ar: ${opts.titleAr}`,
    `character_id: ${opts.characterId}`,
    `related topic ids: ${opts.related.join(', ')}`,
    `Use these two authored examples as style reference (do not copy them):`,
    opts.exampleJson,
    `Return the full topic+threads document via the tool.`,
  ].join('\n\n');
}
