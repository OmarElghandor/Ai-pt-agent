import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';
import {
  listVoicesAdmin,
  setVoiceApproved,
  testVoice,
  updateLibrarySettings,
  updateVoice,
} from '@/lib/v2/library/voiceAdmin';
import {
  createElevenLabsClient,
  stubElevenLabsClient,
} from '@/lib/v2/library/elevenlabs';

export const runtime = 'nodejs';

export async function GET() {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const data = await listVoicesAdmin();
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  try {
    const body = (await req.json()) as {
      action: 'voice' | 'settings' | 'approve' | 'reject' | 'test';
      key?: string;
      patch?: Record<string, unknown>;
    };
    if (body.action === 'settings') {
      await updateLibrarySettings(body.patch ?? {});
      return NextResponse.json({ ok: true });
    }
    if (!body.key) {
      return NextResponse.json({ error: 'key required' }, { status: 400 });
    }
    if (body.action === 'voice') {
      const voice = await updateVoice(body.key, body.patch ?? {});
      return NextResponse.json({ ok: true, voice });
    }
    if (body.action === 'approve' || body.action === 'reject') {
      await setVoiceApproved(body.key, body.action === 'approve');
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'test') {
      const client = process.env.ELEVENLABS_API_KEY
        ? createElevenLabsClient()
        : stubElevenLabsClient();
      const result = await testVoice(body.key, { client });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    if (e instanceof Error) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return libraryErrorResponse(e);
  }
}
