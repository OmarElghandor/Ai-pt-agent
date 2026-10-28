'use client';

import type { Block } from '@/lib/v2/content/blocks';
import { AudioButton } from '@/components/v2/AudioButton';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

export function DialogueBlock({ block }: { block: Extract<Block, { type: 'dialogue' }> }) {
  const chrome = useBlockChrome();
  return (
    <div data-target={block.id} className="space-y-2">
      {block.lines.map((line, index) => {
        const state = chrome.partState(block.id, `item:${index}`);
        return (
          <div
            key={`${index}-${line.tl}`}
            data-target={`${block.id}/item:${index}`}
            className={[
              'rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]',
              partClass(state),
            ].join(' ')}
          >
            <p className="font-[family-name:var(--font-v2-ui)] text-[11px] text-v2-ink-muted">
              {line.speaker}
            </p>
            <button
              type="button"
              dir="ltr"
              className="mt-0.5 block w-full text-start text-[15px] font-semibold leading-snug text-v2-ink"
              onClick={() => chrome.onPlay(line.tl, 'pt')}
            >
              {line.tl}
            </button>
            {line.ar ? (
              <p
                dir="rtl"
                className="mt-0.5 text-start font-[family-name:var(--font-v2-arabic)] text-[13px] leading-5 text-v2-ink-muted"
              >
                {`«${line.ar}»`}
              </p>
            ) : null}
            <div className="mt-1">
              <AudioButton text={line.tl} lang="pt" label="اسمع" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
