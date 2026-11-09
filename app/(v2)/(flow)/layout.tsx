import type { ReactNode } from 'react';
import { requireOnboardedUser } from '@/lib/v2/auth/requireOnboarded';

/** Full-screen flow screens (no tab bar). */
export default async function V2FlowLayout({ children }: { children: ReactNode }) {
  await requireOnboardedUser('/path');
  return <div className="flex min-h-dvh flex-1 flex-col">{children}</div>;
}
