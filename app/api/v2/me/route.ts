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
  isCoachDialect,
  isDailyMinutesOption,
  isMotivationId,
  isProficiencyLevel,
  normalizeMotivations,
} from '@/lib/v2/auth/onboardingProfile';
import {
  normalizeCoachDialect,
  normalizeGender,
  normalizeNativeLang,
  normalizePractice,
  normalizeProficiency,
  normalizeReminders,
  normalizeTargetLang,
  normalizeUsername,
  type V2User,
} from '@/lib/v2/auth/types';
import { isV2Enabled } from '@/lib/v2/flags';
import { headers } from 'next/headers';

export const runtime = 'nodejs';

type PatchBody = {
  name?: string;
  gender?: 'm' | 'f' | null;
  native_lang?: string;
  target_lang?: string;
  coach_dialect?: string;
  motivations?: string[];
  proficiency?: string;
  practice?: { daily_minutes?: number };
  reminders?: { daily_enabled?: boolean };
  onboarded?: boolean;
};

function serializeUser(user: V2User, fresh: Record<string, unknown> | null) {
  return {
    ...user,
    name: String(fresh?.name ?? user.name),
    gender: normalizeGender(fresh?.gender ?? user.gender),
    username: normalizeUsername(fresh?.username ?? user.username),
    native_lang: normalizeNativeLang(
      fresh?.native_lang ?? user.native_lang,
    ),
    target_lang: normalizeTargetLang(
      fresh?.target_lang ?? user.target_lang,
    ),
    coach_dialect: normalizeCoachDialect(
      fresh?.coach_dialect ?? user.coach_dialect,
    ),
    motivations: normalizeMotivations(
      fresh?.motivations ?? user.motivations,
    ),
    proficiency: normalizeProficiency(
      fresh?.proficiency ?? user.proficiency,
    ),
    reminders: normalizeReminders(fresh?.reminders ?? user.reminders),
    practice: normalizePractice(fresh?.practice ?? user.practice),
    onboarded_at:
      (fresh?.onboarded_at as Date | string | null) ?? user.onboarded_at ?? null,
  };
}

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

  const body = (await req.json().catch(() => null)) as PatchBody | null;

  const betterAuthBody: {
    name?: string;
    gender?: string | null;
    native_lang?: string;
    target_lang?: string;
    coach_dialect?: string | null;
    motivations?: string[];
    proficiency?: string | null;
    reminders?: { daily_enabled: boolean };
  } = {};
  const directUpdates: Record<string, unknown> = {};

  if (typeof body?.name === 'string' && body.name.trim()) {
    betterAuthBody.name = body.name.trim().slice(0, 80);
  }
  if (body && 'gender' in body) {
    betterAuthBody.gender = normalizeGender(body.gender);
  }
  if (body && 'native_lang' in body) {
    if (!isNativeLangAllowed(body.native_lang)) {
      return NextResponse.json(
        { error: 'native_lang not allowed' },
        { status: 400 },
      );
    }
    betterAuthBody.native_lang = body.native_lang;
  }
  if (body && 'target_lang' in body) {
    if (!isTargetLangAllowed(body.target_lang)) {
      return NextResponse.json(
        { error: 'target_lang not allowed' },
        { status: 400 },
      );
    }
    betterAuthBody.target_lang = body.target_lang;
  }
  if (body && 'coach_dialect' in body) {
    if (body.coach_dialect == null || body.coach_dialect === '') {
      betterAuthBody.coach_dialect = null;
    } else if (!isCoachDialect(body.coach_dialect)) {
      return NextResponse.json(
        { error: 'coach_dialect not allowed' },
        { status: 400 },
      );
    } else {
      betterAuthBody.coach_dialect = body.coach_dialect;
      // Egyptian is the only coach/content dialect live today.
      if (body.coach_dialect === 'eg') {
        betterAuthBody.native_lang = 'eg';
      }
    }
  }
  if (body && 'motivations' in body) {
    if (!Array.isArray(body.motivations)) {
      return NextResponse.json(
        { error: 'motivations must be an array' },
        { status: 400 },
      );
    }
    if (body.motivations.some((m) => !isMotivationId(m))) {
      return NextResponse.json(
        { error: 'motivations not allowed' },
        { status: 400 },
      );
    }
    betterAuthBody.motivations = normalizeMotivations(body.motivations);
  }
  if (body && 'proficiency' in body) {
    if (body.proficiency == null || body.proficiency === '') {
      betterAuthBody.proficiency = null;
    } else if (!isProficiencyLevel(body.proficiency)) {
      return NextResponse.json(
        { error: 'proficiency not allowed' },
        { status: 400 },
      );
    } else {
      betterAuthBody.proficiency = body.proficiency;
    }
  }
  if (body?.reminders && typeof body.reminders === 'object') {
    betterAuthBody.reminders = {
      daily_enabled: Boolean(body.reminders.daily_enabled),
    };
  }
  if (
    body?.practice &&
    typeof body.practice === 'object' &&
    'daily_minutes' in body.practice
  ) {
    const minutes = body.practice.daily_minutes;
    if (
      typeof minutes !== 'number' ||
      !Number.isFinite(minutes) ||
      minutes < 5 ||
      minutes > 120
    ) {
      return NextResponse.json(
        { error: 'practice.daily_minutes not allowed' },
        { status: 400 },
      );
    }
    // Prefer the three onboarding options; still accept other values in range.
    if (
      !isDailyMinutesOption(Math.round(minutes)) &&
      ![5, 15, 20, 30].includes(Math.round(minutes))
    ) {
      // allow any 5–120; options are preferred in UI only
    }
    const existing = result.user.practice ?? null;
    directUpdates.practice = {
      ...(existing && typeof existing === 'object' ? existing : {}),
      daily_minutes: Math.round(minutes),
    };
  }
  if (body?.onboarded === true) {
    directUpdates.onboarded_at = new Date();
  }

  if (
    Object.keys(betterAuthBody).length === 0 &&
    Object.keys(directUpdates).length === 0
  ) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  if (Object.keys(betterAuthBody).length > 0) {
    await auth.api.updateUser({
      body: betterAuthBody,
      headers: await headers(),
    });
  }

  if (Object.keys(directUpdates).length > 0) {
    const db = await getAuthDb();
    const write = await updateV2UserDoc(db, result.user.id, directUpdates);
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
    user: serializeUser(user ?? result.user, fresh),
  });
}
