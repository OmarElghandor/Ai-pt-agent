export {
  computeWeight,
  freqPoints,
  reusePoints,
  type ComputeWeightInput,
  type ComputeWeightResult,
} from './compute';
export {
  buildFreqRankMap,
  buildPalavrasSet,
  contentTokens,
  headWordForFreq,
  inPalavrasSet,
  lookupFreqRank,
  normalizeFreqWord,
  PALAVRAS_FALLBACK_RANK,
  type FreqRankMap,
} from './freq';
export {
  introducedDayById,
  reuseCountForItem,
  reuseCountsForFile,
} from './reuse';
export {
  CUSTOM_ONLY_WEIGHT,
  isCustomOnlyItemId,
  weightOrDefault,
} from './lookup';
export {
  buildWeightRows,
  type BuildWeightRowsOpts,
  type ItemWeightRow,
} from './buildRows';
export {
  loadFreqRankMap,
  recomputeItemWeights,
  weightForItemId,
} from './persist';
