import type { Item } from '@/lib/v2/content/items';
import type { ListeningOption } from '@/lib/v2/content/pack';

function arOf(item: Item): string {
  if ('ar' in item && typeof item.ar === 'string' && item.ar.trim()) {
    return item.ar;
  }
  return '';
}

function tlOf(item: Item): string {
  if ('tl' in item && typeof item.tl === 'string') return item.tl;
  return '';
}

/**
 * Build closed options for listening/reading from the bank.
 * Direction: Arabic meaning options (stimulus is audio_tl / artifact).
 */
export function buildMeaningOptions(
  correctId: string,
  bank: Item[],
  count = 3,
): ListeningOption[] {
  const byId = new Map(bank.map((i) => [i.id, i]));
  const correct = byId.get(correctId);
  const correctLabel = correct ? arOf(correct) || tlOf(correct) : '';
  const distractors = bank
    .filter((i) => i.id !== correctId)
    .map((i) => ({ id: i.id, label: arOf(i) || tlOf(i) }))
    .filter((d) => d.label && d.label !== correctLabel);

  const picked: ListeningOption[] = [
    {
      id: 'opt.correct',
      label: correctLabel || '…',
      lang: correct && arOf(correct) ? 'ar' : 'tl',
      correct: true,
    },
  ];
  for (const d of distractors) {
    if (picked.length >= count) break;
    if (picked.some((p) => p.label === d.label)) continue;
    picked.push({
      id: `opt.${d.id}`,
      label: d.label,
      lang: 'ar',
      correct: false,
    });
  }
  // Pad if bank thin
  while (picked.length < 2) {
    picked.push({
      id: `opt.pad.${picked.length}`,
      label: `خيار ${picked.length}`,
      lang: 'ar',
      correct: false,
    });
  }
  // Shuffle stably by id
  return picked.sort((a, b) => a.id.localeCompare(b.id));
}
