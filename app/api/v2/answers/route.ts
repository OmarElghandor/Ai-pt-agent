import { NextResponse } from 'next/server';
import { handleAnswerRequest } from '@/lib/v2/answers/handle';
import { isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';

/**
 * Sole HTTP entry for lesson/quiz/open answers that write progress.
 * Requires answer_id (uuid); duplicates return the stored verdict.
 */
export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const tzHeader = req.headers.get('x-timezone') ?? undefined;
  const result = await handleAnswerRequest(body, { timeZone: tzHeader });
  if (result.status !== 200) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body);
}
