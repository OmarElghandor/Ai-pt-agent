import { NextResponse } from 'next/server';
import { parsePageAnswerPayload } from '@/lib/v2/render/answerPayload';

export const runtime = 'nodejs';

/**
 * Stub writer for page asks and quiz picks.
 * Correctness stays on the client. Phase 4 replaces this handler and is the only progress writer.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parsePageAnswerPayload(body);
  if (!parsed) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
