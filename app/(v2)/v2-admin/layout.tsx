import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/v2/admin/AdminShell';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';

export default async function V2AdminLayout({ children }: { children: ReactNode }) {
  if (!isV2Enabled()) {
    notFound();
  }
  const user = await getCurrentV2User();
  if (!user) {
    redirect('/sign-in?next=/v2-admin');
  }
  if (user.role !== 'admin') {
    notFound();
  }
  return <AdminShell>{children}</AdminShell>;
}
