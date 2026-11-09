import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { isV2Enabled } from '@/lib/v2/flags';
import { V2TopicRequestModel } from '@/lib/v2/mongo/models';

export const runtime = 'nodejs';

const ACK_EG = 'سجّلنا طلبك وهنجهّزه قريب 🙏';

/** POST a Learn-mode new-topic request (Batch 10 D6). */
export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const userId = getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    query_eg?: string;
    mode?: string;
  } | null;
  const query = body?.query_eg?.trim();
  if (!query) {
    return NextResponse.json({ error: 'query_eg required' }, { status: 400 });
  }
  const mode = body?.mode === 'learn' ? 'learn' : 'learn';

  if (mongoConfigured()) {
    await connectMongo();
    await V2TopicRequestModel().create({
      user_id: userId,
      query_eg: query,
      mode,
      created_at: new Date(),
    });
  }

  return NextResponse.json({ ok: true, ack_eg: ACK_EG });
}
