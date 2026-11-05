import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { personaById, loadPersonasFile } from './personaLoad';
import { isOpenTopicId, OPEN_TOPIC } from './openTopic';
import type {
  FreeTopic,
  FreeTopicsFile,
  ThreadTopicFile,
} from './threadTypes';
import { validateThreadTopicFile } from './validateThreads';

const THREADS_DIR = path.join(process.cwd(), 'content/v2/convo/threads');

const threadCache = new Map<string, ThreadTopicFile>();
let freeTopicsCached: FreeTopicsFile | null = null;

export function threadsFilePath(
  topicId: string,
  targetLang: string = 'pt-PT',
  baseDir: string = THREADS_DIR,
): string {
  return path.join(baseDir, `${targetLang}.${topicId}.json`);
}

/** List topic ids that have a content-file thread bank. */
export function listThreadTopicIdsFromFiles(
  targetLang: string = 'pt-PT',
  baseDir: string = THREADS_DIR,
): string[] {
  if (!existsSync(baseDir)) return [];
  const prefix = `${targetLang}.`;
  return readdirSync(baseDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => f.slice(prefix.length, -'.json'.length))
    .sort();
}

/**
 * Content-word bank for off-topic: titles, shares, asks, follow-ups, chips.
 */
export function wordSetFromThreadFile(doc: ThreadTopicFile): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t) out.push(t);
  };
  push(doc.topic.title_tl);
  push(doc.topic.title_in_sentence_tl);
  for (const thread of doc.threads) {
    push(thread.share.tl);
    push(thread.ask.tl);
    for (const chip of thread.ask.frame.chips) push(chip);
    for (const fu of thread.follow_ups) {
      push(fu.tl);
      for (const chip of fu.frame.chips) push(chip);
    }
  }
  return out;
}

export function freeTopicFromThreadFile(doc: ThreadTopicFile): FreeTopic {
  return {
    id: doc.topic.id,
    title_tl: doc.topic.title_tl,
    title_ar: doc.topic.title_ar,
    title_in_sentence_tl: doc.topic.title_in_sentence_tl,
    character_id: doc.topic.character_id,
    intro_eg: doc.topic.intro_eg,
    opening_tl: doc.topic.opening_tl,
    opening_ar: doc.topic.opening_ar,
    related_topic_ids: [...doc.topic.related],
    word_set: wordSetFromThreadFile(doc),
  };
}

export function loadThreadTopicFromFile(
  topicId: string,
  opts?: { targetLang?: string; baseDir?: string },
): ThreadTopicFile {
  const targetLang = opts?.targetLang ?? 'pt-PT';
  const filePath = threadsFilePath(topicId, targetLang, opts?.baseDir);
  const cacheKey = filePath;
  if (threadCache.has(cacheKey)) return threadCache.get(cacheKey)!;

  if (!existsSync(filePath)) {
    throw new Error(`thread file missing: ${filePath}`);
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;

  let addressIsTu = true;
  try {
    const personas = loadPersonasFile();
    const topicIdGuess =
      raw && typeof raw === 'object' && 'topic' in raw
        ? (raw as { topic?: { character_id?: string } }).topic?.character_id
        : undefined;
    if (topicIdGuess) {
      const persona = personaById(topicIdGuess, personas);
      if (persona) addressIsTu = persona.address === 'tu';
    }
  } catch {
    // personas optional during isolated fixture tests
  }

  const result = validateThreadTopicFile(raw, { addressIsTu });
  if (!result.ok || !result.doc) {
    throw new Error(
      `threads invalid for ${topicId}: ${result.issues
        .map((i) => `${i.path}: ${i.message}`)
        .join('; ')}`,
    );
  }
  if (!opts?.baseDir || opts.baseDir === THREADS_DIR) {
    threadCache.set(cacheKey, result.doc);
  }
  return result.doc;
}

export function requireThreadTopic(
  topicId: string,
  opts?: { targetLang?: string; baseDir?: string },
): ThreadTopicFile {
  return loadThreadTopicFromFile(topicId, opts);
}

export function loadThreadTopic(
  topicId: string,
  opts?: { targetLang?: string; baseDir?: string },
): ThreadTopicFile {
  return loadThreadTopicFromFile(topicId, opts);
}

/** Test helper. */
export function clearThreadCache(): void {
  threadCache.clear();
  freeTopicsCached = null;
}

export function loadFreeTopicsFile(
  targetLang: string = 'pt-PT',
  baseDir: string = THREADS_DIR,
): FreeTopicsFile {
  if (freeTopicsCached && targetLang === 'pt-PT' && baseDir === THREADS_DIR) {
    return freeTopicsCached;
  }
  const ids = listThreadTopicIdsFromFiles(targetLang, baseDir);
  const topics = ids.map((id) =>
    freeTopicFromThreadFile(
      loadThreadTopicFromFile(id, { targetLang, baseDir }),
    ),
  );
  const file: FreeTopicsFile = { target_lang: targetLang, topics };
  if (targetLang === 'pt-PT' && baseDir === THREADS_DIR) {
    freeTopicsCached = file;
  }
  return file;
}

export function freeTopicById(
  topicId: string,
  file: FreeTopicsFile = loadFreeTopicsFile(),
): FreeTopic | null {
  if (isOpenTopicId(topicId)) return OPEN_TOPIC;
  return file.topics.find((t) => t.id === topicId) ?? null;
}

export function requireFreeTopic(topicId: string): FreeTopic {
  const t = freeTopicById(topicId);
  if (!t) throw new Error(`free topic not found: ${topicId}`);
  return t;
}

/**
 * Flatten thread asks + follow-ups into angle-shaped rows.
 * Transitional for callers not yet on the C2 step machine; remove with C2.
 */
export function topicAnglesFromThreads(doc: ThreadTopicFile): {
  target_lang: string;
  topic_id: string;
  angles: Array<{ id: string; tl: string; item_hints: string[] }>;
  version: number;
} {
  const angles: Array<{ id: string; tl: string; item_hints: string[] }> = [];
  for (const thread of doc.threads) {
    angles.push({
      id: `${thread.id}.ask`,
      tl: thread.ask.tl,
      item_hints: [...thread.ask.frame.chips],
    });
    for (let i = 0; i < thread.follow_ups.length; i++) {
      const fu = thread.follow_ups[i]!;
      angles.push({
        id: `${thread.id}.fu${i}`,
        tl: fu.tl,
        item_hints: [...fu.frame.chips],
      });
    }
  }
  return {
    target_lang: doc.target_lang,
    topic_id: doc.topic.id,
    angles,
    version: doc.version,
  };
}

/** @deprecated Prefer loadThreadTopic; shim until C2 nextLine. */
export function loadTopicAngles(
  topicId: string,
  opts?: { targetLang?: string; baseDir?: string },
) {
  return topicAnglesFromThreads(loadThreadTopicFromFile(topicId, opts));
}

/** @deprecated Prefer requireThreadTopic. */
export function requireTopicAngles(
  topicId: string,
  opts?: { targetLang?: string; baseDir?: string },
) {
  return loadTopicAngles(topicId, opts);
}
