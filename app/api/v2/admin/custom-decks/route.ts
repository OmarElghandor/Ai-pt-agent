import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { costPerDay, listAdminCustomDecks } from '@/lib/v2/decks/admin';
import { mongoConfigured } from '@/lib/mongo';
import { userLocalDate } from '@/lib/v2/progress/userLocalDate';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const url = new URL(req.url);
  const filter = (url.searchParams.get('filter') ?? 'all') as
    | 'popular'
    | 'reported'
    | 'not_promoted'
    | 'all';
  const decks = await listAdminCustomDecks({ filter });
  const local_date = userLocalDate('Europe/Lisbon');
  const cost = await costPerDay(local_date);
  return NextResponse.json({ decks, cost, local_date });
}
