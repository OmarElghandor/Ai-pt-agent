import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ConvoGoalBank } from './types';
import { parseLessonDayBankJson } from './loadLessonDay';
import { ensureBankRequiredItems } from './requiredItems';

const DEFAULT_GOALS_DIR = path.join(process.cwd(), 'content/v2/convo/goals');

export function authoredTopicBankPath(
  topicId: string,
  opts?: { targetLang?: string; baseDir?: string },
): string {
  const lang = opts?.targetLang ?? 'pt-PT';
  const dir = opts?.baseDir ?? DEFAULT_GOALS_DIR;
  return path.join(dir, `${lang}.topic-${topicId}.json`);
}

/** Load authored topic bank (`pt-PT.topic-*.json`) if present. */
export function loadAuthoredTopicBank(
  topicId: string,
  opts?: { targetLang?: string; baseDir?: string },
): ConvoGoalBank | null {
  const filePath = authoredTopicBankPath(topicId, opts);
  if (!existsSync(filePath)) return null;
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  const bank = parseLessonDayBankJson(raw);
  if (!bank.topic_id) bank.topic_id = topicId;
  return ensureBankRequiredItems(bank);
}

/** List authored topic bank ids from the goals directory. */
export function listAuthoredTopicBankIds(opts?: {
  targetLang?: string;
  baseDir?: string;
}): string[] {
  const lang = opts?.targetLang ?? 'pt-PT';
  const dir = opts?.baseDir ?? DEFAULT_GOALS_DIR;
  if (!existsSync(dir)) return [];
  const prefix = `${lang}.topic-`;
  const suffix = '.json';
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
    .map((f) => f.slice(prefix.length, -suffix.length))
    .filter(Boolean)
    .sort();
}
