import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { saveCustomDeckDraft } from '@/lib/v2/decks/save';
import { isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    draft_id?: string;
    removed_keys?: string[];
  } | null;
  if (!body?.draft_id || typeof body.draft_id !== 'string') {
    return NextResponse.json({ error: 'draft_id required' }, { status: 400 });
  }

  const result = await saveCustomDeckDraft({
    user_id: userId,
    draft_id: body.draft_id,
    removed_keys: Array.isArray(body.removed_keys)
      ? body.removed_keys.filter((k) => typeof k === 'string')
      : [],
  });

  if (!result.ok) {
    const status = result.reason === 'too_few' ? 400 : 404;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
