import { NextResponse } from 'next/server';

/** Public health check — no session required. */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'v2' });
}
