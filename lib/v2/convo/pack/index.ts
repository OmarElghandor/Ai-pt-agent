export {
  ConvoPackDataSchema,
  ConvoChoiceQuestionSchema,
  ConvoOpenQuestionSchema,
  ConvoItemBankSchema,
  ConvoReactionLineSchema,
  ConvoMapVisualSchema,
  ConvoSceneCardVisualSchema,
  ConvoVisualSchema,
  ConvoGroupSchema,
  ConvoRecapSchema,
  ConvoSceneSchema,
  ConvoMistakeSchema,
  ConvoHelpLadderSchema,
  type ConvoPackData,
  type ConvoChoiceQuestion,
  type ConvoOpenQuestion,
  type ConvoItemBank,
  type ConvoReactionLine,
  type ConvoVisual,
  type ConvoMapVisual,
  type ConvoSceneCardVisual,
  type ConvoGroup,
  type ConvoRecap,
  type ConvoScene,
  type ConvoMistake,
  type ConvoHelpLadder,
  type ConvoCharacterLine,
  type ConvoItemSurface,
  type ConvoItemGlyph,
} from './schema';

export {
  validateConvoPack,
  containsItemSurface,
  type ValidateConvoPackOpts,
  type ValidateConvoPackResult,
} from './validate';

export {
  loadConvoPack,
  loadConvoPackAsync,
  loadConvoPackFromFile,
  readConvoPackFile,
  requireConvoPack,
  requireConvoPackAsync,
  convoPackPath,
  convoPackFileExists,
  convoPackExistsAsync,
  packIdToDay,
  packIdToLang,
  type LoadConvoPackOpts,
  type LoadConvoPackResult,
} from './load';

export {
  loadConvoItemSurfaces,
  surfaceTlFor,
  clearConvoItemSurfacesCache,
} from './surfaces';

export {
  ensureConvoPackReady,
  type EnsureConvoPackErrorCode,
  type EnsureConvoPackResult,
} from './ensure';
// EnsureConvoPackResult now includes a non-blocking `preparing` branch (P3).
