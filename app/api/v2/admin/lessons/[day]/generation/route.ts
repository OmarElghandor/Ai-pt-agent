import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  getJob,
  getLatestJobsForDay,
  listJobsForVersion,
  summarizeJobGraph,
} from '@/lib/v2/generation/jobs';
import { BUDGETS } from '@/lib/v2/generation/lesson/budgets';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import { getLatestLesson, getLessonVersion } from '@/lib/v2/generation/lesson/save';
import { getStoryVersion } from '@/lib/v2/generation/lesson/storySave';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;

  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const { day: dayRaw } = await ctx.params;
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 1 || day > 90) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }

  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  const versionParam = url.searchParams.get('version');

  let jobs = await getLatestJobsForDay(day);
  if (versionParam) {
    const v = Number(versionParam);
    if (Number.isInteger(v)) {
      jobs = await listJobsForVersion(day, v);
    }
  } else if (jobId) {
    const seed = await getJob(jobId);
    if (seed) {
      jobs = await listJobsForVersion(day, seed.version, seed.target_lang);
    }
  }

  const summary = summarizeJobGraph(jobs);
  const lesson =
    summary.version != null
      ? await getLessonVersion(day, summary.version)
      : await getLatestLesson(day);

  const failed = jobs.find((j) => j.status === 'failed');
  const plan = getDayPlan(day);
  const handoffs =
    (lesson?.meta as { handoffs?: Record<string, unknown> } | undefined)
      ?.handoffs ?? null;
  const briefHandoff = handoffs?.brief as
    | {
        warnings?: string[];
        yesterday_missing?: boolean;
        core_items_source?: string;
      }
    | undefined;
  const warnings = [
    ...(briefHandoff?.warnings ?? []),
  ];
  if (
    briefHandoff?.yesterday_missing &&
    !warnings.includes('yesterday_missing')
  ) {
    warnings.push('yesterday_missing');
  }
  let totalUsd = 0;
  let totalMs = 0;
  const t0 = jobs
    .map((j) => (j.started_at ? new Date(j.started_at).getTime() : null))
    .filter((n): n is number => n != null);
  const t1 = jobs
    .map((j) => (j.finished_at ? new Date(j.finished_at).getTime() : null))
    .filter((n): n is number => n != null);
  for (const j of jobs) {
    totalUsd += j.usd_estimate ?? 0;
    const ms =
      (j.progress as { timing?: { duration_ms?: number } } | null)?.timing
        ?.duration_ms ?? 0;
    totalMs += ms;
  }

  const idToConsumers: Record<string, string[]> = {};
  for (const j of jobs) {
    for (const dep of j.depends_on) {
      if (!idToConsumers[dep]) idToConsumers[dep] = [];
      idToConsumers[dep]!.push(j.id);
    }
  }

  return NextResponse.json({
    day,
    plan: {
      title_tl: plan.title_tl,
      title_ar: plan.title_ar,
      situation_eg: plan.situation_eg,
      week: plan.week,
    },
    job: {
      id: jobs.find((j) => j.kind === 'assemble')?.id ?? jobs[0]?.id ?? null,
      status: summary.status,
      version: summary.version,
      error: failed?.error ?? null,
    },
    jobs: jobs.map((j) => ({
      id: j.id,
      kind: j.kind,
      page_index: j.page_index,
      page_id: j.page_id,
      status: j.status,
      input_hash: j.input_hash,
      progress: j.progress,
      error: j.error,
      depends_on: j.depends_on,
      consumers: idToConsumers[j.id] ?? [],
      provider: j.provider ?? null,
      model: j.model ?? null,
      started_at: j.started_at ?? null,
      finished_at: j.finished_at ?? null,
      input: j.input ?? null,
      output: j.output ?? null,
      handoff: j.handoff ?? null,
      tokens: j.tokens ?? null,
      over_budget: j.over_budget ?? false,
      usd_estimate: j.usd_estimate ?? null,
      issues: j.issues ?? null,
      attempts: j.attempts ?? [],
    })),
    version: lesson?.version ?? summary.version,
    lesson_status: lesson?.status ?? null,
    flagged: lesson?.meta?.flagged ?? false,
    text_ready:
      summary.text_ready || Boolean(lesson?.meta?.text_ready === true),
    stale_count: summary.stale_count,
    cost: lesson?.meta?.cost ?? { total_usd_estimate: totalUsd },
    total_usd_estimate: totalUsd,
    total_duration_ms: totalMs,
    wall_started_at: t0.length ? new Date(Math.min(...t0)).toISOString() : null,
    wall_finished_at: t1.length ? new Date(Math.max(...t1)).toISOString() : null,
    timing: lesson?.meta?.timing ?? null,
    handoffs,
    warnings,
    yesterday_missing: Boolean(briefHandoff?.yesterday_missing),
    core_items_source: briefHandoff?.core_items_source ?? null,
    items: (lesson?.data as { items?: unknown } | undefined)?.items ?? [],
    questions:
      (lesson?.data as { questions?: unknown } | undefined)?.questions ?? [],
    story:
      summary.version != null
        ? await getStoryVersion({ day, version: summary.version })
        : null,
    budgets: BUDGETS,
  });
}
