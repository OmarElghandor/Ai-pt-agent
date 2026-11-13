import { NextResponse } from 'next/server';
import { requireV2User } from '@/lib/v2/auth/session';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { ProgressEventSchema } from '@/lib/v2/progress/events/types';
import {
  createMongoProgressStore,
  handleProgressEvent,
} from '@/lib/v2/progress/events';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireV2User();
  if (auth.error) return auth.error;

  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'mongo_unavailable' }, { status: 503 });
  }
  await connectMongo();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = ProgressEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_event', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await handleProgressEvent(parsed.data, {
    userId: auth.user.id,
    timezone: auth.user.timezone,
    store: createMongoProgressStore(),
    onStreakActivity: async (args) => {
      const { onStreakActivity } = await import('@/lib/v2/progress/streak');
      await onStreakActivity(args);
    },
  });

  try {
    const { invalidateMeSummary } = await import('@/lib/v2/progress/summary');
    invalidateMeSummary(auth.user.id);
  } catch {
    // cache best-effort
  }

  return NextResponse.json(result);
}
