import { NextResponse } from 'next/server';
import { getAuthDb } from '@/lib/v2/auth/getAuthDb';
import { isDevSignInEnabled } from '@/lib/v2/auth/devSignIn';

export const runtime = 'nodejs';

/**
 * Dev/CI only: create a session for the fixed test user.
 * Not registered for use in production — returns 404 when disabled.
 */
export async function POST(req: Request) {
  if (!isDevSignInEnabled()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    name?: string;
    role?: 'learner' | 'admin';
  } | null;

  const email = (body?.email ?? 'ci-test@langify.local').toLowerCase();
  const name = body?.name ?? 'CI Test';
  const role = body?.role === 'admin' ? 'admin' : 'learner';

  const db = await getAuthDb();
  const users = db.collection('v2_users');
  const sessions = db.collection('v2_auth_sessions');

  let user = await users.findOne({ email });
  const now = new Date();
  if (!user) {
    const id = `dev_${Buffer.from(email).toString('hex').slice(0, 24)}`;
    await users.insertOne({
      id,
      name,
      email,
      email_verified: true,
      picture: null,
      role,
      gender: null,
      onboarded_at: now,
      langify_user_id: null,
      createdAt: now,
      updatedAt: now,
    });
    user = await users.findOne({ id });
  }

  if (!user?.id) {
    return NextResponse.json({ error: 'user create failed' }, { status: 500 });
  }

  // Prefer Better Auth internal sign-in when available; fall back to raw session cookie shape.
  const { auth } = await import('@/lib/v2/auth');
  try {
    // Use Better Auth's test-friendly path: set session via internal API if present.
    const token = `dev_session_${user.id}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 60 * 1000);
    await sessions.insertOne({
      id: token,
      token,
      userId: user.id,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ipAddress: '127.0.0.1',
      userAgent: 'dev-signin',
    });

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, email, name, role },
    });
    const secure = process.env.NODE_ENV === 'production';
    const cookieName = secure
      ? '__Secure-better-auth.session_token'
      : 'better-auth.session_token';
    res.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      expires: expiresAt,
    });
    void auth;
    void req;
    return res;
  } catch (err) {
    console.error('[dev-signin]', err);
    return NextResponse.json({ error: 'signin failed' }, { status: 500 });
  }
}

export async function GET() {
  if (!isDevSignInEnabled()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, hint: 'POST to create a test session' });
}
