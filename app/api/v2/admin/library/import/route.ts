import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { importFromContent } from '@/lib/v2/library/importFromContent';

export const runtime = 'nodejs';

export async function POST() {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const summary = await importFromContent();
  return NextResponse.json({ summary });
}
