'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
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

export function TopicsScreen() {
  const [listing, setListing] = useState<TopicsListResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          href="/path"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-card text-v2-primary shadow-[var(--shadow-v2-soft)]"
          aria-label="رجوع"
        >
          <Icon name="arrow_forward" size={22} />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl font-bold text-v2-primary">
            محادثات
          </h1>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            مواضيع للتدريب والمراجعة
          </p>
        </div>
      </header>

      <Link
        href="/talk"
        className="flex min-h-14 items-center gap-3 rounded-v2-row bg-v2-card px-4 py-3 shadow-[var(--shadow-v2-soft)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-[family-name:var(--font-v2-display-ar)] text-base font-semibold text-v2-primary">
            محادثة
          </span>
          <span className="block font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            اتكلّم أو اتعلّم
          </span>
        </span>
        <Icon name="arrow_back" size={20} className="text-v2-action" />
      </Link>

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
    </div>
  );
}
