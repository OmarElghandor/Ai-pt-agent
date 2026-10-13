import { REGISTER_MAP } from './registerMap';
import { filterIntroducedCells } from './irFuturoExclusion';
import { wordsForTopic, loadNucleo, isNucleoWord, loadGrammarGrid } from './wordData';
import type { SeedPlanSlot } from '@/lib/lessons/seedPlan';

export type PlanSlotLike = {
  lesson_key: string;
  topic: string;
  depth_tier: number;
  cefr_level: string;
  curriculum_point: number;
  cell_ids: string[];
  pattern?: string;
  situation_ar?: string;
};

export function seedToPlanSlot(seed: SeedPlanSlot): PlanSlotLike {
  return {
    lesson_key: seed.lessonKey,
    topic: seed.topic,
    depth_tier: seed.depthTier,
    cefr_level: seed.cefrLevel,
    curriculum_point: seed.order,
    cell_ids: seed.cellIds,
    pattern: seed.pattern,
    situation_ar: seed.situationAr,
  };
}

function maxPriorityForTier(depthTier: number): number {
  if (depthTier === 1) return 1;
  if (depthTier === 2) return 2;
  return 3;
}

export function buildCumulativeAllowedWords(
  slot: PlanSlotLike,
  planSlots: PlanSlotLike[],
): Array<{ text: string; priority: number; note: string | null; topic: string }> {
  const depthTier = slot.depth_tier || 1;
  const maxPriority = maxPriorityForTier(depthTier);
  const point = slot.curriculum_point ?? Number.MAX_SAFE_INTEGER;
  const seen = new Set<string>();
  const out: Array<{ text: string; priority: number; note: string | null; topic: string }> = [];

  function addFromTopic(topic: string, tierCap: number, forceTopic: string) {
    const words = wordsForTopic(topic, { maxPriority: tierCap });
    for (const w of words) {
      const key = `${forceTopic}::${String(w.text).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        text: w.text,
        priority: w.priority,
        note: w.note || null,
        topic: forceTopic,
      });
    }
  }

  if (planSlots.length) {
    const earlier = planSlots
      .filter((s) => (s.curriculum_point ?? 0) < point)
      .sort((a, b) => (a.curriculum_point || 0) - (b.curriculum_point || 0));
    for (const s of earlier) {
      addFromTopic(s.topic, maxPriorityForTier(s.depth_tier || 1), s.topic);
    }
  }

  addFromTopic(slot.topic, maxPriority, slot.topic);
  return out;
}

export function assembleInputs(
  slot: PlanSlotLike,
  existingLessons: Array<{ title?: string; situation?: string; cells?: string[] }> = [],
  opts: { planSlots?: PlanSlotLike[] } = {},
) {
  const depthTier = slot.depth_tier || 1;
  const allowedWords = buildCumulativeAllowedWords(slot, opts.planSlots ?? []);
  const nucleus = loadNucleo();
  const grid = loadGrammarGrid();
  const byId = new Map(grid.map((c) => [c.cell_id, c]));

  const introducedIds = new Set([...(slot.cell_ids || [])]);
  const introducedCells = filterIntroducedCells(
    [...introducedIds]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((c) => ({
        cell_id: c!.cell_id,
        verb: c!.verb,
        tense: c!.tense,
        person: c!.person,
        form: c!.form,
      })),
  );

  const cellForms: Record<string, string> = {};
  for (const c of introducedCells) {
    cellForms[c.cell_id] = c.form;
  }

  return {
    topic: slot.topic,
    depthTier,
    cefrLevel: slot.cefr_level,
    allowedWords,
    nucleus,
    introducedCells,
    cellForms,
    existingLessons: existingLessons || [],
    registerMap: REGISTER_MAP,
    slot: {
      slot_id: slot.lesson_key,
      pattern: slot.pattern || '',
      situation_ar: slot.situation_ar || '',
      cells: slot.cell_ids || [],
    },
    slotCellIds: slot.cell_ids || [],
  };
}

export function buildRequirements(
  slot: PlanSlotLike,
  spec: { clusters?: Record<string, string[]>; support_words?: string[] } | null,
): { cells: string[]; words: string[] } {
  const cells = [...(slot.cell_ids || [])];
  if (!spec) return { cells, words: [] };

  const words: string[] = [];
  const seen = new Set<string>();
  for (const phrases of Object.values(spec.clusters || {})) {
    for (const phrase of phrases || []) {
      const text = String(phrase || '').trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key) || isNucleoWord(text)) continue;
      seen.add(key);
      words.push(text);
    }
  }
  const support = new Set(
    (spec.support_words || []).map((w) => String(w).trim().toLowerCase()),
  );
  return { cells, words: words.filter((w) => !support.has(w.toLowerCase())) };
}
