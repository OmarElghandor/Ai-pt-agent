'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type ReviewItem = {
  day: number;
  target_lang: string;
  version: number;
  status: string;
  kind: 'needs_review' | 'auto_published';
  fatal_issues: Array<{ rule?: string; severity?: string; message?: string }>;
  brazilian: boolean;
  auto_published: boolean;
  auto_published_checked: boolean;
  prepare_error_eg?: string;
};

export default function V2AdminReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/v2/admin/prepare/review');
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { items: ReviewItem[] };
      setItems(body.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (
    action: 'mark_checked' | 'regenerate' | 'unpublish',
    item: ReviewItem,
  ) => {
    const key = `${action}:${item.day}`;
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch('/api/v2/admin/prepare/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          day: item.day,
          version: item.version,
        }),
      });
      const body = (await res.json()) as { error?: string; job_id?: string };
      if (!res.ok) {
        setError(body.error ?? `action ${res.status}`);
        return;
      }
      setMessage(
        action === 'regenerate'
          ? `Regenerate queued (${body.job_id})`
          : `${action} ok for day ${item.day}`,
      );
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm text-v2-muted">
          <Link href="/v2-admin">← v2-admin</Link>
        </p>
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl text-v2-ink">
          طابور المراجعة
        </h1>
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          needs_review + auto_published لسه متتشافوش
        </p>
      </header>

      {error ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded border border-v2-rule bg-v2-card px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-v2-ink-muted">مفيش أيام في الطابور.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.day}-${item.version}`}
              className="rounded-v2-row border border-v2-rule bg-v2-card px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-semibold">Day {item.day}</span>
                  <span className="ms-2 text-xs text-v2-ink-muted" dir="ltr">
                    v{item.version} · {item.status} · {item.kind}
                  </span>
                </div>
                {item.brazilian ? (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                    brazilian
                  </span>
                ) : null}
              </div>
              {item.prepare_error_eg ? (
                <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
                  {item.prepare_error_eg}
                </p>
              ) : null}
              {item.fatal_issues.length > 0 ? (
                <ul className="mt-2 list-disc ps-5 text-xs text-v2-ink-muted" dir="ltr">
                  {item.fatal_issues.slice(0, 6).map((iss, i) => (
                    <li key={i}>
                      {iss.rule}: {iss.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/v2-admin/lessons/${item.day}`}
                  className="rounded-v2-chip border border-v2-rule px-3 py-1 text-xs"
                >
                  Lesson preview
                </Link>
                <Link
                  href={`/talk/pt-PT.day-${item.day}`}
                  className="rounded-v2-chip border border-v2-rule px-3 py-1 text-xs"
                >
                  Convo preview
                </Link>
                {item.kind === 'auto_published' ? (
                  <button
                    type="button"
                    disabled={busy === `mark_checked:${item.day}`}
                    className="rounded-v2-chip bg-v2-action px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                    onClick={() => void act('mark_checked', item)}
                  >
                    Mark checked
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy === `regenerate:${item.day}`}
                  className="rounded-v2-chip border border-v2-rule px-3 py-1 text-xs disabled:opacity-40"
                  onClick={() => void act('regenerate', item)}
                >
                  Regenerate
                </button>
                {item.status === 'published' ? (
                  <button
                    type="button"
                    disabled={busy === `unpublish:${item.day}`}
                    className="rounded-v2-chip border border-amber-300 px-3 py-1 text-xs text-amber-900 disabled:opacity-40"
                    onClick={() => void act('unpublish', item)}
                  >
                    Unpublish
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
