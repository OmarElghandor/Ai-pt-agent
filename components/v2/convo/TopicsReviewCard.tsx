'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import {
  talkHrefForTopic,
  topicReviewSuggestionEg,
} from '@/lib/v2/convo/topics/suggestion';
import type { TopicRow, TopicsListResult } from '@/lib/v2/convo/topics/types';

export function TopicsReviewCard() {
  const [suggestion, setSuggestion] = useState<TopicRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/convo/topics');
        if (!res.ok) return;
        const data = (await res.json()) as TopicsListResult;
        if (!cancelled) setSuggestion(data.suggestion);
      } catch {
        /* home stays usable without the card */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!suggestion) return null;

  const line = topicReviewSuggestionEg(suggestion);

  return (
    <section className="overflow-hidden rounded-v2-card bg-v2-primary p-4 text-white shadow-[var(--shadow-v2-soft)]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold">
          <span aria-hidden>🟡</span>
          محتاجة مراجعة
        </span>
        <Link
          href="/topics"
          className="font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-white/80 underline-offset-2 hover:underline"
        >
          كل المواضيع
        </Link>
      </div>
      <h2 className="mb-1 font-[family-name:var(--font-v2-display-ar)] text-xl font-bold leading-8">
        {line}
      </h2>
      <p
        className="mb-4 font-[family-name:var(--font-v2-target)] text-sm text-white/80"
        dir="ltr"
      >
        {suggestion.title_tl}
      </p>
      <PrimaryButton href={talkHrefForTopic(suggestion)} className="w-full">
        <span className="inline-flex items-center gap-2">
          اتكلم
          <Icon name="chat" size={20} />
        </span>
      </PrimaryButton>
    </section>
  );
}
