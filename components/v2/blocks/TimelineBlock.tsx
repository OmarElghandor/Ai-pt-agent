'use client';

import { RichText } from '@/components/v2/RichText';
import type { Block } from '@/lib/v2/content/blocks';
import { ContentLine } from './content';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

const WHEN = {
  past: 'قبل كده',
  now: 'دلوقتي',
  future: 'بعدين',
} as const;

const ORDER = ['past', 'now', 'future'] as const;

export function TimelineBlock({ block }: { block: Extract<Block, { type: 'timeline' }> }) {
  const chrome = useBlockChrome();
  const state = chrome.partState(block.id, null);
  return (
    <div
      data-target={block.id}
      className={['grid grid-cols-3 gap-2', partClass(state)].join(' ')}
    >
      {ORDER.map((at) => (
        <div key={at} className="min-w-0 space-y-2">
          <p className="text-center font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-ink">
            {WHEN[at]}
          </p>
          {block.points
            .filter((point) => point.at === at)
            .map((point, index) => (
              <div key={index} className="rounded-v2-row border border-v2-rule bg-v2-card p-2">
                {point.label ? (
                  <p className="mb-1 text-[11px] text-v2-ink-muted">
                    <RichText segments={point.label} />
                  </p>
                ) : null}
                <ContentLine item={chrome.items.get(point.ref)} onPlay={chrome.onPlay} />
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
