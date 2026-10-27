'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Item } from '@/lib/v2/content/items';
import type { Question } from '@/lib/v2/content/lesson';
import type { Cover } from '@/lib/v2/content/page';
import type { FormView } from '@/lib/v2/render/forms';
import type { PartVisibility } from '@/lib/v2/render/guided';

export type BlockChrome = {
  items: ReadonlyMap<string, Item>;
  forms: Readonly<Record<string, FormView>>;
  questions: readonly Question[];
  partState: (blockId: string, part: string | null) => PartVisibility;
  locked: (blockId: string) => boolean;
  cover: Cover | null;
  onPlay: (text: string, lang: 'pt' | 'ar') => void;
  displayFormId: (blockId: string, colIndex: number | null, ref: string) => string;
  onQuestionAnswer: (questionId: string, optionIndex: number, correct: boolean) => void;
  freshCell: (blockId: string, row: number, col: number) => boolean;
};

const BlockChromeContext = createContext<BlockChrome | null>(null);

export function BlockChromeProvider({
  value,
  children,
}: {
  value: BlockChrome;
  children: ReactNode;
}) {
  return <BlockChromeContext.Provider value={value}>{children}</BlockChromeContext.Provider>;
}

export function useBlockChrome(): BlockChrome {
  const value = useContext(BlockChromeContext);
  if (!value) throw new Error('BlockChrome missing');
  return value;
}
