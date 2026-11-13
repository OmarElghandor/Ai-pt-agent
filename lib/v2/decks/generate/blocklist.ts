/**
 * Cheap topic blocklist before the model call (12 §2.3).
 * Obvious cases cost nothing.
 */

const BLOCKED = [
  // sexual
  'جنس',
  'سكس',
  'نيك',
  'عورة',
  'porn',
  'sex',
  'xxx',
  // drugs
  'حشيش',
  'كوكايين',
  'هيروين',
  'مخدرات',
  'cocaine',
  'heroin',
  'weed',
  // hate / violence
  'اقتل',
  'قتل',
  'إرهاب',
  'ارهاب',
  'نازية',
  'kill',
  'terror',
  // insults (short list)
  'شرموطة',
  'عرص',
  'كس ام',
];

export type TopicBlockResult =
  | { ok: true; topic: string }
  | { ok: false; reason: string };

export function checkTopicBlocklist(raw: string): TopicBlockResult {
  const topic = raw.trim().slice(0, 60);
  if (!topic) {
    return { ok: false, reason: 'empty' };
  }
  const lower = topic.toLowerCase();
  for (const word of BLOCKED) {
    if (lower.includes(word.toLowerCase())) {
      return { ok: false, reason: 'blocklist' };
    }
  }
  return { ok: true, topic };
}

export const TOPIC_REJECT_EG =
  'مش هنقدر نعمل ديك للموضوع ده، جرّب موضوع تاني';
