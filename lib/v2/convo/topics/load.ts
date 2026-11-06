import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { convoPackPath } from '@/lib/v2/convo/pack';
import { buildTopicsFromCurriculum } from './fromCurriculum';
import type { TopicsFile, TopicsFileTheme, TopicsFileTopic } from './types';

const DEFAULT_PATH = path.join(
  process.cwd(),
  'content/v2/convo/topics.pt-PT.json',
);

let cached: TopicsFile | null = null;

function isTopic(v: unknown): v is TopicsFileTopic {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title_tl === 'string' &&
    typeof o.title_ar === 'string' &&
    typeof o.day === 'number' &&
    typeof o.pack_id === 'string' &&
    Array.isArray(o.item_ids) &&
    o.item_ids.every((id) => typeof id === 'string') &&
    (o.subtitle_eg === undefined || typeof o.subtitle_eg === 'string')
  );
}

function isTheme(v: unknown): v is TopicsFileTheme {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title_tl === 'string' &&
    typeof o.title_ar === 'string' &&
    Array.isArray(o.topics) &&
    o.topics.every(isTopic)
  );
}

export function parseTopicsFile(raw: unknown): TopicsFile {
  if (!raw || typeof raw !== 'object') {
    throw new Error('topics file: expected object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.target_lang !== 'string') {
    throw new Error('topics file: target_lang required');
  }
  if (!Array.isArray(o.themes) || !o.themes.every(isTheme)) {
    throw new Error('topics file: themes invalid');
  }
  return {
    target_lang: o.target_lang,
    themes: o.themes.map((t) => ({
      id: t.id,
      title_tl: t.title_tl,
      title_ar: t.title_ar,
      topics: t.topics.map((topic) => ({
        id: topic.id,
        title_tl: topic.title_tl,
        title_ar: topic.title_ar,
        day: topic.day,
        pack_id: topic.pack_id,
        item_ids: [...topic.item_ids],
        ...(typeof topic.character_id === 'string'
          ? { character_id: topic.character_id }
          : {}),
        ...(typeof topic.free_topic_id === 'string'
          ? { free_topic_id: topic.free_topic_id }
          : {}),
        ...(typeof topic.subtitle_eg === 'string'
          ? { subtitle_eg: topic.subtitle_eg }
          : {}),
      })),
    })),
  };
}

/**
 * Learn catalog: curriculum days + core items, with themes/overrides from
 * topics.pt-PT.json (P8). Pass a non-default path to load that JSON alone
 * (tests / overrides inspection).
 */
export function loadTopicsFile(filePath: string = DEFAULT_PATH): TopicsFile {
  if (cached && filePath === DEFAULT_PATH) return cached;

  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  const overrides = parseTopicsFile(raw);

  if (filePath !== DEFAULT_PATH) {
    return overrides;
  }

  const file = buildTopicsFromCurriculum({ overridesFile: overrides });
  cached = file;
  return file;
}

/** Whether a content-file pack exists for this pack id (placeholders stay closed). */
export function convoPackFileExists(packId: string): boolean {
  return existsSync(convoPackPath(packId));
}

/** Test helper: clear the module cache. */
export function clearTopicsFileCache(): void {
  cached = null;
}
