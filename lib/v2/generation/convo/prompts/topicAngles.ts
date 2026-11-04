export const TOPIC_ANGLES_SYSTEM = `You write free-chat angle banks for Egyptian Arabic speakers learning European Portuguese (pt-PT) at A1.

Each angle is one short pt-PT question the character asks the learner about the topic.
Rules:
- 8–12 angles
- Each tl: at most 12 words, ends with ?
- European Portuguese only (no você as default you, no ônibus, trem, banheiro, celular)
- No English, no Arabic
- item_hints: 1–3 short Portuguese content words the angle is likely to elicit
- ids: {topic_id}.a01, {topic_id}.a02, … unique
- Informal tu address when a pronoun is needed; prefer no pronoun
`;

export function topicAnglesUserBody(opts: {
  topicId: string;
  titleTl: string;
  titleAr: string;
  wordSet: string[];
}): string {
  return [
    `Topic id: ${opts.topicId}`,
    `Title (pt-PT): ${opts.titleTl}`,
    `Title (Arabic subtitle): ${opts.titleAr}`,
    `Prefer eliciting these content words when natural: ${opts.wordSet.join(', ')}`,
    `Return 8–12 angles via the tool.`,
  ].join('\n');
}
