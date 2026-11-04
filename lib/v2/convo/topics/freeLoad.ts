import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2TopicAnglesModel } from '@/lib/v2/mongo/models';
import type {
  FreeTopic,
  FreeTopicsFile,
  TopicAnglesDoc,
} from './freeTypes';
import { validateTopicAngles } from './validateAngles';

const FREE_TOPICS_PATH = path.join(
  process.cwd(),
  'content/v2/convo/free-topics.pt-PT.json',
);

const ANGLES_DIR = path.join(process.cwd(), 'content/v2/convo/angles');

let freeTopicsCached: FreeTopicsFile | null = null;

function isFreeTopic(v: unknown): v is FreeTopic {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title_tl === 'string' &&
    typeof o.title_ar === 'string' &&
    typeof o.character_id === 'string' &&
    Array.isArray(o.word_set) &&
    o.word_set.every((w) => typeof w === 'string') &&
    Array.isArray(o.related_topic_ids) &&
    o.related_topic_ids.every((w) => typeof w === 'string')
  );
}

export function parseFreeTopicsFile(raw: unknown): FreeTopicsFile {
  if (!raw || typeof raw !== 'object') {
    throw new Error('free-topics file: expected object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.target_lang !== 'string') {
    throw new Error('free-topics file: target_lang required');
  }
  if (!Array.isArray(o.topics) || !o.topics.every(isFreeTopic)) {
    throw new Error('free-topics file: topics invalid');
  }
  return {
    target_lang: o.target_lang,
    topics: o.topics.map((t) => ({
      id: t.id,
      title_tl: t.title_tl,
      title_ar: t.title_ar,
      character_id: t.character_id,
      word_set: [...t.word_set],
      related_topic_ids: [...t.related_topic_ids],
    })),
  };
}

export function loadFreeTopicsFile(
  filePath: string = FREE_TOPICS_PATH,
): FreeTopicsFile {
  if (freeTopicsCached && filePath === FREE_TOPICS_PATH) return freeTopicsCached;
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  const file = parseFreeTopicsFile(raw);
  if (filePath === FREE_TOPICS_PATH) freeTopicsCached = file;
  return file;
}

/** Test helper. */
export function clearFreeTopicsCache(): void {
  freeTopicsCached = null;
}

export function freeTopicById(
  topicId: string,
  file: FreeTopicsFile = loadFreeTopicsFile(),
): FreeTopic | null {
  return file.topics.find((t) => t.id === topicId) ?? null;
}

export function anglesFilePath(
  topicId: string,
  targetLang: string = 'pt-PT',
  baseDir: string = ANGLES_DIR,
): string {
  return path.join(baseDir, `${targetLang}.${topicId}.json`);
}

export function loadTopicAnglesFromFile(
  topicId: string,
  opts?: { targetLang?: string; baseDir?: string },
): TopicAnglesDoc {
  const targetLang = opts?.targetLang ?? 'pt-PT';
  const filePath = anglesFilePath(topicId, targetLang, opts?.baseDir);
  if (!existsSync(filePath)) {
    throw new Error(`angles file missing: ${filePath}`);
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  const result = validateTopicAngles(raw);
  if (!result.ok || !result.doc) {
    throw new Error(
      `angles invalid for ${topicId}: ${result.issues
        .map((i) => i.message)
        .join('; ')}`,
    );
  }
  return result.doc;
}

async function loadTopicAnglesFromMongo(
  topicId: string,
  targetLang: string,
): Promise<TopicAnglesDoc | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2TopicAnglesModel()
    .findOne({ topic_id: topicId, target_lang: targetLang })
    .sort({ version: -1 })
    .lean();
  if (!doc?.angles?.length) return null;
  const result = validateTopicAngles({
    target_lang: doc.target_lang,
    topic_id: doc.topic_id,
    angles: doc.angles,
    version: doc.version,
  });
  return result.ok ? result.doc : null;
}

/**
 * Load angles: Mongo first, then content file (same pattern as convo packs).
 */
export async function loadTopicAnglesAsync(
  topicId: string,
  opts?: { targetLang?: string; preferMongo?: boolean },
): Promise<TopicAnglesDoc> {
  const targetLang = opts?.targetLang ?? 'pt-PT';
  if (opts?.preferMongo !== false) {
    try {
      const fromMongo = await loadTopicAnglesFromMongo(topicId, targetLang);
      if (fromMongo) return fromMongo;
    } catch {
      // fall through to file
    }
  }
  return loadTopicAnglesFromFile(topicId, { targetLang });
}

export function loadTopicAngles(
  topicId: string,
  opts?: { targetLang?: string; baseDir?: string },
): TopicAnglesDoc {
  return loadTopicAnglesFromFile(topicId, opts);
}

export function requireTopicAngles(
  topicId: string,
  opts?: { targetLang?: string; baseDir?: string },
): TopicAnglesDoc {
  return loadTopicAnglesFromFile(topicId, opts);
}

/** List topic ids that have a content-file angle bank. */
export function listAngleTopicIdsFromFiles(
  targetLang: string = 'pt-PT',
  baseDir: string = ANGLES_DIR,
): string[] {
  if (!existsSync(baseDir)) return [];
  const prefix = `${targetLang}.`;
  return readdirSync(baseDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => f.slice(prefix.length, -'.json'.length))
    .sort();
}
