import { needsSideChannel } from './detect';
import { normalizeAr } from './normalizeAr';
import { isTopicRequestText } from './topicRequest';

export type SideChannelKind =
  | 'arabic_answer'
  | 'language_question'
  | 'topic_request'
  | 'other'
  | null;

/**
 * Egyptian / MSA patterns for “what does X mean / how do I say X”.
 * Matched against normalizeAr(text) so hamza/ya/ta-marbuta are folded.
 */
const LANGUAGE_QUESTION_RE =
  /(ازاي|ازاى|كيف)\s*(اقول|نقول|بيقولوا|بقول)|يعني\s*ايه|ايه\s*معنى|ما\s*معنى|معناها|معنى|ترجمه|بالبرتغالي\s*ايه|قولي\b.*بالبرتغالي/;

/**
 * Classify a learner message for the Arabic side channel (09 §6).
 * Returns null when the message should go to normal grading.
 */
export function classifySideChannel(text: string): SideChannelKind {
  const t = text.trim();
  if (!t || !needsSideChannel(t)) return null;

  if (isTopicRequestText(t)) {
    return 'topic_request';
  }

  const norm = normalizeAr(t);
  if (LANGUAGE_QUESTION_RE.test(norm)) {
    return 'language_question';
  }

  // Arabic / mixed that is not a language question → treat as answer-in-Arabic
  // (or other Arabic chit-chat; T3.1 uses the same bank invite).
  return 'arabic_answer';
}
