import { isEnglishSideChannel, needsSideChannel } from './detect';
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

/** English “how do I say / what does X mean”. */
const ENGLISH_LANGUAGE_QUESTION_RE =
  /\b(how\s+(do\s+i|can\s+i|to)\s+say|how\s+i\s+can\s+say|what\s+does\s+\S+\s+mean|what\s+is\s+\S+|how\s+do\s+you\s+say|translate|meaning\s+of)\b/i;

/**
 * Classify a learner message for the Arabic/English side channel (09 §6).
 * Returns null when the message should go to normal grading.
 */
export function classifySideChannel(text: string): SideChannelKind {
  const t = text.trim();
  if (!t || !needsSideChannel(t)) return null;

  // English never goes to the character (S2).
  if (isEnglishSideChannel(t)) {
    if (ENGLISH_LANGUAGE_QUESTION_RE.test(t)) {
      return 'language_question';
    }
    return 'other';
  }

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
