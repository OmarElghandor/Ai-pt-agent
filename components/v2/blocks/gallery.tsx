'use client';

import { useMemo, type ReactNode } from 'react';
import { PagePlayer } from '@/components/v2/player/PagePlayer';
import type { FormView } from '@/lib/v2/render/forms';
import type { PartVisibility } from '@/lib/v2/render/guided';
import { BlockView } from './BlockView';
import { BlockChromeProvider, type BlockChrome } from './chrome';
import { EXPLORE_FIXTURE, FIXTURE_BLOCKS, FIXTURE_ITEMS, FIXTURE_QUESTION } from './fixtures';

function StaticChrome({
  forms,
  partState = () => 'shown',
  children,
}: {
  forms: Record<string, FormView>;
  partState?: (blockId: string, part: string | null) => PartVisibility;
  children: ReactNode;
}) {
  const items = useMemo(() => new Map(FIXTURE_ITEMS.map((item) => [item.id, item])), []);
  const value: BlockChrome = {
    items,
    forms,
    questions: [FIXTURE_QUESTION],
    partState,
    locked: () => false,
    cover: null,
    onPlay: () => {},
    displayFormId: (_blockId, _col, ref) => ref,
    onQuestionAnswer: () => {},
    freshCell: () => false,
  };
  return <BlockChromeProvider value={value}>{children}</BlockChromeProvider>;
}

export function BlockGallery({ forms }: { forms: Record<string, FormView> }) {
  return (
    <div className="space-y-8">
      {FIXTURE_BLOCKS.map(({ label, block }) => (
        <section key={label} className="space-y-3">
          <h2 className="font-[family-name:var(--font-v2-ui)] text-sm font-semibold text-v2-ink-muted">
            {label}
          </h2>
          <StaticChrome
            forms={forms}
            partState={
              label === 'compare'
                ? (_blockId, part) => {
                    if (part === 'entry:0:0') return 'active';
                    if (part === 'entry:0:1' || part === 'entry:1:0') return 'dim';
                    return 'shown';
                  }
                : undefined
            }
          >
            <BlockView block={block} />
          </StaticChrome>
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-v2-ui)] text-sm font-semibold text-v2-ink-muted">
          explore · reveal_axis + swap
        </h2>
        <PagePlayer
          embedded
          day={6}
          page={EXPLORE_FIXTURE}
          items={FIXTURE_ITEMS}
          questions={[FIXTURE_QUESTION]}
          forms={forms}
        />
      </section>
    </div>
  );
}
