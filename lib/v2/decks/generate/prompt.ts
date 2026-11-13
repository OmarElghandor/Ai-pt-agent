export function buildGenerateUserPrompt(opts: {
  topic: string;
  targetLang: string;
  phase: 'A1' | 'A2';
}): string {
  return [
    `Topic (Egyptian Arabic or short label): ${opts.topic}`,
    `Target language: ${opts.targetLang}`,
    `Learner phase: ${opts.phase}`,
    '',
    'Generate 20–30 useful everyday words for someone living in Portugal.',
    'Mostly nouns with their definite article (o/a), some verbs (infinitive only) and adjectives, at most 3 short fixed phrases.',
    'Meanings (ar) in simple MSA. Optional eg_note in Egyptian only (no mixed Latin+Arabic in one plain string).',
    'example_tl: at most 8 words, must contain the headword, pt-PT only.',
    'example_ar: required simple MSA translation of example_tl (Arabic script only).',
    'concept_en: required short lowercase ASCII slug for the concept (rain, fridge, to_cook) — used only for the image key, never shown.',
    'Do NOT invent pronunciation or Arabic-letter spelling (say); code adds that if needed.',
    'Never write conjugated verb forms. Never use Brazilian Portuguese (geladeira, ônibus, trem, banheiro, café da manhã, você…).',
    'Use tl_f instead of "/" when gender changes the form.',
    'Set topic_ok false for sexual content, insults, hate, violence, drugs, politics, or a topic about a real person; include a short topic_reason.',
    'Return title_tl, title_ar, tags (2–4 English slugs), and words.',
  ].join('\n');
}

export function buildTopUpUserPrompt(opts: {
  topic: string;
  need: number;
  droppedTls: string[];
  keptLemmas: string[];
}): string {
  return [
    `Topic: ${opts.topic}`,
    `Need exactly ${opts.need} more pt-PT words (same shape as before).`,
    `Do not repeat these lemmas: ${opts.keptLemmas.join(', ') || '(none)'}`,
    `Avoid these dropped forms: ${opts.droppedTls.join(', ') || '(none)'}`,
    'Infinitive verbs only. Nouns with article + gender. No Brazilian Portuguese.',
    'Each word needs example_tl (≤8 words, contains headword), example_ar (simple MSA), and concept_en (lowercase ASCII slug). Do not invent say/pronunciation.',
  ].join('\n');
}

export const GENERATE_SYSTEM =
  'You generate European Portuguese (pt-PT) flashcard decks for Egyptian Arabic speakers living in Portugal. Call the tool once with valid JSON.';
