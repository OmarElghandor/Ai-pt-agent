'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TopicsReviewCard } from '@/components/v2/convo/TopicsReviewCard';
import { Icon } from '@/components/v2/Icon';
import { readDonePages } from '@/components/v2/player/session';
import type { PathDayRow } from '@/lib/v2/path';

type NodeStatus = 'done' | 'current' | 'available' | 'locked';

const DAY_ICONS = [
  'waving_hand',
  'local_cafe',
  'shopping_basket',
  'tram',
  'medical_services',
  'signpost',
  'flag',
  'trophy',
] as const;

function dayLooksDone(day: number): boolean {
  const done = readDonePages(day);
  return done.includes('day_questions') || done.includes('practice');
}

function padDay(n: number): string {
  return String(n).padStart(2, '0');
}

function roadPath(height: number): string {
  // S-curve centered at x=195 for a 390-wide viewBox; scales with node count height.
  const mid = 195;
  const amp = 95;
  const segments = Math.max(4, Math.round(height / 210));
  let d = `M ${mid} 24`;
  for (let i = 0; i < segments; i++) {
    const y0 = 24 + (i * height) / segments;
    const y1 = 24 + ((i + 0.5) * height) / segments;
    const y2 = 24 + ((i + 1) * height) / segments;
    const side = i % 2 === 0 ? mid + amp : mid - amp;
    d += ` C ${side} ${y0 + 40}, ${side} ${y1}, ${mid} ${y2}`;
  }
  return d;
}

export function PathRoadmap({
  week,
  days,
  currentDay: ssrCurrentDay,
}: {
  week: number;
  days: PathDayRow[];
  currentDay: number | null;
}) {
  const [doneDays, setDoneDays] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const next = new Set<number>();
    for (const row of days) {
      if (row.status !== 'locked' && dayLooksDone(row.day)) next.add(row.day);
    }
    setDoneDays(next);
  }, [days]);

  const nodes = useMemo(() => {
    let markedCurrent = false;
    return days.map((row) => {
      if (row.status === 'locked' || !row.href) {
        return { row, status: 'locked' as NodeStatus };
      }
      if (doneDays.has(row.day)) {
        return { row, status: 'done' as NodeStatus };
      }
      if (!markedCurrent) {
        markedCurrent = true;
        return { row, status: 'current' as NodeStatus };
      }
      return { row, status: 'available' as NodeStatus };
    });
  }, [days, doneDays]);

  const current =
    nodes.find((n) => n.status === 'current')?.row ??
    days.find((d) => d.day === ssrCurrentDay) ??
    days.find((d) => d.status !== 'locked') ??
    null;

  const unlocked = days.filter((d) => d.status !== 'locked');
  const doneCount = nodes.filter((n) => n.status === 'done').length;
  const weekProgress =
    unlocked.length === 0
      ? 0
      : Math.round(
          ((doneCount + (current && !doneDays.has(current.day) ? 0.4 : 0)) /
            unlocked.length) *
            100,
        );

  const roadHeight = Math.max(640, days.length * 168);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-v2-primary/10 text-v2-primary">
            <Icon name="translate" size={24} />
          </div>
          <div className="flex flex-col">
            <span className="font-[family-name:var(--font-v2-target)] text-lg font-semibold leading-none text-v2-primary">
              Langify
            </span>
            <span className="font-[family-name:var(--font-v2-ui)] text-[10px] font-medium text-v2-ink-muted">
              Al Masar
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-v2-paper-deep px-2 py-1 font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold text-v2-primary">
          <Icon name="explore" size={20} className="text-v2-action" />
          المستوى الأول · A1
        </span>
        <h1 className="font-[family-name:var(--font-v2-arabic)] text-2xl font-bold tracking-tight text-v2-primary">
          خريطة رحلتك في لشبونة
        </h1>
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm leading-relaxed text-v2-ink-muted">
          مسار متدرج خطوة بخطوة — الأسبوع {week} من أول يوم لحد الطلاقة في شوارع
          لشبونة.
        </p>
      </div>

      {current ? (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-v2-action-tint text-v2-action">
                <Icon name="location_on" size={20} />
              </div>
              <div className="flex flex-col">
                <span className="font-[family-name:var(--font-v2-arabic)] text-[10px] font-medium text-v2-ink-muted">
                  المحطة الحالية
                </span>
                <span className="font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-v2-primary">
                  اليوم {current.day}
                  {current.situation_tl ? (
                    <span
                      className="font-[family-name:var(--font-v2-target)] font-semibold"
                      dir="ltr"
                    >
                      {' '}
                      · {current.situation_tl}
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
            <span className="shrink-0 font-[family-name:var(--font-v2-ui)] text-xs font-bold text-v2-action">
              {weekProgress}٪ إنجاز
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-v2-paper-deep">
            <div
              className="h-full rounded-full bg-v2-action transition-all duration-500"
              style={{ width: `${Math.min(100, weekProgress)}%` }}
            />
          </div>
        </div>
      ) : null}

      <TopicsReviewCard />

      <div className="relative w-full overflow-hidden px-1 pb-4">
        <svg
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          fill="none"
          preserveAspectRatio="none"
          viewBox={`0 0 390 ${roadHeight}`}
          aria-hidden
        >
          <path
            d={roadPath(roadHeight - 48)}
            stroke="var(--color-v2-sand, #c9bdaf)"
            strokeLinecap="round"
            strokeWidth="48"
          />
          <path
            d={roadPath(roadHeight - 48)}
            stroke="var(--color-v2-paper-deep, #d9e1d9)"
            strokeLinecap="round"
            strokeWidth="40"
          />
          <path
            d={roadPath(roadHeight - 48)}
            opacity="0.95"
            stroke="var(--color-v2-card, #fbf8f3)"
            strokeDasharray="8 8"
            strokeLinecap="round"
            strokeWidth="3"
          />
        </svg>

        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-col items-center justify-center pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-v2-primary px-3 py-1 text-white shadow-[var(--shadow-v2-soft)]">
              <Icon name="flag" size={20} />
              <span className="font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold tracking-wide">
                البداية · Aeroporto de Lisboa
              </span>
            </span>
          </div>

          {nodes.map(({ row, status }, index) => {
            const cardOnStart = index % 2 === 0;
            const icon = DAY_ICONS[index % DAY_ICONS.length];
            const isCurrent = status === 'current';
            const isLocked = status === 'locked';
            const isDone = status === 'done';

            const card = (
              <div
                className={[
                  'flex w-[58%] flex-col gap-1 rounded-2xl bg-v2-card p-3 shadow-[var(--shadow-v2-soft)]',
                  isCurrent ? 'w-[60%] p-4 shadow-md' : '',
                  isLocked ? 'bg-v2-card/80 opacity-75' : '',
                  isCurrent ? '' : 'active:scale-[0.98]',
                ].join(' ')}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={[
                      'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-v2-paper-deep shadow-sm',
                      isCurrent
                        ? 'h-14 w-14 border-2 border-v2-action/30'
                        : isDone
                          ? 'border-2 border-v2-primary/20'
                          : 'border border-v2-line opacity-80',
                    ].join(' ')}
                  >
                    <Icon
                      name={icon}
                      size={24}
                      className={
                        isLocked
                          ? 'text-v2-ink-muted'
                          : isCurrent
                            ? 'text-v2-action'
                            : 'text-v2-primary'
                      }
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={[
                          'rounded-full px-2 py-0.5 font-[family-name:var(--font-v2-ui)] text-[10px] font-bold',
                          isCurrent
                            ? 'bg-v2-action text-white'
                            : isDone
                              ? 'bg-v2-primary/10 text-v2-primary'
                              : 'bg-v2-paper-deep text-v2-ink-muted',
                        ].join(' ')}
                      >
                        {padDay(index + 1)}
                      </span>
                      {isDone ? (
                        <span className="flex items-center gap-1 text-v2-primary">
                          <Icon name="check_circle" size={20} fill />
                          <span className="font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold">
                            مكتمل
                          </span>
                        </span>
                      ) : isCurrent ? (
                        <span className="inline-flex items-center gap-1 font-[family-name:var(--font-v2-arabic)] text-[10px] font-bold text-v2-action">
                          <span className="h-2 w-2 animate-ping rounded-full bg-v2-action" />
                          الدرس الحالي
                        </span>
                      ) : isLocked ? (
                        <span className="flex items-center gap-1 text-v2-ink-muted">
                          <Icon name="lock" size={20} />
                          <span className="font-[family-name:var(--font-v2-arabic)] text-[10px]">
                            مغلق
                          </span>
                        </span>
                      ) : (
                        <span className="font-[family-name:var(--font-v2-arabic)] text-[10px] font-medium text-v2-ink-muted">
                          متاح
                        </span>
                      )}
                    </div>
                    <h2 className="mt-0.5 truncate font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-v2-primary">
                      {row.title_ar}
                    </h2>
                    <span
                      className={[
                        'truncate font-[family-name:var(--font-v2-target)] text-[10px]',
                        isCurrent ? 'font-medium text-v2-action' : 'text-v2-ink-muted',
                      ].join(' ')}
                      dir="ltr"
                    >
                      {row.situation_tl ?? row.title_tl}
                    </span>
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 font-[family-name:var(--font-v2-arabic)] text-xs leading-normal text-v2-ink-muted">
                  {row.situation_eg}
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-v2-paper-deep">
                  <div
                    className={[
                      'h-full rounded-full',
                      isDone
                        ? 'w-full bg-v2-primary'
                        : isCurrent
                          ? 'w-1/2 bg-v2-action'
                          : 'w-0 bg-v2-ink-muted/30',
                    ].join(' ')}
                  />
                </div>
                {isCurrent && row.href ? (
                  <span className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-full bg-v2-action py-2.5 px-3 font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-white shadow-sm">
                    ابدأ محطات اليوم
                    <Icon name="arrow_back" size={20} />
                  </span>
                ) : null}
              </div>
            );

            const pin = (
              <div
                className={[
                  'relative flex items-center justify-center',
                  isCurrent ? 'h-14 w-14' : 'h-12 w-12',
                ].join(' ')}
              >
                {isCurrent ? (
                  <div className="absolute inset-0 animate-ping rounded-full bg-v2-action/20" />
                ) : null}
                <div
                  className={[
                    'z-10 flex items-center justify-center rounded-full shadow-md',
                    isCurrent
                      ? 'h-12 w-12 bg-v2-action text-white'
                      : isDone
                        ? 'h-10 w-10 bg-v2-primary text-white'
                        : 'h-10 w-10 bg-v2-paper-deep text-v2-ink-muted',
                  ].join(' ')}
                >
                  <Icon name={isLocked ? 'lock' : icon} size={isCurrent ? 24 : 20} />
                </div>
                {isDone ? (
                  <div className="absolute -bottom-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-v2-card text-v2-primary shadow-sm">
                    <Icon name="check" size={20} fill />
                  </div>
                ) : null}
              </div>
            );

            const rowClass = [
              'flex w-full items-center justify-between',
              !cardOnStart ? 'flex-row-reverse' : '',
              isCurrent ? 'items-start pt-1' : '',
              isLocked ? 'opacity-75' : '',
            ].join(' ');

            if (isLocked || !row.href) {
              return (
                <div key={row.day} className={rowClass}>
                  {card}
                  {pin}
                </div>
              );
            }

            return (
              <Link key={row.day} href={row.href} className={rowClass}>
                {card}
                {pin}
              </Link>
            );
          })}

          <div className="flex flex-col items-center justify-center pt-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-v2-primary-strong px-4 py-1.5 text-v2-primary-tint shadow-sm">
              <Icon name="stars" size={20} className="text-v2-note" />
              <span className="font-[family-name:var(--font-v2-arabic)] text-xs font-semibold tracking-wide">
                الهدف: الإتقان الكامل والتحدث بطلاقة
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
