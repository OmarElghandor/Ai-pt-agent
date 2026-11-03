import type { Item } from '@/lib/v2/content/items';
import type { ListeningOption } from '@/lib/v2/content/pack';

function tlOf(item: Item): string {
  if ('tl' in item && typeof item.tl === 'string') return item.tl.trim();
  return '';
}

/**
 * Build closed options for practice listening from the bank.
 * Direction: Portuguese (tl) lines — stimulus is audio_tl.
 */
export function buildTlOptions(
  correctId: string,
  bank: Item[],
  count = 3,
): ListeningOption[] {
  const byId = new Map(bank.map((i) => [i.id, i]));
  const correct = byId.get(correctId);
  const correctLabel = correct ? tlOf(correct) : '';
  const distractors = bank
    .filter((i) => i.id !== correctId)
    .map((i) => ({ id: i.id, label: tlOf(i) }))
    .filter((d) => d.label && d.label !== correctLabel);

  const picked: ListeningOption[] = [
    {
      id: 'opt.correct',
      label: correctLabel || '…',
      lang: 'tl',
      correct: true,
    },
  ];
  for (const d of distractors) {
    if (picked.length >= count) break;
    if (picked.some((p) => p.label === d.label)) continue;
    picked.push({
      id: `opt.${d.id}`,
      label: d.label,
      lang: 'tl',
      correct: false,
    });
  }
  // Pad if bank thin — unused TL from bank, then generic PT placeholders
  let padIdx = 0;
  while (picked.length < 2) {
    const spare = distractors.find(
      (d) => !picked.some((p) => p.label === d.label),
    );
    const label = spare?.label ?? `opção ${++padIdx}`;
    picked.push({
      id: `opt.pad.${picked.length}`,
      label,
      lang: 'tl',
      correct: false,
    });
  }
  // Shuffle stably by id
  return picked.sort((a, b) => a.id.localeCompare(b.id));
}
