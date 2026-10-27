import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { isV2DevAllowed, isV2Enabled } from '@/lib/v2/flags';

export default function V2AdminLayout({ children }: { children: ReactNode }) {
  if (!isV2Enabled() || !isV2DevAllowed()) {
    notFound();
  }
  return children;
}
