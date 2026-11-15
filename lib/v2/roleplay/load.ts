import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type {
  RoleplayIndex,
  RoleplayIndexLevel,
  RoleplayIndexScenario,
  RoleplayIndexTier,
  RoleplaySituation,
  RoleplayStep,
  RoleplayTier,
} from './types';

const DEFAULT_DIR = path.join(process.cwd(), 'content/v2/roleplay');

let indexCache: RoleplayIndex | null = null;
const situationCache = new Map<string, RoleplaySituation>();

function isTier(n: unknown): n is RoleplayTier {
  return n === 1 || n === 2 || n === 3;
}

function isLine(v: unknown): boolean {
  if (v === null) return true;
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.tl === 'string' && typeof o.ar === 'string';
}

function parseIndex(raw: unknown): RoleplayIndex {
  if (!raw || typeof raw !== 'object') {
    throw new Error('roleplay index: expected object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.target_lang !== 'string') {
    throw new Error('roleplay index: target_lang required');
  }
  if (!Array.isArray(o.tiers) || o.tiers.length !== 3) {
    throw new Error('roleplay index: tiers must have 3 entries');
  }
  const tiers: RoleplayIndexTier[] = o.tiers.map((t, i) => {
    if (!t || typeof t !== 'object') throw new Error(`roleplay index: tier ${i}`);
    const r = t as Record<string, unknown>;
    if (!isTier(r.tier) || typeof r.name_eg !== 'string' || typeof r.desc_eg !== 'string') {
      throw new Error(`roleplay index: tier ${i} invalid`);
    }
    return { tier: r.tier, name_eg: r.name_eg, desc_eg: r.desc_eg };
  });

  if (!Array.isArray(o.levels) || o.levels.length !== 5) {
    throw new Error('roleplay index: levels must have 5 entries');
  }
  const levels: RoleplayIndexLevel[] = o.levels.map((lvl, i) => {
    if (!lvl || typeof lvl !== 'object') throw new Error(`roleplay index: level ${i}`);
    const r = lvl as Record<string, unknown>;
    if (
      typeof r.level !== 'number' ||
      typeof r.name_eg !== 'string' ||
      typeof r.name_en !== 'string' ||
      !Array.isArray(r.scenarios)
    ) {
      throw new Error(`roleplay index: level ${i} invalid`);
    }
    const scenarios: RoleplayIndexScenario[] = r.scenarios.map((s, j) => {
      if (!s || typeof s !== 'object') {
        throw new Error(`roleplay index: level ${i} scenario ${j}`);
      }
      const sc = s as Record<string, unknown>;
      if (
        typeof sc.id !== 'string' ||
        typeof sc.level !== 'number' ||
        typeof sc.order !== 'number' ||
        typeof sc.recommended_day !== 'number' ||
        typeof sc.emoji !== 'string' ||
        typeof sc.title_tl !== 'string' ||
        typeof sc.title_ar !== 'string' ||
        typeof sc.steps !== 'number' ||
        !Array.isArray(sc.steps_by_tier) ||
        sc.steps_by_tier.length !== 3
      ) {
        throw new Error(`roleplay index: level ${i} scenario ${j} invalid`);
      }
      return {
        id: sc.id,
        level: sc.level,
        order: sc.order,
        recommended_day: sc.recommended_day,
        emoji: sc.emoji,
        title_tl: sc.title_tl,
        title_ar: sc.title_ar,
        steps: sc.steps,
        steps_by_tier: sc.steps_by_tier as [number, number, number],
      };
    });
    return {
      level: r.level,
      name_eg: r.name_eg,
      name_en: r.name_en,
      scenarios,
    };
  });

  return { target_lang: o.target_lang, tiers, levels };
}

function parseSituation(raw: unknown, fileHint: string): RoleplaySituation {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`roleplay situation ${fileHint}: expected object`);
  }
  const o = raw as Record<string, unknown>;
  const reqStr = (k: string): string => {
    if (typeof o[k] !== 'string') {
      throw new Error(`roleplay situation ${fileHint}: ${k} required`);
    }
    return o[k] as string;
  };
  const reqNum = (k: string): number => {
    if (typeof o[k] !== 'number') {
      throw new Error(`roleplay situation ${fileHint}: ${k} required`);
    }
    return o[k] as number;
  };

  if (!Array.isArray(o.steps) || o.steps.length === 0) {
    throw new Error(`roleplay situation ${fileHint}: steps required`);
  }
  if (!isLine(o.closing) || o.closing === null) {
    throw new Error(`roleplay situation ${fileHint}: closing required`);
  }

  const steps = o.steps as RoleplayStep[];

  return {
    id: reqStr('id'),
    target_lang: reqStr('target_lang'),
    level: reqNum('level'),
    order: reqNum('order'),
    recommended_day: reqNum('recommended_day'),
    emoji: reqStr('emoji'),
    title_tl: reqStr('title_tl'),
    title_ar: reqStr('title_ar'),
    place_eg: reqStr('place_eg'),
    task_eg: reqStr('task_eg'),
    learner_role_eg: reqStr('learner_role_eg'),
    character: o.character as RoleplaySituation['character'],
    ...(Array.isArray(o.cast) ? { cast: o.cast as RoleplaySituation['cast'] } : {}),
    address: reqStr('address'),
    item_ids: Array.isArray(o.item_ids) ? (o.item_ids as string[]) : [],
    new_tl: Array.isArray(o.new_tl) ? (o.new_tl as string[]) : [],
    key_phrases: Array.isArray(o.key_phrases)
      ? (o.key_phrases as RoleplaySituation['key_phrases'])
      : [],
    steps,
    closing: o.closing as RoleplaySituation['closing'],
    summary_eg: reqStr('summary_eg'),
    ...(typeof o.authored === 'boolean' ? { authored: o.authored } : {}),
  };
}

export function roleplayContentDir(dir: string = DEFAULT_DIR): string {
  return dir;
}

export function situationFilePath(
  id: string,
  dir: string = DEFAULT_DIR,
): string {
  // id is "rp.cafe" → file "pt-PT.rp.cafe.json"
  const short = id.startsWith('rp.') ? id.slice(3) : id;
  return path.join(dir, `pt-PT.rp.${short}.json`);
}

export function loadRoleplayIndex(dir: string = DEFAULT_DIR): RoleplayIndex {
  if (indexCache && dir === DEFAULT_DIR) return indexCache;
  const filePath = path.join(dir, 'pt-PT.index.json');
  if (!existsSync(filePath)) {
    throw new Error(`roleplay index missing: ${filePath}`);
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  const index = parseIndex(raw);
  if (dir === DEFAULT_DIR) indexCache = index;
  return index;
}

export function loadRoleplaySituation(
  id: string,
  dir: string = DEFAULT_DIR,
): RoleplaySituation {
  const cacheKey = `${dir}::${id}`;
  if (situationCache.has(cacheKey)) {
    return situationCache.get(cacheKey)!;
  }
  const filePath = situationFilePath(id, dir);
  if (!existsSync(filePath)) {
    throw new Error(`roleplay situation missing: ${filePath}`);
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  const situation = parseSituation(raw, id);
  if (situation.id !== id) {
    throw new Error(
      `roleplay situation id mismatch: file ${id} has id ${situation.id}`,
    );
  }
  situationCache.set(cacheKey, situation);
  return situation;
}

/** Load every situation listed in the index (15). */
export function loadAllRoleplaySituations(
  dir: string = DEFAULT_DIR,
): RoleplaySituation[] {
  const index = loadRoleplayIndex(dir);
  const ids = index.levels.flatMap((l) => l.scenarios.map((s) => s.id));
  return ids.map((id) => loadRoleplaySituation(id, dir));
}

/** List situation files on disk (for tests / tooling). */
export function listRoleplaySituationFiles(dir: string = DEFAULT_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^pt-PT\.rp\..+\.json$/.test(f))
    .sort();
}

/** Test helper. */
export function clearRoleplayLoadCache(): void {
  indexCache = null;
  situationCache.clear();
}
