import type { LessonPack } from '@/lib/v2/content/lesson';
import type { ConvoItemSurface } from '@/lib/v2/convo/pack/schema';
import {
  coreItemsThroughDay,
  getCoreItemsDay,
} from '@/lib/v2/generation/lesson/coreItems';

/** Build tl surfaces for convo validation from lesson + core-items (incl. recycle). */
export function surfacesForDay(
  day: number,
  lesson: LessonPack,
): ConvoItemSurface[] {
  const byId = new Map<string, ConvoItemSurface>();
  for (const item of lesson.items ?? []) {
    if ('tl' in item && typeof item.tl === 'string') {
      byId.set(item.id, {
        id: item.id,
        tl: item.tl,
        say: 'say' in item && typeof item.say === 'string' ? item.say : undefined,
      });
    }
  }
  // Prior days supply recycle tls; today's core fills gaps.
  for (const c of coreItemsThroughDay(day)) {
    if (!byId.has(c.id) && c.tl) {
      byId.set(c.id, { id: c.id, tl: c.tl });
    }
  }
  const core = getCoreItemsDay(day);
  for (const c of core.core_items) {
    if (!byId.has(c.id) && c.tl) {
      byId.set(c.id, { id: c.id, tl: c.tl });
    }
  }
  return [...byId.values()];
}
