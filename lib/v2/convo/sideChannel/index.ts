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
  createLiveConvoCoachCaller,
  createStubConvoCoachCaller,
  type CoachCallInput,
  type CoachCallResult,
  type ConvoCoachCaller,
} from './coachCall';
export { handleLanguageQuestionCoachCall } from './handleCoachCall';
