/**
 * Free-chat catalogue loaders. Angles are gone; topics come from thread files
 * plus authored / lesson-day / generated banks via resolveFreeTopic.
 */
export {
  clearThreadCache as clearFreeTopicsCache,
  freeTopicFromThreadFile,
  listThreadTopicIdsFromFiles,
  loadFreeTopicsFile,
  loadThreadTopic,
  loadThreadTopicFromFile,
  loadTopicAngles,
  requireThreadTopic,
  requireTopicAngles,
  threadsFilePath,
  topicAnglesFromThreads,
  wordSetFromThreadFile,
  threadCatalogTopicById,
} from './threadLoad';

export {
  freeTopicById,
  freeTopicFromGoalBank,
  parseLessonDayTopicId,
  requireFreeTopic,
  resolveFreeTopic,
} from './resolveFreeTopic';
