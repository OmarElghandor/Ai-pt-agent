import { NextResponse } from 'next/server';
import { configuredSocialProviders } from '@/lib/v2/auth/env';
import { isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';

/** Public: which social providers are wired (Apple/Facebook optional). */
export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  return NextResponse.json({ providers: configuredSocialProviders() });
}
