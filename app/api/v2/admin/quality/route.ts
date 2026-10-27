import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { V2GenSampleRunModel } from '@/lib/v2/mongo/models';
import { connectMongo, mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

export async function GET() {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  await connectMongo();
  const docs = await V2GenSampleRunModel()
    .find({})
    .sort({ started_at: -1 })
    .limit(40)
    .lean();

  const runs = docs.map((d, i) => {
    const prev = docs[i + 1];
    const deltaRules: Record<string, number> = {};
    const curIssues = (d.issues_by_rule ?? {}) as Record<string, number>;
    const prevIssues = (prev?.issues_by_rule ?? {}) as Record<string, number>;
    const keys = new Set([
      ...Object.keys(curIssues),
      ...Object.keys(prevIssues),
    ]);
    for (const k of keys) {
      deltaRules[k] = (curIssues[k] ?? 0) - (prevIssues[k] ?? 0);
    }
    return {
      id: String(d._id),
      profile: d.profile,
      started_at: d.started_at,
      finished_at: d.finished_at,
      issues_by_rule: curIssues,
      tokens_by_kind: d.tokens_by_kind,
      time_by_kind: d.time_by_kind,
      cost_by_kind: d.cost_by_kind,
      over_budget_count: d.over_budget_count ?? 0,
      summary: d.summary,
      delta_vs_previous: prev
        ? {
            issues_by_rule: deltaRules,
            over_budget:
              (d.over_budget_count ?? 0) - (prev.over_budget_count ?? 0),
          }
        : null,
    };
  });

  return NextResponse.json({ runs });
}
