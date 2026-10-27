'use client';

import type { Block } from '@/lib/v2/content/blocks';
import { CardsBlock } from './CardsBlock';
import { useBlockChrome } from './chrome';
import { CompareBlock } from './CompareBlock';
import { DialogueBlock } from './DialogueBlock';
import { ExamplesBlock } from './ExamplesBlock';
import { FormulaBlock } from './FormulaBlock';
import { HeadingBlock } from './HeadingBlock';
import { PanelBlock } from './PanelBlock';
import { PracticeBlock } from './PracticeBlock';
import { RulesListBlock } from './RulesListBlock';
import { SceneBlock } from './SceneBlock';
import { TableBlock } from './TableBlock';
import { TimelineBlock } from './TimelineBlock';
import { TipBlock } from './TipBlock';
import { VsPairsBlock } from './VsPairsBlock';

export function BlockView({ block }: { block: Block }) {
  const chrome = useBlockChrome();
  const locked = chrome.locked(block.id);
  const inner = renderBlock(block);
  return (
    <div
      data-block={block.id}
      className={locked ? 'pointer-events-none opacity-[0.38] grayscale-[0.4]' : undefined}
    >
      {inner}
    </div>
  );
}

function renderBlock(block: Block) {
  switch (block.type) {
    case 'heading':
      return <HeadingBlock block={block} />;
    case 'cards':
      return <CardsBlock block={block} />;
    case 'table':
      return <TableBlock block={block} />;
    case 'compare':
      return <CompareBlock block={block} />;
    case 'vs_pairs':
      return <VsPairsBlock block={block} />;
    case 'formula':
      return <FormulaBlock block={block} />;
    case 'examples':
      return <ExamplesBlock block={block} />;
    case 'tip':
      return <TipBlock block={block} />;
    case 'rules_list':
      return <RulesListBlock block={block} />;
    case 'dialogue':
      return <DialogueBlock block={block} />;
    case 'scene':
      return <SceneBlock block={block} />;
    case 'panel':
      return <PanelBlock block={block} />;
    case 'timeline':
      return <TimelineBlock block={block} />;
    case 'practice':
      return <PracticeBlock block={block} />;
    default:
      return null;
  }
}
