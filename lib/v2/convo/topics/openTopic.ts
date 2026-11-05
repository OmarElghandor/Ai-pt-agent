import type { FreeTopic } from './threadTypes';

/** Synthetic topic id for «أي حاجة» fully-open practice (Batch 10). */
export const OPEN_TOPIC_ID = 'open';

/** Catalogue row for open chat — no thread bank. */
export const OPEN_TOPIC: FreeTopic = {
  id: OPEN_TOPIC_ID,
  title_tl: 'Qualquer coisa',
  title_ar: 'أي حاجة',
  title_in_sentence_tl: 'qualquer coisa',
  character_id: 'ines',
  intro_eg: 'اتكلم في أي موضوع إنت عايزه — أنا معاكي.',
  opening_tl: 'Olá {name}! 😊 Sobre o que queres falar hoje?',
  opening_ar: 'مرحباً {name}! 🙂 عن ماذا تريد أن تتحدث اليوم؟',
  related_topic_ids: [],
  word_set: [],
};

export function isOpenTopicId(topicId: string | null | undefined): boolean {
  return topicId === OPEN_TOPIC_ID;
}
