import { loadRoleplayIndex } from './load';
import type { RoleplayIndex, RoleplayTier } from './types';

export type RoleplayCatalogSituation = {
  id: string;
  level: number;
  order: number;
  recommended_day: number;
  emoji: string;
  title_tl: string;
  title_ar: string;
  steps: number;
  steps_by_tier: [number, number, number];
  stars: RoleplayTier[];
  /** Above learner level — still playable. */
  hard_for_you: boolean;
};

export type RoleplayCatalogLevel = {
  level: number;
  name_eg: string;
  name_en: string;
  situations: RoleplayCatalogSituation[];
};

export type RoleplayCatalog = {
  target_lang: string;
  tiers: RoleplayIndex['tiers'];
  levels: RoleplayCatalogLevel[];
  learner_day: number;
};

export function buildRoleplayCatalog(opts: {
  learnerDay: number;
  starsBySituation: Record<string, RoleplayTier[]>;
  index?: RoleplayIndex;
}): RoleplayCatalog {
  const index = opts.index ?? loadRoleplayIndex();
  return {
    target_lang: index.target_lang,
    tiers: index.tiers,
    learner_day: opts.learnerDay,
    levels: index.levels.map((lvl) => ({
      level: lvl.level,
      name_eg: lvl.name_eg,
      name_en: lvl.name_en,
      situations: lvl.scenarios.map((s) => ({
        id: s.id,
        level: s.level,
        order: s.order,
        recommended_day: s.recommended_day,
        emoji: s.emoji,
        title_tl: s.title_tl,
        title_ar: s.title_ar,
        steps: s.steps,
        steps_by_tier: s.steps_by_tier,
        stars: opts.starsBySituation[s.id] ?? [],
        hard_for_you: opts.learnerDay < s.recommended_day,
      })),
    })),
  };
}
