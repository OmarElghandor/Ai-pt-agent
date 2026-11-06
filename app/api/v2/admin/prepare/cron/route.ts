import { NextResponse, after } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import {
  beginPrepareRange,
  furthestActiveLearnerDay,
  runPrepareDayRange,
} from '@/lib/v2/generation/prepare/range';
import { checkPrepareCostCap } from '@/lib/v2/generation/prepare/costCap';

export const runtime = 'nodejs';
export const maxDuration = 300;

function cronEnabled(): boolean {
  const raw = process.env.V2_PREPARE_CRON?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * Scheduled keep-ahead: next 7 days after furthest learner.
 * Behind V2_PREPARE_CRON=1 (or admin POST without the flag in non-prod).
 */
export async function GET() {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;
  if (!cronEnabled()) {
    return NextResponse.json(
      { error: 'V2_PREPARE_CRON not enabled' },
      { status: 403 },
    );
  }
  return startKeepAhead();
}

export async function POST() {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;
  return startKeepAhead();
}

async function startKeepAhead() {
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const cap = await checkPrepareCostCap();
  if (!cap.ok) {
    console.warn('[v2-prepare:cron] capped', cap.reason);
    return NextResponse.json({
      skipped: true,
      reason: cap.reason,
      cost: cap,
    });
  }

  const furthest = await furthestActiveLearnerDay();
  const from = furthest + 1;
  const to = furthest + 7;
  const seeded = beginPrepareRange({ from, to, concurrency: 2 });

  after(async () => {
    try {
      await runPrepareDayRange({
        from,
        to,
        concurrency: 2,
        runId: seeded.run_id,
      });
    } catch (err) {
      console.error(
        '[v2-prepare:cron]',
        err instanceof Error ? err.message : err,
      );
    }
  });

  return NextResponse.json({
    queued: true,
    furthest_learner_day: furthest,
    from,
    to,
    run_id: seeded.run_id,
    cost: cap,
  });
}
