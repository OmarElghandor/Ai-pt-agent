'use client';

import { CalloutBar } from '@/components/v2/CalloutBar';
import { NoteCard } from '@/components/v2/NoteCard';
import { RichText } from '@/components/v2/RichText';
import type { Block } from '@/lib/v2/content/blocks';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

const KIND_LABEL = {
  rule: 'قاعدة',
  culture: 'ثقافة',
  warning: 'خلي بالك',
} as const;

export function TipBlock({ block }: { block: Extract<Block, { type: 'tip' }> }) {
  const chrome = useBlockChrome();
  const state = chrome.partState(block.id, null);
  const kindLabel = KIND_LABEL[block.kind];
  const titlePlain = block.title.map((s) => s.text).join('').trim();
  const titleDupesKind = titlePlain === kindLabel;
  const title = titleDupesKind ? (
    <RichText segments={block.title} />
  ) : (
    <>
      {kindLabel}
      {' · '}
      <RichText segments={block.title} />
    </>
  );
  const body = <RichText segments={block.body} />;

  return (
    <div data-target={block.id} className={partClass(state)}>
      {block.kind === 'rule' ? (
        <CalloutBar>
          <span className="font-semibold">{title}</span>
          <span className="mt-0.5 block font-normal opacity-95">{body}</span>
        </CalloutBar>
      ) : (
        <NoteCard>
          <span className="font-semibold">{title}</span>
          <span className="mt-1 block">{body}</span>
        </NoteCard>
      )}
    </div>
  );
}
