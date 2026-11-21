'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  arDigits,
  useAdminShell,
} from '@/components/v2/admin/adminShellContext';
import type { DashboardSummary } from '@/lib/v2/admin/dashboardSummary';

const emptySummary = (): DashboardSummary => ({
  lessons: {
    published: 0,
    ready_for_review: 0,
    failed: 0,
    not_generated: 0,
  },
  cards: { days_ready: 0, themed_decks: 0, learner_waiting: 0 },
  images: { ready: 0, missing: 0, flagged: 0, blocked: 0 },
  today: {
    claude_usd: 0,
    images_usd: 0,
    tts_usd: 0,
    total_usd: 0,
    image_cap_limit: null,
    image_cap_used: 0,
    image_cap_left: null,
  },
  needs_you: [],
  recent_jobs: [],
  running_count: 0,
});

export function AdminHome() {
  const { search, applySummaryChrome, openDrawer } = useAdminShell();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/v2/admin/dashboard/summary');
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as DashboardSummary;
        if (cancelled) return;
        setSummary(data);
        applySummaryChrome(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setSummary(emptySummary());
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [applySummaryChrome]);

  const q = search.trim().toLowerCase();
  const needs = useMemo(() => {
    const items = summary?.needs_you ?? [];
    if (!q) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.href.toLowerCase().includes(q) ||
        i.kind.includes(q),
    );
  }, [summary, q]);

  if (loading && !summary) {
    return <p className="text-sm text-v2-ink-muted">بيحمّل…</p>;
  }

  const s = summary ?? emptySummary();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header>
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl text-v2-ink sm:text-3xl">
          الرئيسية
        </h1>
        <p className="mt-1 text-sm text-v2-ink-muted">
          نظرة سريعة على الدروس والكروت والصور والشغل.
        </p>
        {error ? (
          <p className="mt-2 text-sm text-v2-attention" role="status">
            {error}
          </p>
        ) : null}
      </header>

      <section
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="عدادات"
      >
        <CountCard
          title="الدروس"
          href="/v2-admin/lessons"
          lines={[
            { label: 'منشور', value: s.lessons.published },
            { label: 'محتاج مراجعة', value: s.lessons.ready_for_review },
            { label: 'فشل', value: s.lessons.failed },
            { label: 'ما اتولدش', value: s.lessons.not_generated },
          ]}
        />
        <CountCard
          title="الكروت"
          href="/v2-admin/cards"
          lines={[
            { label: 'أيام جاهزة', value: s.cards.days_ready },
            { label: 'ديك مواضيع', value: s.cards.themed_decks },
            { label: 'من المتعلمين', value: s.cards.learner_waiting },
          ]}
        />
        <CountCard
          title="الصور"
          href="/v2-admin/images"
          lines={[
            { label: 'جاهز', value: s.images.ready },
            { label: 'ناقص', value: s.images.missing },
            { label: 'معلّم', value: s.images.flagged },
            { label: 'مقفول', value: s.images.blocked },
          ]}
        />
        <CountCard
          title="النهارده"
          href="/v2-admin/cost"
          lines={[
            {
              label: 'Claude',
              valueLabel: `$${s.today.claude_usd.toFixed(2)}`,
            },
            {
              label: 'صور',
              valueLabel: `$${s.today.images_usd.toFixed(2)}`,
            },
            {
              label: 'TTS',
              valueLabel: `$${s.today.tts_usd.toFixed(2)}`,
            },
            {
              label: 'حد الصور',
              valueLabel:
                s.today.image_cap_left == null
                  ? '—'
                  : arDigits(s.today.image_cap_left),
            },
          ]}
        />
      </section>

      <section aria-labelledby="needs-you-heading">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2
            id="needs-you-heading"
            className="font-[family-name:var(--font-v2-display-ar)] text-xl"
          >
            محتاج منك
          </h2>
          <span className="text-xs text-v2-ink-muted">
            {arDigits(needs.length)}
          </span>
        </div>
        {needs.length === 0 ? (
          <p className="text-sm text-v2-ink-muted">مفيش حاجة مستنياك دلوقتي.</p>
        ) : (
          <ul className="divide-y divide-v2-rule rounded-v2-row border border-v2-rule bg-v2-card">
            {needs.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-start text-sm"
                  onClick={() =>
                    openDrawer({
                      title: item.label,
                      href: item.href,
                      body: (
                        <p className="text-sm text-v2-ink-muted">
                          {item.kind} · افتح الصفحة للتفاصيل والإجراء.
                        </p>
                      ),
                    })
                  }
                >
                  {item.label}
                </button>
                <Link
                  href={item.href}
                  className="rounded-v2-chip bg-v2-action px-3 py-1.5 text-sm text-white"
                >
                  {item.action_label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-jobs-heading">
        <h2
          id="recent-jobs-heading"
          className="mb-3 font-[family-name:var(--font-v2-display-ar)] text-xl"
        >
          آخر ١٠ شغل خلص
        </h2>
        {s.recent_jobs.length === 0 ? (
          <p className="text-sm text-v2-ink-muted">لسه مفيش.</p>
        ) : (
          <ul className="space-y-2">
            {s.recent_jobs.map((j) => (
              <li
                key={j.id}
                className="rounded-v2-row border border-v2-rule bg-v2-card px-3 py-2 text-sm"
              >
                <div className="font-medium">{j.label}</div>
                <div className="text-xs text-v2-ink-muted">
                  {j.source} · {j.status}
                  {j.cost_usd ? ` · $${j.cost_usd.toFixed(2)}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CountCard({
  title,
  href,
  lines,
}: {
  title: string;
  href: string;
  lines: Array<{ label: string; value?: number; valueLabel?: string }>;
}) {
  return (
    <Link
      href={href}
      className="rounded-v2-row border border-v2-rule bg-v2-card p-4 transition-colors hover:border-v2-primary/40"
    >
      <h3 className="font-[family-name:var(--font-v2-display-ar)] text-lg text-v2-ink">
        {title}
      </h3>
      <dl className="mt-3 space-y-1.5">
        {lines.map((line) => (
          <div
            key={line.label}
            className="flex items-baseline justify-between gap-2 text-sm"
          >
            <dt className="text-v2-ink-muted">{line.label}</dt>
            <dd className="font-medium tabular-nums text-v2-ink">
              {line.valueLabel ?? arDigits(line.value ?? 0)}
            </dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}
