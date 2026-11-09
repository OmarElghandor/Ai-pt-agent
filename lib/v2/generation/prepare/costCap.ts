import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2JobModel } from '@/lib/v2/mongo/models';

function envUsd(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function prepareMaxUsdPerDay(): number | null {
  return envUsd('V2_PREPARE_MAX_USD_PER_DAY');
}

export function prepareMaxUsdPerMonth(): number | null {
  return envUsd('V2_PREPARE_MAX_USD_PER_MONTH');
}

/** Sum usd_estimate for prepare_day (+ nested) jobs since `since`. */
export async function sumPrepareUsdSince(since: Date): Promise<number> {
  if (!mongoConfigured()) return 0;
  await connectMongo();
  const docs = await V2JobModel()
    .find({
      kind: {
        $in: [
          'prepare_day',
          'items',
          'story',
          'outline',
          'page',
          'critic',
          'questions',
          'micro',
          'daily_use',
          'real_world',
          'continuity',
          'assemble',
          'lang_check',
          'convo_outline',
          'convo_items',
          'convo_critic',
          'convo_lang_check',
          'convo_assemble',
        ],
      },
      createdAt: { $gte: since },
      usd_estimate: { $gt: 0 },
    })
    .select({ usd_estimate: 1 })
    .lean();
  let sum = 0;
  for (const d of docs) {
    sum += Number(d.usd_estimate ?? 0) || 0;
  }
  return sum;
}

export async function sumPrepareUsdForDay(day: number): Promise<number> {
  if (!mongoConfigured()) return 0;
  await connectMongo();
  const docs = await V2JobModel()
    .find({
      day,
      kind: 'prepare_day',
      usd_estimate: { $gt: 0 },
    })
    .select({ usd_estimate: 1 })
    .lean();
  return docs.reduce((s, d) => s + (Number(d.usd_estimate ?? 0) || 0), 0);
}

export type CostCapCheck = {
  ok: boolean;
  reason?: string;
  month_usd: number;
  day_usd?: number;
  month_cap: number | null;
  day_cap: number | null;
};

export async function checkPrepareCostCap(opts?: {
  day?: number;
}): Promise<CostCapCheck> {
  const monthCap = prepareMaxUsdPerMonth();
  const dayCap = prepareMaxUsdPerDay();
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const month_usd = await sumPrepareUsdSince(startOfMonth);
  const day_usd =
    opts?.day != null ? await sumPrepareUsdForDay(opts.day) : undefined;

  if (monthCap != null && month_usd >= monthCap) {
    return {
      ok: false,
      reason: `month cap ${monthCap} reached (spent ${month_usd.toFixed(2)})`,
      month_usd,
      day_usd,
      month_cap: monthCap,
      day_cap: dayCap,
    };
  }
  if (
    dayCap != null &&
    day_usd != null &&
    day_usd >= dayCap
  ) {
    return {
      ok: false,
      reason: `day cap ${dayCap} reached for day ${opts?.day} (spent ${day_usd.toFixed(2)})`,
      month_usd,
      day_usd,
      month_cap: monthCap,
      day_cap: dayCap,
    };
  }
  return {
    ok: true,
    month_usd,
    day_usd,
    month_cap: monthCap,
    day_cap: dayCap,
  };
}
