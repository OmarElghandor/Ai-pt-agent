export type CefrLevel = 'A0' | 'A1' | 'A2' | 'B1';

const LEVEL_GUIDANCE: Record<CefrLevel, string> = {
  A0: 'Complete beginner. Prefer very short Portuguese sentences (3–6 words). Simple present and greetings. Keep Arabic translations clear and Egyptian.',
  A1: 'Short everyday Portuguese. One idea per sentence. Everyday vocabulary only.',
  A2: 'Slightly longer sentences with porque/mas are fine. Stay conversational.',
  B1: 'Connected sentences and mixed tenses are fine. Still a conversation, not a textbook.',
};

export function levelGuidance(level: CefrLevel): string {
  return LEVEL_GUIDANCE[level] ?? LEVEL_GUIDANCE.A0;
}
