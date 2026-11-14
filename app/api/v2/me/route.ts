import { NextResponse } from 'next/server';
import { auth } from '@/lib/v2/auth';
import { getCurrentV2User, requireV2User } from '@/lib/v2/auth/session';
import { getAuthDb } from '@/lib/v2/auth/getAuthDb';
import { findV2UserDoc, updateV2UserDoc } from '@/lib/v2/auth/v2UserDoc';
import {
  isNativeLangAllowed,
  isTargetLangAllowed,
} from '@/lib/v2/auth/languages';
import {
  normalizeGender,
  normalizeNativeLang,
  normalizeTargetLang,
} from '@/lib/v2/auth/types';
import { isV2Enabled } from '@/lib/v2/flags';
import { headers } from 'next/headers';

export const runtime = 'nodejs';

export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const result = await requireV2User();
  if (result.error) return result.error;
  return NextResponse.json({ user: result.user });
}

export async function PATCH(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const result = await requireV2User();
  if (result.error) return result.error;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    gender?: 'm' | 'f' | null;
    native_lang?: string;
    target_lang?: string;
    onboarded?: boolean;
  } | null;

  const updates: Record<string, unknown> = {};
  if (typeof body?.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim().slice(0, 80);
  }
  if (body && 'gender' in body) {
    updates.gender = normalizeGender(body.gender);
  }
  if (body && 'native_lang' in body) {
    if (!isNativeLangAllowed(body.native_lang)) {
      return NextResponse.json(
        { error: 'native_lang not allowed' },
        { status: 400 },
      );
    }
    updates.native_lang = body.native_lang;
  }
  if (body && 'target_lang' in body) {
    if (!isTargetLangAllowed(body.target_lang)) {
      return NextResponse.json(
        { error: 'target_lang not allowed' },
        { status: 400 },
      );
    }
    updates.target_lang = body.target_lang;
  }
  if (body?.onboarded === true) {
    updates.onboarded_at = new Date();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  // Better Auth owns name, gender, langs (input: true). onboarded_at is input: false.
  const betterAuthBody: {
    name?: string;
    gender?: string | null;
    native_lang?: string;
    target_lang?: string;
  } = {};
  if (typeof updates.name === 'string') {
    betterAuthBody.name = updates.name;
  }
  if ('gender' in updates) {
    betterAuthBody.gender = updates.gender as string | null;
  }
  if (typeof updates.native_lang === 'string') {
    betterAuthBody.native_lang = updates.native_lang;
  }
  if (typeof updates.target_lang === 'string') {
    betterAuthBody.target_lang = updates.target_lang;
  }
  if (Object.keys(betterAuthBody).length > 0) {
    await auth.api.updateUser({
      body: betterAuthBody,
      headers: await headers(),
    });
  }

  if (updates.onboarded_at) {
    const db = await getAuthDb();
    const write = await updateV2UserDoc(db, result.user.id, {
      onboarded_at: updates.onboarded_at,
    });
    if (write.matchedCount === 0) {
      return NextResponse.json(
        { error: 'user profile not found' },
        { status: 500 },
      );
    }
  }

  const user = await getCurrentV2User();
  const db = await getAuthDb();
  const fresh = await findV2UserDoc(db, result.user.id);
  return NextResponse.json({
    user: {
      ...(user ?? result.user),
      name: fresh?.name ?? user?.name ?? result.user.name,
      gender: normalizeGender(fresh?.gender ?? user?.gender),
      native_lang: normalizeNativeLang(
        fresh?.native_lang ?? user?.native_lang ?? result.user.native_lang,
      ),
      target_lang: normalizeTargetLang(
        fresh?.target_lang ?? user?.target_lang ?? result.user.target_lang,
      ),
      onboarded_at: (fresh?.onboarded_at as Date | string | null) ??
        user?.onboarded_at ??
        null,
    },
  });
}
