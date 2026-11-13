'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { ConvoResultStats } from '@/lib/v2/convo/result';
import { postProgressEvent } from '@/lib/v2/progress/clientEvent';

type Props = {
  day: number | null;
  stats: ConvoResultStats;
  /** Pack bridge line into free chat (09 §4.4 / T7.5). */
  bridgeTl?: string;
  freeTopicId?: string | null;
  learnerTurns?: number;
};

/** End-of-lesson result card (09 §4.4): بتقول / بتفهم / extra. */
export function ConvoResultCard({
  day,
  stats,
  bridgeTl,
  freeTopicId,
  learnerTurns = 5,
}: Props) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    postProgressEvent({
      kind: 'convo_finished',
      day: day ?? undefined,
      said: stats.said.length,
      understood: stats.understood.length,
      learner_turns: learnerTurns,
    });
  }, [day, stats.said.length, stats.understood.length, learnerTurns]);

  return (
    <div className="mt-4 rounded-v2-card border border-v2-line bg-v2-card px-4 py-5 shadow-[var(--shadow-v2-soft)]">
      <p className="text-center font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-v2-ink">
        خلّصت المحادثة
      </p>
      <p className="mt-2 text-center font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-primary">
        {stats.headline_eg}
      </p>

      {stats.said.length > 0 ? (
        <div className="mt-4">
          <p className="font-[family-name:var(--font-v2-arabic)] text-[12px] font-semibold text-v2-primary">
            بتقولها
          </p>
          <ul className="mt-1.5 flex flex-wrap justify-end gap-1.5">
            {stats.said.map((item) => (
              <li
                key={item.item_id}
                dir="ltr"
                className="rounded-v2-pill bg-v2-primary/10 px-2.5 py-1 font-[family-name:var(--font-v2-target)] text-[12px] font-semibold text-v2-primary"
              >
                {item.tl}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stats.understood.length > 0 ? (
        <div className="mt-3">
          <p className="font-[family-name:var(--font-v2-arabic)] text-[12px] font-semibold text-v2-ink">
            بتفهمها، هتيجي كارت بكرة
          </p>
          <ul className="mt-1.5 flex flex-wrap justify-end gap-1.5">
            {stats.understood.map((item) => (
              <li
                key={item.item_id}
                dir="ltr"
                className="rounded-v2-pill bg-v2-paper-deep px-2.5 py-1 font-[family-name:var(--font-v2-target)] text-[12px] text-v2-ink"
              >
                {item.tl}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stats.extra.length > 0 ? (
        <div className="mt-3">
          <p className="font-[family-name:var(--font-v2-arabic)] text-[12px] font-semibold text-v2-ink-muted">
            كلمات زيادة سمعتها
          </p>
          <ul className="mt-1.5 flex flex-wrap justify-end gap-1.5">
            {stats.extra.map((item) => (
              <li
                key={item.item_id}
                dir="ltr"
                className="rounded-v2-pill border border-v2-line px-2.5 py-1 font-[family-name:var(--font-v2-target)] text-[12px] text-v2-ink-muted"
              >
                {item.tl}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bridgeTl || freeTopicId ? (
        <div className="mt-5 rounded-v2-row bg-v2-paper-deep/80 px-3 py-3 text-center">
          {bridgeTl ? (
            <p
              dir="ltr"
              className="font-[family-name:var(--font-v2-target)] text-sm text-v2-primary"
            >
              {bridgeTl}
            </p>
          ) : null}
          {freeTopicId ? (
            <Link
              href={`/talk/free/${encodeURIComponent(freeTopicId)}`}
              className="mt-2 inline-block font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-action"
            >
              كمّل كلام حر
            </Link>
          ) : null}
        </div>
      ) : null}

      {day ? (
        <div className="mt-5 text-center">
          <Link
            href={`/day/${day}`}
            className="inline-block font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-action"
          >
            رجوع لليوم
          </Link>
        </div>
      ) : null}
    </div>
  );
}
