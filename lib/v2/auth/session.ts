import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from './index';
import {
  normalizeGender,
  normalizeRole,
  normalizeStreak,
  type V2User,
  type V2UserGender,
  type V2UserRole,
} from './types';
import { DEFAULT_LEARNER_TIMEZONE } from '@/lib/v2/progress/lessonProgressTypes';

function toV2User(raw: Record<string, unknown>): V2User {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    emailVerified: Boolean(raw.emailVerified ?? raw.email_verified),
    image: (raw.image ?? raw.picture ?? null) as string | null,
    role: normalizeRole(raw.role),
    gender: normalizeGender(raw.gender),
    onboarded_at: (raw.onboarded_at as Date | string | null) ?? null,
    langify_user_id: (raw.langify_user_id as string | null) ?? null,
    timezone:
      typeof raw.timezone === 'string' && raw.timezone.trim()
        ? raw.timezone
        : DEFAULT_LEARNER_TIMEZONE,
    streak: normalizeStreak(raw.streak),
    createdAt: (raw.createdAt as Date | string) ?? new Date(0),
    updatedAt: (raw.updatedAt as Date | string) ?? new Date(0),
  };
}

/**
 * Current v2 user from the session cookie. Never reads user id from the request body/query/headers.
 * Returns null when unsigned.
 */
export async function getCurrentV2User(): Promise<V2User | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) return null;
  const user = toV2User(session.user as unknown as Record<string, unknown>);
  // Prefer DB for profile fields so settings (gender, onboarded) apply immediately.
  try {
    const { getAuthDb } = await import('./getAuthDb');
    const { findV2UserDoc } = await import('./v2UserDoc');
    const db = await getAuthDb();
    const doc = await findV2UserDoc(db, user.id);
    if (doc) {
      user.name = String(doc.name ?? user.name);
      user.gender = normalizeGender(doc.gender);
      user.onboarded_at = (doc.onboarded_at as Date | string | null) ?? null;
      user.role = normalizeRole(doc.role);
      user.langify_user_id = doc.langify_user_id
        ? String(doc.langify_user_id)
        : null;
      user.image = (doc.picture as string | null) ?? user.image;
      user.emailVerified = Boolean(doc.email_verified ?? user.emailVerified);
      user.timezone =
        typeof doc.timezone === 'string' && doc.timezone.trim()
          ? String(doc.timezone)
          : DEFAULT_LEARNER_TIMEZONE;
      user.streak = normalizeStreak(doc.streak);
    }
  } catch {
    // Session user is enough if Mongo is briefly unavailable.
  }
  return user;
}

/** Session user id, or null. Prefer getCurrentV2User when you need profile fields. */
export async function getCurrentV2UserId(): Promise<string | null> {
  const user = await getCurrentV2User();
  return user?.id ?? null;
}

export async function requireV2User(): Promise<
  { user: V2User; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const user = await getCurrentV2User();
  if (!user) {
    return {
      error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }
  return { user };
}

export async function requireV2Admin(): Promise<
  { user: V2User; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const result = await requireV2User();
  if (result.error) return result;
  if (result.user.role !== 'admin') {
    return {
      error: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };
  }
  return result;
}

/** Learner gender for tl / tl_f and voice; defaults to m per 00 §4. */
export async function getLearnerGender(): Promise<V2UserGender> {
  const user = await getCurrentV2User();
  return user?.gender === 'f' ? 'f' : 'm';
}

export function learnerGenderFromUser(user: V2User | null | undefined): V2UserGender {
  return user?.gender === 'f' ? 'f' : 'm';
}

export type { V2User, V2UserGender, V2UserRole };
