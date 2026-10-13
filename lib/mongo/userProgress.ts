/**
 * Compatibility shim — reads go through langifyRead (RO).
 * Writes moved to practice_progress (see lib/mongo/practiceProgress.ts).
 */
export {
  loadKnownForSession as loadUserProgress,
  loadKnownForUser,
  requirementsMet,
  formatKnownForPrompt,
  toKnownProgress,
  type KnownProgress,
} from '@/lib/langifyRead';

export {
  markLessonPracticed,
  markCellsPracticed as markCellsPracticedInChat,
  markCellsAssessed as markCellsAssessedPassed,
} from './practiceProgress';
