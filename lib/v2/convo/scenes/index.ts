import type { ConvoGoalBank } from '@/lib/v2/convo/goals/types';

export type { SceneIndex, ScenePathEntry } from './types';
export {
  askTlEndsOpen,
  sceneOpenAskIssues,
  validateSceneBank,
} from './validate';
export {
  clearSceneLoadCache,
  listSceneBankFiles,
  listSceneIdsFromIndex,
  loadAllSceneBanks,
  loadSceneBank,
  loadSceneIndex,
  normalizeSceneId,
  parseSceneBankJson,
  parseSceneIndex,
  sceneBankPath,
  scenesDir,
} from './load';
export {
  checkSceneGoals,
  fuzzyMatchesExampleAtLeastTwoWords,
  type SceneMatchResult,
} from './check';
export {
  askTlHasPriceOrTime,
  numberWordsInAsk,
  reactionInventedNumbers,
  replyKeepsAskNumbers,
} from './numbers';
export { firstWords, stripRepeatedOpener } from './opener';
export {
  goalExamplesIncludeRepeat,
  isSceneRepeatRequest,
} from './repeat';
export { personaJsonForScene, sceneCharacterPersonaJson } from './persona';
export {
  buildSceneCatalog,
  nextSceneIdOnPath,
  nextUnfinishedSceneIdOnPath,
  type SceneCatalog,
  type SceneCatalogEntry,
} from './catalog';
export {
  listActiveScenesByTopic,
  listFinishedSceneIds,
} from './progress';
export {
  buildSceneReactionPrompt,
  collectSceneFacts,
  sceneLevelExtraAllowed,
} from './prompt';
export {
  guardSceneReaction,
  parseSceneModelOutput,
  reactionEchoesLearner,
  type SceneReactionGuard,
} from './reaction';
export { runSceneTurn, type RunSceneTurnInput } from './runSceneTurn';
export {
  callSceneQwen,
  parseSceneQwenJson,
  sceneQwenCandidatesFromOpen,
  validateSceneQwenResult,
  type SceneQwenResult,
} from './qwenScene';
export {
  buildSceneLangHelpLexicon,
  callSceneLangHelp,
  matchGlossaryEntry,
  parseSceneLangHelpJson,
  resolveSceneLangHelp,
  sceneLangHelpPassesCheck,
  type SceneLangHelpCoach,
  type SceneLangHelpResult,
} from './sceneLangHelp';
export {
  isWeakWordOrPhrase,
  messageContainsKeyword,
  messageHasAnyKeyword,
  messageHasStrongKeyword,
  normalizeSceneText,
  sceneKeywordMatchesToken,
  SCENE_WEAK_WORDS,
} from './weak';
export { reactionHasNewContentWords } from './reaction';
export { isAtLeast80Similar, sceneExampleSimilarity } from './similarity';

/** Scene banks are goal banks with `kind: 'scene'` (role-play packs). */
export type ConvoSceneBank = ConvoGoalBank & { kind: 'scene' };

export function isSceneBank(
  bank: ConvoGoalBank | null | undefined,
): bank is ConvoSceneBank {
  return bank != null && bank.kind === 'scene';
}
