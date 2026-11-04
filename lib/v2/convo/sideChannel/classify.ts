import { needsSideChannel } from './detect';
import { isTopicRequestText } from './topicRequest';

export type SideChannelKind =
  | 'arabic_answer'
  | 'language_question'
  | 'topic_request'
  | 'other'
  | null;

/** Egyptian / MSA patterns for “what does X mean / how do I say X”. */
const LANGUAGE_QUESTION_RE =
  /يعني\s*إيه|ازاي\s*أقول|ازاى\s*أقول|ايه\s*معنى|إيه\s*معنى|معناها|معناها؟|كيف\s*أقول|ما\s*معنى/;

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

  if (LANGUAGE_QUESTION_RE.test(t)) {
    return 'language_question';
  }

  // Arabic / mixed that is not a language question → treat as answer-in-Arabic
  // (or other Arabic chit-chat; T3.1 uses the same bank invite).
  return 'arabic_answer';
}
