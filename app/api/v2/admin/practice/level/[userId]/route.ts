import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { V2UserLevelModel } from '@/lib/v2/mongo/models';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { rebuildUserLevel } from '@/lib/v2/practice/levelJob';
import { skillPercentAdmin, LEVEL_SKILLS } from '@/lib/v2/practice/userLevel';

export const runtime = 'nodejs';

async function findUser(userId: string) {
  const db = mongoose.connection.db;
  if (!db) return null;
  return db.collection('v2_users').findOne({
    $or: [{ id: userId }, { _id: userId as unknown as object }],
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  await connectMongo();
  const { userId } = await ctx.params;

  let level = await V2UserLevelModel().findOne({ user_id: userId }).lean();
  if (!level) {
    await rebuildUserLevel(userId);
    level = await V2UserLevelModel().findOne({ user_id: userId }).lean();
  }

  const user = await findUser(userId);
  const skills = LEVEL_SKILLS.map((s) => {
    const block = (
      level?.skills as
        | Record<
            string,
            {
              last_14?: { first_try_correct?: number; attempts?: number };
              prev_14?: { first_try_correct?: number; attempts?: number };
            }
          >
        | undefined
    )?.[s];
    const last = block?.last_14 ?? { first_try_correct: 0, attempts: 0 };
    const prev = block?.prev_14 ?? { first_try_correct: 0, attempts: 0 };
    return {
      skill: s,
      last_14: {
        first_try_correct: last.first_try_correct ?? 0,
        attempts: last.attempts ?? 0,
        percent: skillPercentAdmin({
          first_try_correct: last.first_try_correct ?? 0,
          attempts: last.attempts ?? 0,
          avg_time_ms: 0,
          by_type: {},
        }),
      },
      prev_14: {
        first_try_correct: prev.first_try_correct ?? 0,
        attempts: prev.attempts ?? 0,
        percent: skillPercentAdmin({
          first_try_correct: prev.first_try_correct ?? 0,
          attempts: prev.attempts ?? 0,
          avg_time_ms: 0,
          by_type: {},
        }),
      },
    };
  });

  return NextResponse.json({
    user: {
      id: userId,
      name: (user as { name?: string } | null)?.name ?? null,
      email: (user as { email?: string } | null)?.email ?? null,
    },
    rebuilt_at: level?.rebuilt_at ?? null,
    answer_count: level?.answer_count ?? 0,
    skills,
    patterns: level?.patterns ?? {},
    lessons: level?.lessons ?? {},
    problem_ids: level?.problem_ids ?? [],
    time_by_type: level?.time_by_type ?? {},
  });
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { userId } = await ctx.params;
  await rebuildUserLevel(userId);
  return NextResponse.json({ ok: true });
}
