'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { arDigits, useAdminShell } from '@/components/v2/admin/adminShellContext';
import type { DashboardSummary } from '@/lib/v2/admin/dashboardSummary';

export default function V2AdminJobsPage() {
  const { applySummaryChrome } = useAdminShell();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/admin/dashboard/summary');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as DashboardSummary;
        if (cancelled) return;
        setSummary(data);
        applySummaryChrome(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySummaryChrome]);

  return (
    <div className="mx-auto max-w-3xl" dir="rtl">
      <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl">
        الشغل
      </h1>
      <p className="mt-2 text-sm text-v2-ink-muted">
        الدفعات الكاملة (pause / resume / cancel) هتيجي في D4. هنا نظرة سريعة على
        الشغال واللي خلص.
      </p>
      {error ? (
        <p className="mt-2 text-sm text-v2-attention">{error}</p>
      ) : null}
      <p className="mt-4 text-sm">
        شغال دلوقتي:{' '}
        <strong>{arDigits(summary?.running_count ?? 0)}</strong>
      </p>
      <h2 className="mt-6 font-[family-name:var(--font-v2-display-ar)] text-lg">
        آخر اللي خلص
      </h2>
      {!summary ? (
        <p className="mt-2 text-sm text-v2-ink-muted">بيحمّل…</p>
      ) : summary.recent_jobs.length === 0 ? (
        <p className="mt-2 text-sm text-v2-ink-muted">مفيش.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {summary.recent_jobs.map((j) => (
            <li
              key={j.id}
              className="rounded-v2-row border border-v2-rule bg-v2-card px-3 py-2 text-sm"
            >
              <div className="font-medium">{j.label}</div>
              <div className="text-xs text-v2-ink-muted">
                {j.status}
                {j.cost_usd ? ` · $${j.cost_usd.toFixed(2)}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm">
        <Link href="/v2-admin/library" className="text-v2-action">
          شغل المكتبة من صفحة الحلقة
        </Link>
      </p>
    </div>
  );
}
