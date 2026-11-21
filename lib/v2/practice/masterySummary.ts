/**
 * Home mastery counts from v2_item_state stages (16 §8).
 * Custom-only (ugc.*) items are excluded. No query on v2_errors.
 */

export type MasterySummary = {
  mastered_words: number;
  mastered_phrases: number;
  recalled: number;
  reviewing: number;
  mastered_today: number;
};

export type MasteryItemRow = {
  item_id: string;
  stage?: number | null;
  stage_at?: string | null;
  /** word | phrase | verb | pattern | … */
  item_type?: string | null;
};

export function computeMasterySummary(
  rows: MasteryItemRow[],
  todayLocalDate?: string,
): MasterySummary {
  let mastered_words = 0;
  let mastered_phrases = 0;
  let recalled = 0;
  let reviewing = 0;
  let mastered_today = 0;

  for (const row of rows) {
    if (row.item_id.startsWith('ugc.')) continue;
    const stage = Number(row.stage ?? 1);
    if (stage >= 4) {
      if (row.item_type === 'phrase') mastered_phrases += 1;
      else if (row.item_type !== 'pattern' && row.item_type !== 'form') {
        mastered_words += 1;
      }
      if (todayLocalDate && row.stage_at === todayLocalDate) {
        mastered_today += 1;
      }
    } else if (stage === 3) {
      recalled += 1;
    } else if (stage === 2) {
      reviewing += 1;
    }
  }

  return {
    mastered_words,
    mastered_phrases,
    recalled,
    reviewing,
    mastered_today,
  };
}

export function masteryLineEg(m: MasterySummary): string {
  if (m.mastered_words + m.mastered_phrases > 0) {
    const words = m.mastered_words;
    const phrases = m.mastered_phrases;
    if (phrases > 0) {
      return `اتحفظت ${words} كلمة · و ${phrases} جملة`;
    }
    return `اتحفظت ${words} كلمة`;
  }
  return `افتكرت ${m.recalled} كلمة`;
}
