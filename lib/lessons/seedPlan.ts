import { readFileSync } from 'node:fs';
import path from 'node:path';

export type SeedEntry = {
  slot_id: string;
  order: number;
  title_ar: string;
  topic: string;
  tier: number;
  cefr_level: string;
  pattern: string;
  cells: string[];
  situation_ar: string;
};

export type SeedPlanSlot = {
  lessonKey: string;
  order: number;
  titleAr: string;
  situationAr: string;
  topic: string;
  depthTier: number;
  cefrLevel: string;
  pattern: string;
  cellIds: string[];
  requirements: { cells: string[]; words: string[] };
};

const DEFAULT_SEED_PATH = path.join(
  process.cwd(),
  'content',
  'lessons',
  'lesson-plan-seed-v1.json',
);

/** Load curated seed plan, sorted by order. */
export function loadSeedPlan(seedPath = DEFAULT_SEED_PATH): SeedPlanSlot[] {
  const raw = JSON.parse(readFileSync(seedPath, 'utf8')) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error('lesson-plan-seed-v1.json must be a JSON array');
  }

  const slots: SeedPlanSlot[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Partial<SeedEntry>;
    if (!e.slot_id || typeof e.slot_id !== 'string') continue;
    const cells = Array.isArray(e.cells) ? e.cells.map(String) : [];
    slots.push({
      lessonKey: e.slot_id,
      order: Number(e.order) || slots.length + 1,
      titleAr: typeof e.title_ar === 'string' ? e.title_ar : e.slot_id,
      situationAr: typeof e.situation_ar === 'string' ? e.situation_ar : '',
      topic: typeof e.topic === 'string' ? e.topic : '',
      depthTier: Number(e.tier) || 1,
      cefrLevel: typeof e.cefr_level === 'string' ? e.cefr_level : 'A0',
      pattern: typeof e.pattern === 'string' ? e.pattern : '',
      cellIds: cells,
      requirements: { cells, words: [] },
    });
  }

  slots.sort((a, b) => a.order - b.order);
  return slots;
}

export function seedPlanExists(seedPath = DEFAULT_SEED_PATH): boolean {
  try {
    readFileSync(seedPath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export { DEFAULT_SEED_PATH };
