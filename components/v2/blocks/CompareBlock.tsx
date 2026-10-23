'use client';

import { CompareColumns } from '@/components/v2/CompareColumns';
import { RichText } from '@/components/v2/RichText';
import type { Block } from '@/lib/v2/content/blocks';
import { ContentLine } from './content';
import { useBlockChrome } from './chrome';
import { GROUP_HEADER } from './groupHeader';
import { partClass } from './visibility';

export function CompareBlock({ block }: { block: Extract<Block, { type: 'compare' }> }) {
  const chrome = useBlockChrome();
  const columns = block.columns.length >= 3 ? 3 : block.columns.length === 1 ? 1 : 2;

  return (
    <div data-target={block.id} dir="ltr">
      <CompareColumns columns={columns}>
        {block.columns.map((col, ci) => {
          const headerState = chrome.partState(block.id, `col:${ci}`);
          return (
            <section
              key={ci}
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-v2-ink/20 bg-v2-card shadow-sm"
            >
              <header
                data-target={`${block.id}/col:${ci}`}
                className={[
                  'flex items-center justify-between gap-1 px-2 py-2',
                  GROUP_HEADER[col.group],
                  partClass(headerState, true),
                ].join(' ')}
              >
                <span className="flex items-center gap-1.5 font-[family-name:var(--font-v2-target)] text-base font-bold">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/70" />
                  <RichText segments={col.head} tone="onDark" />
                </span>
                {col.sub ? (
                  <span
                    dir="rtl"
                    className="rounded-md bg-white/15 px-1.5 py-0.5 text-end font-[family-name:var(--font-v2-arabic)] text-[10px] font-bold leading-tight"
                  >
                    <RichText segments={col.sub} tone="onDark" />
                  </span>
                ) : null}
              </header>
              <div className="space-y-2 p-2">
                {col.entries.map((entry, ei) => {
                  const state = chrome.partState(block.id, `entry:${ci}:${ei}`);
                  return (
                    <div
                      key={ei}
                      data-target={`${block.id}/entry:${ci}:${ei}`}
                      className={['rounded-xl bg-v2-card p-2', partClass(state) || 'border border-v2-rule'].join(' ')}
                    >
                      <ContentLine
                        layout="stack"
                        item={chrome.items.get(entry.ref)}
                        label={entry.label}
                        media={entry.media}
                        onPlay={chrome.onPlay}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </CompareColumns>
    </div>
  );
}
