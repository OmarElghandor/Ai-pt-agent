import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';

export const runtime = 'nodejs';

/** Lightweight gate probe for the in-session ⋯ regenerate menu. */
export async function GET() {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  return NextResponse.json({ ok: true });
}
