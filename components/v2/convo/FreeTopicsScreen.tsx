'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/v2/Icon';

type FreeTopicRow = {
  id: string;
  title_tl: string;
  title_ar: string;
  character_id: string;
};

export function FreeTopicsScreen() {
  const [topics, setTopics] = useState<FreeTopicRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/convo/free-topics');
        if (!res.ok) throw new Error(`free-topics ${res.status}`);
        const data = (await res.json()) as { topics: FreeTopicRow[] };
        if (!cancelled) setTopics(data.topics);
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
        مش قادرين نحمّل الكلام الحر دلوقتي.
      </p>
    );
  }

  if (!topics) {
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
          href="/topics"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-card text-v2-primary shadow-[var(--shadow-v2-soft)]"
          aria-label="رجوع"
        >
          <Icon name="arrow_forward" size={22} />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl font-bold text-v2-primary">
            كلام حر
          </h1>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            اختار موضوع وابدأ محادثة
          </p>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        {topics.map((topic) => (
          <li key={topic.id}>
            <Link
              href={`/talk/free/${encodeURIComponent(topic.id)}`}
              className="flex min-h-14 items-center gap-3 rounded-v2-row bg-v2-card px-4 py-3 shadow-[var(--shadow-v2-soft)]"
            >
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
              <Icon name="arrow_back" size={20} className="text-v2-action" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
