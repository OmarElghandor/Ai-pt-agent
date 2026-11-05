'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { NoteCard } from '@/components/v2/NoteCard';
import { talkHrefForTopic } from '@/lib/v2/convo/topics/suggestion';
import type { TopicRow, TopicsListResult } from '@/lib/v2/convo/topics/types';

function TopicRowView({ topic }: { topic: TopicRow }) {
  const body = (
    <>
      <span className="text-lg" aria-hidden>
        {topic.status_glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block font-[family-name:var(--font-v2-target)] text-base font-semibold text-v2-primary"
          dir="ltr"
        >
          {topic.title_tl}
        </span>
        <span className="block font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {topic.title_ar}
        </span>
      </span>
      {topic.unlocked ? (
        <Icon name="arrow_back" size={20} className="text-v2-action" />
      ) : (
        <Icon name="lock" size={20} className="text-v2-ink-muted" />
      )}
    </>
  );

  if (!topic.unlocked) {
    return (
      <li className="flex min-h-14 items-center gap-3 rounded-v2-row bg-v2-paper-deep/60 px-4 py-3 opacity-70">
        {body}
      </li>
    );
  }

  return (
    <li>
      <Link
        href={talkHrefForTopic(topic)}
        className="flex min-h-14 items-center gap-3 rounded-v2-row bg-v2-card px-4 py-3 shadow-[var(--shadow-v2-soft)]"
      >
        {body}
      </Link>
    </li>
  );
}

export function LearnTopicsScreen() {
  const [listing, setListing] = useState<TopicsListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState('');
  const [ack, setAck] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/convo/topics');
        if (!res.ok) throw new Error(`topics ${res.status}`);
        const data = (await res.json()) as TopicsListResult;
        if (!cancelled) setListing(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitNew = async () => {
    const q = query.trim();
    if (!q || saving) return;
    setSaving(true);
    setAck(null);
    try {
      const res = await fetch('/api/v2/convo/topic-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query_eg: q, mode: 'learn' }),
      });
      if (!res.ok) throw new Error(`request ${res.status}`);
      const data = (await res.json()) as { ack_eg?: string };
      setAck(data.ack_eg ?? 'سجّلنا طلبك وهنجهّزه قريب 🙏');
      setQuery('');
      setShowNew(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        مش قادرين نحمّل المواضيع دلوقتي.
      </p>
    );
  }

  if (!listing) {
    return (
      <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        بنجهّز المواضيع…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-8 pt-4">
      <header className="flex items-center gap-3">
        <Link
          href="/talk"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-card text-v2-primary shadow-[var(--shadow-v2-soft)]"
          aria-label="رجوع"
        >
          <Icon name="arrow_forward" size={24} />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl font-bold text-v2-primary">
            اتعلّم
          </h1>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            افهم موضوع خطوة بخطوة
          </p>
        </div>
      </header>

      {ack ? (
        <NoteCard className="self-stretch">
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
            {ack}
          </p>
        </NoteCard>
      ) : null}

      {listing.themes.map((theme) => (
        <section key={theme.id} className="flex flex-col gap-3">
          <h2 className="flex items-baseline justify-between gap-2">
            <span
              className="font-[family-name:var(--font-v2-target)] text-sm font-semibold text-v2-primary"
              dir="ltr"
            >
              {theme.title_tl}
            </span>
            <span className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
              {theme.title_ar}
            </span>
          </h2>
          <ul className="flex flex-col gap-2">
            {theme.topics.map((topic) => (
              <TopicRowView key={topic.id} topic={topic} />
            ))}
          </ul>
        </section>
      ))}

      <div className="flex flex-col gap-2">
        {!showNew ? (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="flex min-h-14 items-center gap-3 rounded-v2-row bg-v2-card px-4 py-3 text-start shadow-[var(--shadow-v2-soft)] ring-1 ring-v2-action/30"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-[family-name:var(--font-v2-display-ar)] text-base font-semibold text-v2-primary">
                موضوع جديد ✍️
              </span>
              <span className="block font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                اطلب موضوع لسه مش موجود
              </span>
            </span>
          </button>
        ) : (
          <div className="rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]">
            <label className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-primary">
              عايز تتعلم إيه؟
              <textarea
                className="mt-2 min-h-20 w-full rounded-v2-row border border-v2-line/50 bg-v2-paper px-3 py-2 font-[family-name:var(--font-v2-arabic)] text-v2-ink"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="مثلاً: عايز أتعلم أعمل حساب في البنك"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={saving || !query.trim()}
                onClick={() => void submitNew()}
                className="rounded-v2-chip bg-v2-action px-4 py-2 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-white disabled:opacity-40"
              >
                ابعت
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNew(false);
                  setQuery('');
                }}
                className="rounded-v2-chip border border-v2-line px-4 py-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-primary"
              >
                رجوع
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
