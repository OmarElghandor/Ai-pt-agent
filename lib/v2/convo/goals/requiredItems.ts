import type { ConvoGoal, ConvoGoalBank } from './types';

/** Thread topics → curriculum item ids used for level gating (v4 V2). */
export const THREAD_TOPIC_REQUIRED_ITEMS: Record<string, string[]> = {
  comida: [
    'verb.comer',
    'verb.beber',
    'word.restaurant',
    'word.menu',
    'word.soup',
    'word.fish',
    'word.meat',
  ],
  casa: [
    'word.house',
    'word.bedroom',
    'word.window',
    'word.door',
  ],
  trabalho: [
    'verb.trabalhar',
    'word.office',
    'phrase.where_do_you_work',
    'phrase.i_work_in_a_cafe',
  ],
  familia: ['word.city', 'word.country'],
  transportes: ['word.metro', 'word.bus', 'word.train'],
  compras: ['word.supermarket', 'word.bread', 'word.bag'],
  bairro: ['word.street', 'word.pharmacy'],
  egito: ['word.country', 'word.city'],
  ginasio: ['verb.falar'],
  fim_de_semana: ['word.weekend', 'word.friends'],
  ontem: ['phrase.i_was_home'],
  amanha: ['phrase.ill_work_tomorrow'],
};

/** Day-1 introductions — day 1 core greetings / name. */
export const DAY1_REQUIRED_ITEMS: string[] = [
  'phrase.hello',
  'phrase.good_morning',
  'phrase.my_name_is',
  'phrase.whats_your_name',
  'phrase.nice_to_meet',
  'phrase.likewise',
];

function itemsFromGoals(goals: ReadonlyArray<ConvoGoal>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of goals) {
    const tier = g.tier ?? 'core';
    if (tier !== 'core') continue;
    for (const id of g.item_ids ?? []) {
      const t = id.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Resolve and attach `required_items` on a bank (idempotent).
 * Prefer stored list → core goal item_ids → thread/day defaults.
 */
export function ensureBankRequiredItems(bank: ConvoGoalBank): ConvoGoalBank {
  if (bank.required_items && bank.required_items.length > 0) {
    return bank;
  }
  const fromGoals = itemsFromGoals(bank.goals);
  if (fromGoals.length > 0) {
    bank.required_items = fromGoals;
    return bank;
  }
  if (typeof bank.day === 'number' && bank.day === 1) {
    bank.required_items = [...DAY1_REQUIRED_ITEMS];
    return bank;
  }
  const topicId = bank.topic_id?.trim();
  if (topicId && THREAD_TOPIC_REQUIRED_ITEMS[topicId]) {
    bank.required_items = [...THREAD_TOPIC_REQUIRED_ITEMS[topicId]];
    return bank;
  }
  bank.required_items = [];
  return bank;
}

export function computeRequiredItems(bank: ConvoGoalBank): string[] {
  return ensureBankRequiredItems({ ...bank, goals: [...bank.goals] })
    .required_items ?? [];
}
