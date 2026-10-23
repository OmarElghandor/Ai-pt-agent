import type { ReactNode } from 'react';
import { TabBar } from '@/components/v2/TabBar';

export default function V2TabsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-2 pt-4">{children}</div>
      <TabBar />
    </>
  );
}
