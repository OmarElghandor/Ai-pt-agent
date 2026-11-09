import { NextResponse } from 'next/server';
import { requireV2Admin } from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';

/** Returns a response if admin access is denied; otherwise null. Requires role: admin. */
export async function denyUnlessV2Admin(): Promise<NextResponse | null> {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const result = await requireV2Admin();
  return result.error ?? null;
}
