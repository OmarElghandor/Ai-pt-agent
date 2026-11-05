'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { OPEN_TOPIC_ID } from '@/lib/v2/convo/topics/openTopic';

type FreeTopicRow = {
  id: string;
  title_tl: string;
  title_ar: string;
  character_id: string;
  can_resume?: boolean;
};

type Props = {
  /** Back link; practice picker uses /talk. */
  backHref?: string;
  title?: string;
  subtitle?: string;
};

export function FreeTopicsScreen({
  backHref = '/talk',
  title = 'اتكلّم',
  subtitle = 'اختار موضوع أو اتكلم في أي حاجة',
}: Props) {
  const [topics, setTopics] = useState<FreeTopicRow[] | null>(null);
  const [openCanResume, setOpenCanResume] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/convo/free-topics');
        if (!res.ok) throw new Error(`free-topics ${res.status}`);
        const data = (await res.json()) as {
          topics: FreeTopicRow[];
          open_can_resume?: boolean;
        };
        if (!cancelled) {
          setTopics(data.topics);
          setOpenCanResume(Boolean(data.open_can_resume));
        }
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
          href={backHref}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-card text-v2-primary shadow-[var(--shadow-v2-soft)]"
          aria-label="رجوع"
        >
          <Icon name="arrow_forward" size={24} />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl font-bold text-v2-primary">
            {title}
          </h1>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            {subtitle}
          </p>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        <li>
          <Link
            href={`/talk/free/${OPEN_TOPIC_ID}`}
            className="flex min-h-14 items-center gap-3 rounded-v2-row bg-v2-card px-4 py-3 shadow-[var(--shadow-v2-soft)] ring-1 ring-v2-action/30"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-v2-action/15 text-lg"
              aria-hidden
            >
              💬
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-[family-name:var(--font-v2-display-ar)] text-base font-semibold text-v2-primary">
                أي حاجة 💬
              </span>
              <span className="block font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                اتكلم في أي موضوع إنت عايزه
              </span>
            </span>
            {openCanResume ? (
              <span className="rounded-v2-chip bg-v2-action/15 px-2 py-0.5 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-action">
                كمّل
              </span>
            ) : (
              <Icon name="arrow_back" size={20} className="text-v2-action" />
            )}
          </Link>
        </li>

        {topics.map((topic) => {
          const avatar = topic.character_id.slice(0, 1).toUpperCase();
          return (
            <li key={topic.id}>
              <Link
                href={`/talk/free/${encodeURIComponent(topic.id)}`}
                className="flex min-h-14 items-center gap-3 rounded-v2-row bg-v2-card px-4 py-3 shadow-[var(--shadow-v2-soft)]"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-v2-primary/10 font-[family-name:var(--font-v2-target)] text-sm font-bold text-v2-primary"
                  aria-label={topic.character_id}
                >
                  {avatar}
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
                {topic.can_resume ? (
                  <span className="rounded-v2-chip bg-v2-action/15 px-2 py-0.5 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-action">
                    كمّل
                  </span>
                ) : (
                  <Icon name="arrow_back" size={20} className="text-v2-action" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
