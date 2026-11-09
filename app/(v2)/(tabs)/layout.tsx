import type { ReactNode } from 'react';
import { TabBar } from '@/components/v2/TabBar';
import { requireOnboardedUser } from '@/lib/v2/auth/requireOnboarded';

export default async function V2TabsLayout({ children }: { children: ReactNode }) {
  await requireOnboardedUser('/path');

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-20 pt-4">{children}</div>
      <TabBar />
    </>
  );
}
