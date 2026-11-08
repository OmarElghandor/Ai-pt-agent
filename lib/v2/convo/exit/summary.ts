import type { ConvoGoal, ConvoGoalState } from '@/lib/v2/convo/goals/types';

export type ConvoExitSummary = {
  said: string[];
  weak: string[];
  coach_eg: string;
};

/** Build the end-of-chat summary after «خلّص» / «كفاية». */
export function buildExitSummary(opts: {
  goals: ConvoGoalState[];
  defs: ConvoGoal[];
  suggestedWords?: string[];
}): ConvoExitSummary {
  const byId = new Map(opts.defs.map((g) => [g.id, g]));
  const said: string[] = [];
  const weak: string[] = [];
  for (const g of opts.goals) {
    const def = byId.get(g.id);
    const label =
      def?.examples_tl?.[0]?.trim() ||
      def?.keywords?.[0] ||
      g.id;
    if (g.status === 'done') said.push(label);
    else if (g.status === 'assisted') weak.push(label);
    else if (g.status === 'open') weak.push(label);
  }
  for (const w of opts.suggestedWords ?? []) {
    if (w.trim() && !said.includes(w) && !weak.includes(w) && weak.length < 6) {
      weak.push(w.trim());
    }
  }
  const saidLine = said.length
    ? `قلت: ${said.slice(0, 8).join(' · ')}`
    : 'لسه ماثبتناش كلمات كتير';
  const weakLine = weak.length
    ? `ضعيف شوية: ${weak.slice(0, 6).join(' · ')}`
    : 'مافيش حاجات ضعيفة واضحة';
  return {
    said,
    weak,
    coach_eg: `خلصت المحادثة. ${saidLine}. ${weakLine}.`,
  };
}
