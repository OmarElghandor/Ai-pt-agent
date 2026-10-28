'use client';

import { RichText } from '@/components/v2/RichText';
import type { Block } from '@/lib/v2/content/blocks';
import type { Rt } from '@/lib/v2/content/rt';
import { ENDING_STAGGER_MS } from '@/lib/v2/render/timing';
import { ContentLine, MediaTile, VerbForm } from './content';
import { useBlockChrome } from './chrome';
import { tableColHeaderClass } from './groupHeader';
import { partClass } from './visibility';

type Cell = { ref: string } | Rt;

export function TableBlock({ block }: { block: Extract<Block, { type: 'table' }> }) {
  const chrome = useBlockChrome();
  const split = block.split_endings === true;

  return (
    <div data-target={block.id} className="overflow-hidden rounded-v2-card bg-v2-card shadow-[var(--shadow-v2-soft)]">
      <div
        className="grid"
        style={{ gridTemplateColumns: `auto repeat(${block.cols.length}, minmax(0, 1fr))` }}
      >
        <div className="border-b border-v2-line bg-v2-primary px-1.5 py-1.5" aria-hidden />
        {block.cols.map((col, ci) => {
          const state = chrome.partState(block.id, `col:${ci}`);
          return (
            <div
              key={ci}
              data-target={`${block.id}/col:${ci}`}
              className={[
                'border-b border-v2-line px-1.5 py-1.5 text-center text-xs font-semibold',
                tableColHeaderClass(
                  col.label,
                  col.group,
                  block.cells as Cell[][],
                  ci,
                  split,
                ),
                partClass(state, true),
              ].join(' ')}
            >
              <RichText segments={col.label} />
            </div>
          );
        })}
        {block.rows.map((row, ri) => {
          const rowState = chrome.partState(block.id, `row:${ri}`);
          const fresh = block.cells[ri]?.some((_, ci) => chrome.freshCell(block.id, ri, ci)) ?? false;
          return (
            <div key={ri} className="contents">
              <div
                data-target={`${block.id}/row:${ri}`}
                className={[
                  'flex items-center gap-1 border-b border-v2-line px-1.5 py-2',
                  partClass(rowState),
                ].join(' ')}
              >
                {row.media?.image || row.media?.icon ? (
                  <MediaTile image={row.media.image} icon={row.media.icon} />
                ) : null}
                <span className="max-w-16 font-[family-name:var(--font-v2-target)] text-xs leading-tight">
                  <RichText segments={row.label} />
                </span>
              </div>
              {block.cells[ri]?.map((cell, ci) => {
                const state = chrome.partState(block.id, `cell:${ri}:${ci}`);
                return (
                  <div
                    key={ci}
                    data-target={`${block.id}/cell:${ri}:${ci}`}
                    className={[
                      'min-w-0 border-b border-v2-line px-1.5 py-2 text-center',
                      partClass(state),
                      chrome.freshCell(block.id, ri, ci) && state !== 'dim' ? 'v2-pop' : '',
                    ].join(' ')}
                    style={fresh ? { animationDelay: `${ci * ENDING_STAGGER_MS}ms` } : undefined}
                  >
                    <CellView blockId={block.id} col={ci} cell={cell as Cell} split={split} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CellView({
  blockId,
  col,
  cell,
  split,
}: {
  blockId: string;
  col: number;
  cell: Cell;
  split: boolean;
}) {
  const chrome = useBlockChrome();
  if (Array.isArray(cell)) {
    const hideTl = chrome.cover === 'tl';
    return (
      <span className={hideTl ? 'text-transparent' : undefined}>
        <RichText segments={cell} />
      </span>
    );
  }
  const shownId = chrome.displayFormId(blockId, col, cell.ref);
  const form = chrome.forms[shownId] ?? chrome.forms[cell.ref];
  if (form) {
    const covered = chrome.cover === 'endings' || chrome.cover === 'tl';
    const node = (
      <VerbForm
        form={form}
        split={split}
        coverEndings={chrome.cover === 'endings'}
        coverTl={chrome.cover === 'tl'}
      />
    );
    if (covered) return node;
    return (
      <button
        type="button"
        className="mx-auto block"
        onClick={() => chrome.onPlay(form.tl, 'pt')}
      >
        {node}
      </button>
    );
  }
  return <ContentLine item={chrome.items.get(cell.ref)} onPlay={chrome.onPlay} />;
}
