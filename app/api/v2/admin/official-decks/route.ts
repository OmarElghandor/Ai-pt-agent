import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { listAdminOfficialDecks } from '@/lib/v2/decks/admin';

export const runtime = 'nodejs';

export async function GET() {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const decks = await listAdminOfficialDecks();
  return NextResponse.json({ decks });
}
