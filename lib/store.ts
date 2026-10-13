import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { warmTaggedAudio } from './audioCache';
import { isThreadStale } from './history';
import { composeOpener } from './opener';
import type { CefrLevel } from './prompts';
import {
  emptyProgress,
  migrateProgress,
  migrateStoredMessage,
  type LearnerFile,
  type TypedMessage,
} from './progressTypes';

const dir = path.join(process.cwd(), 'data', 'learners');

const memory = new Map<string, LearnerFile>();

function assertId(id: string): void {
  if (!/^[\w-]{8,80}$/.test(id)) {
    throw new Error('Invalid learner id');
  }
}

function filePath(id: string): string {
  return path.join(dir, `${id}.json`);
}

function logPath(id: string): string {
  return path.join(dir, `${id}.log`);
}

function createLearner(id: string): LearnerFile {
  const now = Date.now();
  return {
    id,
    level: 'A0',
    visible: [],
    archive: [],
    progress: emptyProgress(),
    createdAt: now,
    updatedAt: now,
  };
}

function normalize(raw: LearnerFile): LearnerFile {
  const visible = (raw.visible ?? []).map((m, i) => migrateStoredMessage(m, i));
  const archive = (raw.archive ?? []).map((m, i) => migrateStoredMessage(m, i + 10_000));
  return {
    ...createLearner(raw.id),
    ...raw,
    visible,
    archive,
    progress: migrateProgress(raw.progress),
  };
}

export function readLearner(id: string): LearnerFile {
  assertId(id);
  const cached = memory.get(id);
  if (cached) return structuredClone(cached);
  const file = filePath(id);
  if (existsSync(file)) {
    const parsed = normalize(JSON.parse(readFileSync(file, 'utf8')) as LearnerFile);
    memory.set(id, parsed);
    return structuredClone(parsed);
  }
  const fresh = createLearner(id);
  writeLearner(fresh);
  return structuredClone(fresh);
}

export function writeLearner(file: LearnerFile): void {
  assertId(file.id);
  file.updatedAt = Date.now();
  memory.set(file.id, structuredClone(file));
  mkdirSync(dir, { recursive: true });
  const dest = filePath(file.id);
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, JSON.stringify(file));
  renameSync(tmp, dest);
}

export function appendLearnerLog(id: string, line: string): void {
  assertId(id);
  mkdirSync(dir, { recursive: true });
  appendFileSync(logPath(id), `${line}\n`);
}

function insertOpener(file: LearnerFile, localHour: number): void {
  const opener = composeOpener(file, localHour);
  file.visible.push(opener.message);
  file.progress.lastOpenerSituation = opener.situation;
  file.progress.openerCursor[opener.situation] = opener.nextCursor;
  file.progress.lastLogLine = opener.logLine;
  if (opener.situation === 'finished') file.progress.finishedLastTime = false;
  appendLearnerLog(file.id, opener.logLine);
  // Warm Portuguese audio for the opener chat message
  const pt = opener.message.segments
    .filter((s) => s.lang === 'pt')
    .map((s) => s.text)
    .join(' ');
  if (pt) {
    void warmTaggedAudio(`<pt>${pt}</pt>`);
  }
}

/** Empty thread, a stale thread, or an explicit new conversation. */
export function openLearner(
  id: string,
  localHour: number,
  opts?: { forceNew?: boolean; now?: number },
): LearnerFile {
  const file = readLearner(id);
  const now = opts?.now ?? Date.now();
  const lastAt = file.visible.at(-1)?.at ?? null;
  const needsOpener =
    opts?.forceNew || file.visible.length === 0 || isThreadStale(lastAt, now);
  if (!needsOpener) return file;
  if (file.visible.length > 0) {
    file.archive.push(...file.visible);
    file.visible = [];
  }
  insertOpener(file, localHour);
  writeLearner(file);
  return readLearner(id);
}

export function setLearnerLevel(id: string, level: CefrLevel): LearnerFile {
  const file = readLearner(id);
  file.level = level;
  writeLearner(file);
  return readLearner(id);
}

export function dismissLearnerUi(id: string, _flags?: Record<string, unknown>): LearnerFile {
  void _flags;
  return readLearner(id);
}

export type { TypedMessage };
