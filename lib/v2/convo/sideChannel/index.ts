export {
  hasArabicScript,
  isMixedScript,
  needsSideChannel,
  isArabicOnly,
} from './detect';
export { classifySideChannel, type SideChannelKind } from './classify';
export { handleArabicAnswer } from './handleArabicAnswer';
export {
  matchPackItemQuestion,
  type PackItemMatch,
} from './matchPackItem';
export { handleLanguageQuestionFromPack } from './handleLanguageQuestion';
export {
  COACH_CALL_FALLBACK_EG,
  COACH_CALL_TIMEOUT_MS,
  COACH_SIDE_SYSTEM,
  COACH_SUFFIX_EG,
  createLiveConvoCoachCaller,
  createStubConvoCoachCaller,
  finalizeCoachReply,
  stripCoachSuffix,
  validateCoachReply,
  type CoachCallInput,
  type CoachCallResult,
  type CoachValidation,
  type ConvoCoachCaller,
} from './coachCall';
export { handleLanguageQuestionCoachCall } from './handleCoachCall';
export {
  isTopicRequestText,
  matchTopicRequest,
  logUnmatchedTopicRequest,
  logUnmatchedTopicRequestSync,
  drainMemoryTopicRequests,
  topicRequestCoachEg,
} from './topicRequest';
