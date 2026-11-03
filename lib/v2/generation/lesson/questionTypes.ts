import type { Skill } from '@/lib/v2/content/lesson';

/** Canonical day-bank question types (00 §7). */
export const QUESTION_TYPES = [
  'listen_meaning',
  'listen_pick_tl',
  'listen_pick_image',
  'dictation',
  'translate_write',
  'fill_blank_write',
  'describe_image_write',
  'reply_write',
  'say_it',
  'reply_speak',
  'describe_image_speak',
  'read_aloud',
  'fill_blank_choice',
  'build_sentence',
  'read_meaning',
  'situation_choice',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const IMAGE_QUESTION_TYPES = new Set<QuestionType>([
  'listen_pick_image',
  'describe_image_write',
  'describe_image_speak',
]);

const SKILL_BY_TYPE: Record<QuestionType, Skill> = {
  listen_meaning: 'listening',
  listen_pick_tl: 'listening',
  listen_pick_image: 'listening',
  dictation: 'listening',
  translate_write: 'writing',
  fill_blank_write: 'writing',
  describe_image_write: 'writing',
  reply_write: 'writing',
  say_it: 'speaking',
  reply_speak: 'speaking',
  describe_image_speak: 'speaking',
  read_aloud: 'speaking',
  fill_blank_choice: 'grammar',
  build_sentence: 'grammar',
  read_meaning: 'reading',
  situation_choice: 'reading',
};

export function skillForQuestionType(type: QuestionType): Skill {
  return SKILL_BY_TYPE[type];
}

/** Same-skill non-image fallback when the image is not ready. */
export function imageFallbackType(type: QuestionType): QuestionType {
  switch (type) {
    case 'listen_pick_image':
      return 'listen_meaning';
    case 'describe_image_write':
      return 'translate_write';
    case 'describe_image_speak':
      return 'say_it';
    default:
      return type;
  }
}

/** Legacy generation aliases → canonical types. */
export function normalizeQuestionType(type: string, skill?: string): QuestionType {
  const t = type.trim().toLowerCase();
  if ((QUESTION_TYPES as readonly string[]).includes(t)) {
    return t as QuestionType;
  }
  if (t === 'listen' || t === 'listening') return 'listen_meaning';
  if (t === 'writing' || t === 'write') return 'translate_write';
  if (t === 'recall_tl' || t === 'mcq') return 'read_meaning';
  if (t === 'choose_article') return 'fill_blank_choice';
  if (t === 'reading') return 'read_meaning';
  if (skill === 'listening') return 'listen_meaning';
  if (skill === 'writing') return 'translate_write';
  if (skill === 'speaking') return 'say_it';
  if (skill === 'grammar') return 'fill_blank_choice';
  return 'read_meaning';
}

export function isClosedQuestionType(type: string): boolean {
  return (
    type === 'listen_meaning' ||
    type === 'listen_pick_tl' ||
    type === 'listen_pick_image' ||
    type === 'fill_blank_choice' ||
    type === 'build_sentence' ||
    type === 'read_meaning' ||
    type === 'situation_choice' ||
    type === 'recall_tl' ||
    type === 'listen' ||
    type === 'choose_article'
  );
}

export function isOpenWriteType(type: string): boolean {
  return (
    type === 'dictation' ||
    type === 'translate_write' ||
    type === 'fill_blank_write' ||
    type === 'describe_image_write' ||
    type === 'reply_write' ||
    type === 'writing'
  );
}

export function isSpeakingType(type: string): boolean {
  return (
    type === 'say_it' ||
    type === 'reply_speak' ||
    type === 'describe_image_speak' ||
    type === 'read_aloud'
  );
}

/** Egyptian prompt likely includes time-of-day context for greeting variants. */
export function promptHasVariantContext(promptEg: string): boolean {
  const p = promptEg.replace(/\s+/g, '');
  return (
    /بالليل|بالصبح|الصباح|الصبح|بعدالضهر|بالعصر|بالليل|٩|٩|الساعة|صباح|مساء|ليل|ضهر|عصر|noite|tarde|manhã|bomdia|boatarde|boanoite/i.test(
      p,
    ) || /[٠-٩0-9]/.test(promptEg)
  );
}

export function arabicOptionsAreNearDupes(a: string, b: string): boolean {
  const na = a.replace(/\s+/g, '');
  const nb = b.replace(/\s+/g, '');
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}
