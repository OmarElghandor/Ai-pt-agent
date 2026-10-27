import type { Item } from '@/lib/v2/content/items';
import type { Skill } from '@/lib/v2/content/lesson';
import { isFlashcardItem } from '@/lib/v2/content/flashcards';
import { resolveToolId } from '@/lib/v2/answers/toolId';

export type MechanicalQuestion = {
  id: string;
  type: 'read_meaning' | 'recall_tl' | 'listen' | 'writing';
  skill: Skill;
  tests: string[];
  tool_id?: string;
  origin: 'code';
  prompt: { stimulus: string; hint?: string };
  options?: { id: string; label: string; correct: boolean }[];
  accepted?: string[];
  /** Never include the answer in the prompt for the learner. */
  answer_key: string;
};

function phraseRole(item: Item): 'said' | 'heard' | undefined {
  if (item.type !== 'phrase') return undefined;
  return (item as { role?: 'said' | 'heard' }).role;
}

/** Skills allowed for an item (Phase 3 add-on). */
export function skillsForItem(item: Item): Skill[] {
  if (item.type === 'pattern' || item.type === 'form') return [];
  const role = phraseRole(item);
  if (role === 'heard') return ['listening', 'reading'];
  // said phrases + words/verbs: all four
  return ['listening', 'reading', 'speaking', 'writing'];
}

function typeForSkill(skill: Skill): MechanicalQuestion['type'] {
  switch (skill) {
    case 'listening':
      return 'listen';
    case 'reading':
      return 'read_meaning';
    case 'speaking':
      return 'recall_tl';
    case 'writing':
      return 'writing';
  }
}

function stimulusFor(
  item: Item,
  type: MechanicalQuestion['type'],
): { stimulus: string; answer_key: string; accepted: string[] } {
  const tl = 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
  const ar = 'ar' in item && typeof item.ar === 'string' ? item.ar : '';
  if (type === 'read_meaning') {
    return { stimulus: tl, answer_key: ar, accepted: ar ? [ar] : [] };
  }
  if (type === 'listen') {
    return { stimulus: '(audio)', answer_key: tl, accepted: tl ? [tl] : [] };
  }
  if (type === 'recall_tl' || type === 'writing') {
    return {
      stimulus: ar || '(meaning)',
      answer_key: tl,
      accepted: tl ? [tl] : [],
    };
  }
  return { stimulus: tl, answer_key: ar, accepted: [] };
}

/**
 * Build mechanical questions from an item bank.
 * Derived / has_card:false items can still appear in questions when they have tl/ar,
 * but speaking/writing respect role rules. Patterns themselves are not tested as cards.
 */
export function buildMechanicalQuestions(
  items: Item[],
  opts?: { grammarFocusId?: string; day?: number },
): MechanicalQuestion[] {
  const out: MechanicalQuestion[] = [];
  const day = opts?.day ?? 0;

  for (const item of items) {
    if (item.type === 'pattern' || item.type === 'form' || item.type === 'sentence') {
      continue;
    }
    if ((item as { derived?: boolean }).derived) {
      // derived: usable in questions for reading/listening of the example, not speaking/writing production of a card
    }
    const skills = skillsForItem(item);
    const tool_id = resolveToolId({
      itemId: item.id,
      items,
      grammarFocusId: opts?.grammarFocusId,
    });

    for (const skill of skills) {
      // No speaking/writing for heard; already filtered in skillsForItem
      if (
        (skill === 'speaking' || skill === 'writing') &&
        !isFlashcardItem(item) &&
        (item as { derived?: boolean }).derived
      ) {
        continue;
      }
      const type = typeForSkill(skill);
      const { stimulus, answer_key, accepted } = stimulusFor(item, type);
      // Never put answer_key in prompt
      out.push({
        id: `mech:${item.id}:${skill}:d${day}`,
        type,
        skill,
        tests: [item.id],
        tool_id,
        origin: 'code',
        prompt: { stimulus },
        accepted,
        answer_key,
        options:
          type === 'read_meaning' || type === 'listen'
            ? [
                { id: 'a', label: answer_key, correct: true },
                { id: 'b', label: '—', correct: false },
              ]
            : undefined,
      });
    }
  }
  return out;
}
