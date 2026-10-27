import { NextResponse } from 'next/server';
import { isV2DevAllowed, isV2Enabled } from '@/lib/v2/flags';

/** Returns a response if admin access is denied; otherwise null. */
export function denyUnlessV2Admin(): NextResponse | null {
  if (!isV2Enabled() || !isV2DevAllowed()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}
