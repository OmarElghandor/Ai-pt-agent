import { NextResponse } from 'next/server';
import { requireV2User } from '@/lib/v2/auth/session';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { buildMeSummary } from '@/lib/v2/progress/summary';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireV2User();
  if (auth.error) return auth.error;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'mongo_unavailable' }, { status: 503 });
  }
  await connectMongo();
  const summary = await buildMeSummary(auth.user);
  return NextResponse.json(summary);
}
