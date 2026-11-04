/**
 * Free-chat catalogue loaders. Angles are gone; topics come from thread files.
 * Re-exports threadLoad for callers that still import from freeLoad.
 */
export {
  clearThreadCache as clearFreeTopicsCache,
  freeTopicById,
  freeTopicFromThreadFile,
  listThreadTopicIdsFromFiles,
  loadFreeTopicsFile,
  loadThreadTopic,
  loadThreadTopicFromFile,
  loadTopicAngles,
  requireFreeTopic,
  requireThreadTopic,
  requireTopicAngles,
  threadsFilePath,
  topicAnglesFromThreads,
  wordSetFromThreadFile,
} from './threadLoad';
