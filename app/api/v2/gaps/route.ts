import { NextResponse } from 'next/server';
import { requireV2User } from '@/lib/v2/auth/session';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { listOpenWeakSpots } from '@/lib/v2/progress/weak/list';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireV2User();
  if (auth.error) return auth.error;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'mongo_unavailable' }, { status: 503 });
  }
  await connectMongo();
  const spots = await listOpenWeakSpots(auth.user.id, {
    includeImproving: true,
    limit: 5,
  });
  return NextResponse.json({ spots });
}
