import { NextResponse } from 'next/server';
import { mongoConfigured } from '@/lib/mongo';
import { buildPathPayload } from '@/lib/v2/path';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const url = new URL(req.url);
  const dev = url.searchParams.get('dev') === '1';

  try {
    const payload = await buildPathPayload({ dev });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
