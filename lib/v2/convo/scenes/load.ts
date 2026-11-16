import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ConvoGoalBank } from '@/lib/v2/convo/goals/types';
import {
  parseGoalFromRaw,
  parseSceneFromRaw,
} from '@/lib/v2/convo/goals/loadLessonDay';
import type { SceneIndex, ScenePathEntry } from './types';
import { validateSceneBank } from './validate';

const DEFAULT_SCENES_DIR = path.join(process.cwd(), 'content/v2/convo/scenes');

let indexCache: SceneIndex | null = null;
const bankCache = new Map<string, ConvoGoalBank>();

export function clearSceneLoadCache(): void {
  indexCache = null;
  bankCache.clear();
}

export function scenesDir(opts?: { baseDir?: string }): string {
  return opts?.baseDir ?? DEFAULT_SCENES_DIR;
}

export function sceneBankPath(
  sceneId: string,
  opts?: { targetLang?: string; baseDir?: string },
): string {
  const lang = opts?.targetLang ?? 'pt-PT';
  return path.join(scenesDir(opts), `${lang}.cena-${stripCenaPrefix(sceneId)}.json`);
}

/** Accept `cena-cafe` or `cafe` → file stem `cafe`. */
function stripCenaPrefix(sceneId: string): string {
  const id = sceneId.trim();
  return id.startsWith('cena-') ? id.slice('cena-'.length) : id;
}

/** Normalize to catalog id `cena-cafe`. */
export function normalizeSceneId(sceneId: string): string {
  const id = sceneId.trim();
  if (!id) return id;
  return id.startsWith('cena-') ? id : `cena-${id}`;
}

function parsePathEntry(raw: unknown, i: number): ScenePathEntry {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`scene index: path[${i}] invalid`);
  }
  const sc = raw as Record<string, unknown>;
  if (
    typeof sc.n !== 'number' ||
    typeof sc.id !== 'string' ||
    typeof sc.round !== 'number' ||
    typeof sc.emoji !== 'string' ||
    typeof sc.title_tl !== 'string' ||
    typeof sc.title_ar !== 'string' ||
    typeof sc.recommended_day !== 'number'
  ) {
    throw new Error(`scene index: path[${i}] invalid`);
  }
  return {
    n: sc.n,
    id: sc.id,
    round: sc.round,
    emoji: sc.emoji,
    title_tl: sc.title_tl,
    title_ar: sc.title_ar,
    recommended_day: sc.recommended_day,
  };
}

export function parseSceneIndex(raw: unknown): SceneIndex {
  if (!raw || typeof raw !== 'object') {
    throw new Error('scene index: expected object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.target_lang !== 'string') {
    throw new Error('scene index: target_lang required');
  }
  if (!Array.isArray(o.path) || o.path.length === 0) {
    throw new Error('scene index: path must be a non-empty array');
  }
  const pathEntries = o.path.map((entry, i) => parsePathEntry(entry, i));
  for (let i = 0; i < pathEntries.length; i++) {
    if (pathEntries[i].n !== i + 1) {
      throw new Error(
        `scene index: path[${i}].n expected ${i + 1}, got ${pathEntries[i].n}`,
      );
    }
  }
  const ids = pathEntries.map((p) => p.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('scene index: path ids must be unique');
  }
  return { target_lang: o.target_lang, path: pathEntries };
}

export function loadSceneIndex(opts?: {
  targetLang?: string;
  baseDir?: string;
}): SceneIndex {
  if (indexCache && !opts?.baseDir && !opts?.targetLang) {
    return indexCache;
  }
  const lang = opts?.targetLang ?? 'pt-PT';
  const filePath = path.join(scenesDir(opts), `${lang}.index.json`);
  if (!existsSync(filePath)) {
    throw new Error(`scene index missing: ${filePath}`);
  }
  const index = parseSceneIndex(
    JSON.parse(readFileSync(filePath, 'utf8')) as unknown,
  );
  if (!opts?.baseDir && !opts?.targetLang) {
    indexCache = index;
  }
  return index;
}

/** Parse + validate a scene bank JSON object. */
export function parseSceneBankJson(raw: unknown): ConvoGoalBank {
  if (!raw || typeof raw !== 'object') {
    throw new Error('scene bank: expected object');
  }
  const doc = raw as Record<string, unknown>;
  if (doc.kind !== 'scene') {
    throw new Error('scene bank: kind must be "scene"');
  }

  const openingRaw = doc.opening as Record<string, unknown> | undefined;
  const closingRaw = doc.closing as Record<string, unknown> | undefined;
  const goalsRaw = Array.isArray(doc.goals) ? doc.goals : [];

  const bank: ConvoGoalBank = {
    source: 'topic',
    kind: 'scene',
    goals: goalsRaw.map((g) =>
      parseGoalFromRaw((g ?? {}) as Record<string, unknown>),
    ),
    suggested_words: Array.isArray(doc.suggested_words)
      ? doc.suggested_words.map((w) => String(w))
      : [],
    scene: parseSceneFromRaw(doc.scene),
    authored: true,
  };

  if (typeof doc.topic_id === 'string') bank.topic_id = doc.topic_id;
  if (typeof doc.title_tl === 'string') bank.title_tl = doc.title_tl;
  if (typeof doc.title_ar === 'string') bank.title_ar = doc.title_ar;
  if (typeof doc.intro_eg === 'string') bank.intro_eg = doc.intro_eg;
  if (typeof doc.scene_eg === 'string') bank.scene_eg = doc.scene_eg;
  if (typeof doc.emoji === 'string') bank.emoji = doc.emoji;
  if (typeof doc.recommended_day === 'number') {
    bank.recommended_day = doc.recommended_day;
  }
  if (Array.isArray(doc.required_items)) {
    bank.required_items = doc.required_items
      .map((id) => String(id))
      .filter(Boolean);
  }
  if (Array.isArray(doc.new_items_tl)) {
    bank.new_items_tl = doc.new_items_tl.map((s) => String(s)).filter(Boolean);
  } else if (Array.isArray(doc.new_tl)) {
    bank.new_items_tl = doc.new_tl.map((s) => String(s)).filter(Boolean);
  }

  if (openingRaw && typeof openingRaw === 'object') {
    bank.opening = {
      tl: String(openingRaw.tl ?? ''),
      ar: String(openingRaw.ar ?? ''),
      ...(typeof openingRaw.tl_f === 'string'
        ? { tl_f: openingRaw.tl_f }
        : {}),
      ...(typeof openingRaw.ar_f === 'string'
        ? { ar_f: openingRaw.ar_f }
        : {}),
    };
  }
  if (closingRaw && typeof closingRaw === 'object') {
    bank.closing = {
      tl: String(closingRaw.tl ?? ''),
      ar: String(closingRaw.ar ?? ''),
      ...(typeof closingRaw.tl_f === 'string'
        ? { tl_f: closingRaw.tl_f }
        : {}),
      ...(typeof closingRaw.ar_f === 'string'
        ? { ar_f: closingRaw.ar_f }
        : {}),
    };
  }

  const { ok, issues } = validateSceneBank(bank);
  if (!ok) {
    throw new Error(
      `Invalid scene bank${bank.topic_id ? ` ${bank.topic_id}` : ''}: ${issues
        .map((i) => `${i.path}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return bank;
}

export function loadSceneBank(
  sceneId: string,
  opts?: { targetLang?: string; baseDir?: string },
): ConvoGoalBank {
  const id = normalizeSceneId(sceneId);
  const cacheKey = `${opts?.targetLang ?? 'pt-PT'}:${id}:${opts?.baseDir ?? ''}`;
  if (!opts?.baseDir && bankCache.has(cacheKey)) {
    return bankCache.get(cacheKey)!;
  }
  const filePath = sceneBankPath(id, opts);
  if (!existsSync(filePath)) {
    throw new Error(`scene bank missing: ${filePath}`);
  }
  const bank = parseSceneBankJson(
    JSON.parse(readFileSync(filePath, 'utf8')) as unknown,
  );
  if (!bank.topic_id) bank.topic_id = id;
  if (!opts?.baseDir) {
    bankCache.set(cacheKey, bank);
  }
  return bank;
}

/** List scene bank files on disk (`pt-PT.cena-*.json`). */
export function listSceneBankFiles(opts?: {
  targetLang?: string;
  baseDir?: string;
}): string[] {
  const lang = opts?.targetLang ?? 'pt-PT';
  const dir = scenesDir(opts);
  if (!existsSync(dir)) return [];
  const prefix = `${lang}.cena-`;
  const suffix = '.json';
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
    .map((f) => `cena-${f.slice(prefix.length, -suffix.length)}`)
    .filter(Boolean)
    .sort();
}

export function loadAllSceneBanks(opts?: {
  targetLang?: string;
  baseDir?: string;
}): ConvoGoalBank[] {
  const index = loadSceneIndex(opts);
  return index.path.map((entry) => loadSceneBank(entry.id, opts));
}

/** All scene ids from the path index (ordered). */
export function listSceneIdsFromIndex(opts?: {
  targetLang?: string;
  baseDir?: string;
}): string[] {
  return loadSceneIndex(opts).path.map((p) => p.id);
}
