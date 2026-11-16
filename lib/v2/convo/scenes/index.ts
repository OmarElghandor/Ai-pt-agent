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
} from './check';
export {
  askTlHasPriceOrTime,
  numberWordsInAsk,
  replyKeepsAskNumbers,
} from './numbers';
export { personaJsonForScene, sceneCharacterPersonaJson } from './persona';

export function isSceneBank(bank: { kind?: string } | null | undefined): boolean {
  return bank?.kind === 'scene';
}
