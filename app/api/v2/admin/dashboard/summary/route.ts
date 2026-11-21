import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { loadDashboardSummary } from '@/lib/v2/admin/dashboardSummary';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const lang = url.searchParams.get('lang')?.trim() || 'pt-PT';
    const summary = await loadDashboardSummary(lang);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[v2-admin dashboard/summary]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
