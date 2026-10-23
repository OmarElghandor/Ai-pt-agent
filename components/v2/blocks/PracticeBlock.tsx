'use client';

import type { Block } from '@/lib/v2/content/blocks';
import { useBlockChrome } from './chrome';
import { QuestionCard } from './QuestionCard';
import { partClass } from './visibility';

export function PracticeBlock({ block }: { block: Extract<Block, { type: 'practice' }> }) {
  const chrome = useBlockChrome();
  const state = chrome.partState(block.id, null);
  return (
    <div data-target={block.id} className={['space-y-3', partClass(state)].join(' ')}>
      {block.questions.map((id) => {
        const question = chrome.questions.find((entry) => entry.id === id);
        if (!question) return null;
        return (
          <QuestionCard
            key={id}
            question={question}
            items={chrome.items}
            onAnswer={(optionIndex, correct) => chrome.onQuestionAnswer(id, optionIndex, correct)}
          />
        );
      })}
    </div>
  );
}
