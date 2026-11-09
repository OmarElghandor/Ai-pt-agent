import { NextResponse } from 'next/server';
import { auth } from '@/lib/v2/auth';
import { deleteV2UserData } from '@/lib/v2/auth/deleteAccount';
import { requireV2User } from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { headers } from 'next/headers';

export const runtime = 'nodejs';

/** GDPR account wipe for the signed-in user. Body: { confirm: true }. */
export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const result = await requireV2User();
  if (result.error) return result.error;

  const body = (await req.json().catch(() => null)) as { confirm?: boolean } | null;
  if (!body?.confirm) {
    return NextResponse.json({ error: 'confirmation required' }, { status: 400 });
  }

  const userId = result.user.id;
  const { deleted } = await deleteV2UserData(userId);

  // Sign out everywhere (best-effort; user row may already be gone).
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, deleted });
}
