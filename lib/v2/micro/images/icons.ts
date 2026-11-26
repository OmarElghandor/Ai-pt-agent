import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ImageModel } from '@/lib/v2/mongo/models';

export function iconKeyForConcept(concept_en: string): string {
  return `icon.${concept_en.trim().toLowerCase().replace(/\s+/g, '_')}`;
}

export type IconPlanResult = {
  key: string;
  reused: boolean;
  cost: number;
};

/**
 * Plan an icon: reuse a ready `icon.<concept>` key at no cost (19 M3).
 */
export async function planIcon(opts: {
  concept_en: string;
  /** Inject ready keys for tests. */
  readyKeys?: Set<string>;
}): Promise<IconPlanResult> {
  const key = iconKeyForConcept(opts.concept_en);
  if (opts.readyKeys) {
    if (opts.readyKeys.has(key)) {
      return { key, reused: true, cost: 0 };
    }
    return { key, reused: false, cost: 1 };
  }
  if (!mongoConfigured()) {
    return { key, reused: false, cost: 1 };
  }
  await connectMongo();
  const doc = await V2ImageModel()
    .findOne({ key, status: 'ready' })
    .select({ key: 1 })
    .lean();
  if (doc) return { key, reused: true, cost: 0 };
  return { key, reused: false, cost: 1 };
}
