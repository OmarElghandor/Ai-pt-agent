import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type {
  ConvoGoal,
  ConvoGoalBank,
  ConvoGoalHelp,
  SceneGlobalBlock,
  SceneLine,
  SceneOption,
} from '@/lib/v2/convo/goals/types';
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

function parseSceneLine(raw: unknown): SceneLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const tl = typeof o.tl === 'string' ? o.tl : '';
  const ar = typeof o.ar === 'string' ? o.ar : '';
  if (!tl.trim()) return null;
  const tl_f = typeof o.tl_f === 'string' ? o.tl_f : undefined;
  const ar_f = typeof o.ar_f === 'string' ? o.ar_f : undefined;
  return {
    tl,
    ar,
    ...(tl_f?.trim() ? { tl_f } : {}),
    ...(ar_f?.trim() ? { ar_f } : {}),
  };
}

function parseSceneLines(raw: unknown): SceneLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseSceneLine).filter((l): l is SceneLine => Boolean(l));
}

function parseSceneOption(raw: unknown): SceneOption | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const value = typeof o.value === 'string' ? o.value.trim() : '';
  if (!value) return null;
  const keywords = Array.isArray(o.keywords)
    ? o.keywords.map((k) => String(k)).filter(Boolean)
    : [];
  const examples = Array.isArray(o.examples)
    ? o.examples.map((e) => String(e)).filter(Boolean)
    : [];
  const react = parseSceneLines(o.react);
  return { value, keywords, examples, react };
}

function parseHints(raw: unknown): ConvoGoal['hints'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const what_eg = typeof o.what_eg === 'string' ? o.what_eg.trim() : '';
  const words_eg = typeof o.words_eg === 'string' ? o.words_eg.trim() : '';
  const frame_tl = typeof o.frame_tl === 'string' ? o.frame_tl.trim() : '';
  if (!what_eg && !words_eg && !frame_tl) return undefined;
  return { what_eg, words_eg, frame_tl };
}

function synthesizeHelp(goal: {
  hint_eg?: string;
  hints?: ConvoGoal['hints'];
  hint_words?: string;
  suggest?: string[];
  suggest_f?: string[];
}): ConvoGoalHelp {
  const chips = goal.suggest?.length ? [...goal.suggest] : ['…'];
  const eg =
    goal.hints?.what_eg?.trim() ||
    goal.hint_eg?.trim() ||
    goal.hint_words?.trim() ||
    '';
  return {
    frame_tl: goal.hints?.frame_tl?.trim() || chips[0] || '…',
    eg,
    chips,
    ...(goal.suggest_f?.length ? { chips_f: [...goal.suggest_f] } : {}),
  };
}

function parseOnlyIf(
  raw: unknown,
): ConvoGoal['only_if'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const goal = typeof o.goal === 'string' ? o.goal.trim() : '';
  const options = Array.isArray(o.options)
    ? o.options.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (!goal || !options.length) return undefined;
  return { goal, options };
}

function parseFormat3Goal(raw: Record<string, unknown>): ConvoGoal {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const label_eg =
    typeof raw.label_eg === 'string' ? raw.label_eg.trim() : '';
  const ask = parseSceneLines(raw.ask);
  const unclear = parseSceneLines(raw.unclear);
  const options = Array.isArray(raw.options)
    ? raw.options
        .map(parseSceneOption)
        .filter((o): o is SceneOption => Boolean(o))
    : [];
  const suggest = Array.isArray(raw.suggest)
    ? raw.suggest.map((s) => String(s)).filter(Boolean)
    : [];
  const suggest_f = Array.isArray(raw.suggest_f)
    ? raw.suggest_f.map((s) => String(s)).filter(Boolean)
    : undefined;
  const hints = parseHints(raw.hints);
  const hint_words =
    typeof raw.hint_words === 'string' ? raw.hint_words.trim() : '';
  const coach_before_eg =
    typeof raw.coach_before_eg === 'string'
      ? raw.coach_before_eg.trim()
      : '';
  const only_if = parseOnlyIf(raw.only_if);
  const hint_eg =
    typeof raw.hint_eg === 'string'
      ? raw.hint_eg.trim()
      : hints?.what_eg || undefined;
  const farewell = raw.farewell === true;

  const keywords = options.flatMap((o) => o.keywords);
  const examples_tl = options.flatMap((o) => o.examples);
  const firstAsk = ask[0];

  return {
    id,
    intent_eg: label_eg || id,
    label_eg: label_eg || undefined,
    examples_tl: examples_tl.length ? examples_tl : [''],
    keywords: keywords.length ? keywords : [id],
    ask_tl: firstAsk?.tl,
    ask_ar: firstAsk?.ar,
    ask,
    options,
    unclear,
    suggest,
    ...(suggest_f?.length ? { suggest_f } : {}),
    ...(hints ? { hints } : {}),
    ...(hint_words ? { hint_words } : {}),
    ...(coach_before_eg ? { coach_before_eg } : {}),
    ...(only_if ? { only_if } : {}),
    ...(hint_eg ? { hint_eg } : {}),
    ...(farewell ? { farewell: true } : {}),
    help: synthesizeHelp({
      hint_eg,
      hints,
      hint_words,
      suggest,
      suggest_f,
    }),
  };
}

function parseGlobal(raw: unknown): SceneGlobalBlock | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Record<string, unknown>;
  const greetingRaw = g.greeting as Record<string, unknown> | undefined;
  const thanksRaw = g.thanks as Record<string, unknown> | undefined;
  const sideRaw = g.side_unknown as Record<string, unknown> | undefined;
  if (!greetingRaw || !thanksRaw || !sideRaw) return undefined;
  return {
    greeting: {
      keywords: Array.isArray(greetingRaw.keywords)
        ? greetingRaw.keywords.map((k) => String(k)).filter(Boolean)
        : [],
      react: parseSceneLines(greetingRaw.react),
    },
    thanks: {
      keywords: Array.isArray(thanksRaw.keywords)
        ? thanksRaw.keywords.map((k) => String(k)).filter(Boolean)
        : [],
      react: parseSceneLines(thanksRaw.react),
    },
    side_unknown: {
      react: parseSceneLines(sideRaw.react),
    },
  };
}

function parseFormat3SceneBank(doc: Record<string, unknown>): ConvoGoalBank {
  const opening_lines = parseSceneLines(doc.opening);
  const closing_lines = parseSceneLines(doc.closing);
  const goalsRaw = Array.isArray(doc.goals) ? doc.goals : [];
  const characterId =
    typeof doc.character_id === 'string'
      ? doc.character_id.trim()
      : typeof (doc.scene as { character_id?: string } | undefined)
            ?.character_id === 'string'
        ? String((doc.scene as { character_id: string }).character_id)
        : '';
  const address =
    doc.address === 'tu' || doc.address === 'formal'
      ? doc.address
      : undefined;
  const mission =
    typeof doc.mission_eg === 'string'
      ? doc.mission_eg
      : typeof doc.intro_eg === 'string'
        ? doc.intro_eg
        : undefined;

  const bank: ConvoGoalBank = {
    source: 'topic',
    kind: 'scene',
    format: 3,
    goals: goalsRaw.map((g) =>
      parseFormat3Goal((g ?? {}) as Record<string, unknown>),
    ),
    suggested_words: Array.isArray(doc.suggested_words)
      ? doc.suggested_words.map((w) => String(w))
      : [],
    scene: {
      character_id: characterId,
      time_of_day: 'morning',
      ...(address ? { address } : {}),
    },
    authored: true,
    opening_lines,
    closing_lines,
    opening: opening_lines[0]
      ? { tl: opening_lines[0].tl, ar: opening_lines[0].ar }
      : undefined,
    closing: closing_lines[0]
      ? { tl: closing_lines[0].tl, ar: closing_lines[0].ar }
      : undefined,
    global: parseGlobal(doc.global),
  };

  if (typeof doc.id === 'string') bank.topic_id = doc.id;
  if (typeof doc.topic_id === 'string') bank.topic_id = doc.topic_id;
  if (typeof doc.title_tl === 'string') bank.title_tl = doc.title_tl;
  if (typeof doc.title_ar === 'string') bank.title_ar = doc.title_ar;
  if (mission) bank.intro_eg = mission;
  if (typeof doc.emoji === 'string') bank.emoji = doc.emoji;
  if (typeof doc.recommended_day === 'number') {
    bank.recommended_day = doc.recommended_day;
  }
  if (Array.isArray(doc.end_tips_eg)) {
    const tips = doc.end_tips_eg
      .map((t) => String(t).trim())
      .filter(Boolean);
    if (tips.length) bank.end_tips_eg = tips;
  }
  if (typeof doc.opening_coach_eg === 'string' && doc.opening_coach_eg.trim()) {
    bank.opening_coach_eg = doc.opening_coach_eg.trim();
  }
  if (Array.isArray(doc.glossary)) {
    const glossary = doc.glossary
      .map((raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const o = raw as Record<string, unknown>;
        const tl = typeof o.tl === 'string' ? o.tl.trim() : '';
        const ar = Array.isArray(o.ar)
          ? o.ar.map((a) => String(a).trim()).filter(Boolean)
          : [];
        if (!tl || !ar.length) return null;
        return { ar, tl };
      })
      .filter((e): e is { ar: string[]; tl: string } => Boolean(e));
    if (glossary.length) bank.glossary = glossary;
  }

  return bank;
}

function parseFormat2SceneBank(doc: Record<string, unknown>): ConvoGoalBank {
  const openingRaw = doc.opening as Record<string, unknown> | undefined;
  const closingRaw = doc.closing as Record<string, unknown> | undefined;
  const goalsRaw = Array.isArray(doc.goals) ? doc.goals : [];

  const bank: ConvoGoalBank = {
    source: 'topic',
    kind: 'scene',
    format: 2,
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

  return bank;
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

  const format = doc.format === 3 ? 3 : 2;
  const bank =
    format === 3 ? parseFormat3SceneBank(doc) : parseFormat2SceneBank(doc);

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
