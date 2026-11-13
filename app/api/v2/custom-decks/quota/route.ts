import { NextResponse } from 'next/server';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { countQuotaUsage } from '@/lib/v2/decks/generate/run';
import { customDeckQuota } from '@/lib/v2/decks/quota';
import { isV2Enabled } from '@/lib/v2/flags';
import { userLocalDate } from '@/lib/v2/progress/userLocalDate';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const user = await getCurrentV2User();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tz =
    req.headers.get('x-timezone') ?? user.timezone ?? 'Europe/Lisbon';
  const local_date = userLocalDate(tz);
  const usage = await countQuotaUsage({
    user_id: user.id,
    local_date,
  });
  const quota = customDeckQuota(
    { id: user.id },
    { userUsed: usage.userUsed, globalUsed: usage.globalUsed },
  );
  return NextResponse.json({
    remaining: quota.userRemaining,
    limit: quota.userLimit,
    local_date,
  });
}
