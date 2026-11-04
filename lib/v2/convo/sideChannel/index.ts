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
