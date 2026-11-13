'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { readDonePages } from '@/components/v2/player/session';
import type { PathDayRow } from '@/lib/v2/path';
import type { LearnerPathDay } from '@/lib/v2/progress/learnerPath';

type NodeStatus = 'done' | 'current' | 'available' | 'locked' | 'bakra';

type PathRoadDay = PathDayRow &
  Partial<Pick<LearnerPathDay, 'learner_status' | 'bakra' | 'practised'>>;

const DAY_ICONS = [
  'waving_hand',
  'local_cafe',
  'local_grocery_store',
  'tram',
  'restaurant',
  'signpost',
  'flag',
  'trophy',
] as const;

function dayLooksDone(day: number): boolean {
  const done = readDonePages(day);
  return done.includes('day_questions') || done.includes('practice');
}

export function PathRoadmap({
  week,
  days,
  currentDay: ssrCurrentDay,
  coverUrl = null,
  deckLeft = null,
  deckTotal = null,
}: {
  week: number;
  days: PathRoadDay[];
  currentDay: number | null;
  coverUrl?: string | null;
  deckLeft?: number | null;
  deckTotal?: number | null;
}) {
  const [doneDays, setDoneDays] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const next = new Set<number>();
    for (const row of days) {
      if (row.learner_status === 'completed') {
        next.add(row.day);
        continue;
      }
      if (row.status !== 'locked' && dayLooksDone(row.day)) next.add(row.day);
    }
    setDoneDays(next);
  }, [days]);

  const nodes = useMemo(() => {
    let markedCurrent = false;
    return days.map((row) => {
      if (row.learner_status === 'completed' || doneDays.has(row.day)) {
        return { row, status: 'done' as NodeStatus };
      }
      if (row.bakra || row.learner_status === 'scheduled') {
        return { row, status: 'bakra' as NodeStatus };
      }
      if (
        row.learner_status === 'locked' ||
        row.status === 'locked' ||
        !row.href
      ) {
        return { row, status: 'locked' as NodeStatus };
      }
      if (
        !markedCurrent &&
        (row.day === ssrCurrentDay ||
          row.learner_status === 'available' ||
          row.learner_status === 'in_progress')
      ) {
        markedCurrent = true;
        return { row, status: 'current' as NodeStatus };
      }
      if (!markedCurrent) {
        markedCurrent = true;
        return { row, status: 'current' as NodeStatus };
      }
      return { row, status: 'available' as NodeStatus };
    });
  }, [days, doneDays, ssrCurrentDay]);

  const current =
    nodes.find((n) => n.status === 'current')?.row ??
    days.find((d) => d.day === ssrCurrentDay) ??
    days.find((d) => d.status !== 'locked') ??
    null;

  const unlocked = days.filter((d) => d.status !== 'locked');
  const doneCount = nodes.filter((n) => n.status === 'done').length;
  const currentIndex = current
    ? days.findIndex((d) => d.day === current.day) + 1
    : doneCount;
  const weekProgress =
    unlocked.length === 0
      ? 0
      : Math.round(
          ((doneCount + (current && !doneDays.has(current.day) ? 0.4 : 0)) /
            unlocked.length) *
            100,
        );

  const cardsLabel =
    deckTotal != null && deckTotal > 0
      ? deckLeft === 0
        ? 'خلصت النهارده'
        : `${deckLeft ?? deckTotal} بطاقة جاهزة`
      : 'مراجعة سريعة';

  const roadHeight = Math.max(520, days.length * 110 + 80);

  return (
    <div className="relative flex flex-col">
      {/* Atmospheric mint glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -start-1/4 top-0 size-80 rounded-full bg-v2-primary-fixed/30 blur-3xl"
        style={{ opacity: 0.15 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -end-1/4 top-1/3 size-80 rounded-full bg-v2-secondary-fixed/25 blur-3xl"
        style={{ opacity: 0.12 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-1/4 start-0 size-72 rounded-full bg-v2-primary-tint/40 blur-3xl"
        style={{ opacity: 0.1 }}
      />

      <div className="relative z-10 flex flex-col gap-2">
        {/* Hero: continue current learning */}
        {current ? (
          <section className="-mx-4 px-4 pt-4">
            <div className="overflow-hidden rounded-2xl border border-v2-line/50 bg-v2-card shadow-sm transition-shadow hover:shadow-md">
              <div className="relative h-44 w-full overflow-hidden bg-v2-primary-tint">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-v2-primary-fixed via-v2-primary-tint to-v2-action-tint" />
                )}
                <div className="absolute inset-0 flex items-end bg-gradient-to-t from-v2-hero-scrim/80 via-transparent to-transparent p-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-v2-primary px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[11px] font-bold text-white shadow-sm">
                      مستوى A1
                    </span>
                    <span className="rounded-full bg-v2-card/90 px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[11px] font-medium text-v2-ink backdrop-blur-sm">
                      {weekProgress}٪ مكتمل
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3 p-4">
                <div>
                  <span className="font-[family-name:var(--font-v2-arabic)] text-xs font-medium text-v2-success">
                    متابعة التعلم الحالي
                  </span>
                  <h2 className="mt-0.5 font-[family-name:var(--font-v2-arabic)] text-lg font-bold tracking-tight text-v2-ink">
                    <span
                      className="inline-block font-[family-name:var(--font-v2-target)] font-semibold"
                      dir="ltr"
                    >
                      Dia {current.day}:{' '}
                      {current.situation_tl ?? current.title_tl}
                    </span>
                  </h2>
                  <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-xs leading-relaxed text-v2-ink-muted">
                    {current.situation_eg || current.title_ar}
                  </p>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-v2-primary-tint">
                  <div
                    className="h-full rounded-full bg-v2-primary transition-all duration-700"
                    style={{ width: `${Math.min(100, weekProgress)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="flex items-center gap-1 font-[family-name:var(--font-v2-arabic)] text-xs font-medium text-v2-sand">
                    <Icon name="schedule" size={20} variant="outlined" />
                    محطة اليوم
                  </span>
                  {current.href ? (
                    <Link
                      href={current.href}
                      className="flex h-9 items-center gap-2 rounded-xl bg-v2-primary px-5 text-sm font-semibold text-white shadow-sm transition-colors active:scale-95 hover:bg-v2-primary-strong"
                    >
                      <span className="font-[family-name:var(--font-v2-arabic)]">
                        ابدأ التمرين الآن
                      </span>
                      <Icon name="play_arrow" size={20} variant="outlined" fill />
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* Quick practice shortcuts */}
        <section className="-mx-4 px-4 py-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-v2-ink">
              تمارين سريعة ومراجعة
            </h3>
            <Link
              href="/cards"
              className="font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-primary hover:underline"
            >
              الكل
            </Link>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link
              href="/cards"
              className="flex shrink-0 items-center gap-2 rounded-xl border border-v2-line/40 bg-v2-primary-tint px-3.5 py-2 transition-colors hover:bg-v2-paper-deep"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-v2-card text-sm shadow-sm">
                🗂️
              </span>
              <div>
                <p className="font-[family-name:var(--font-v2-arabic)] text-xs font-bold text-v2-ink">
                  كروت المراجعة
                </p>
                <p className="font-[family-name:var(--font-v2-arabic)] text-[10px] text-v2-ink-muted">
                  {cardsLabel}
                </p>
              </div>
            </Link>
            <Link
              href="/talk"
              className="flex shrink-0 items-center gap-2 rounded-xl border border-v2-line/40 bg-v2-primary-tint px-3.5 py-2 transition-colors hover:bg-v2-paper-deep"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-v2-card text-sm shadow-sm">
                🎙️
              </span>
              <div>
                <p className="font-[family-name:var(--font-v2-arabic)] text-xs font-bold text-v2-ink">
                  حوار صوتي محاكي
                </p>
                <p className="font-[family-name:var(--font-v2-arabic)] text-[10px] text-v2-ink-muted">
                  تمارين النطق المباشر
                </p>
              </div>
            </Link>
            <Link
              href="/topics"
              className="flex shrink-0 items-center gap-2 rounded-xl border border-v2-line/40 bg-v2-primary-tint px-3.5 py-2 transition-colors hover:bg-v2-paper-deep"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-v2-card text-sm shadow-sm">
                ⚡
              </span>
              <div>
                <p className="font-[family-name:var(--font-v2-arabic)] text-xs font-bold text-v2-ink">
                  تحدي المفردات
                </p>
                <p className="font-[family-name:var(--font-v2-arabic)] text-[10px] text-v2-ink-muted">
                  دقيقة واحدة سريعة
                </p>
              </div>
            </Link>
          </div>
        </section>

        {/* Lisbon cultural tip */}
        <section className="-mx-4 px-4 py-2">
          <div className="relative flex items-start gap-3 overflow-hidden rounded-2xl border border-v2-line bg-v2-card p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-v2-primary/10 text-v2-primary">
              <Icon name="lightbulb" size={24} variant="outlined" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-[family-name:var(--font-v2-arabic)] text-[11px] font-bold uppercase tracking-wider text-v2-success">
                  نصيحة لشبونة الثقافية
                </span>
                <span className="size-1 rounded-full bg-v2-sand" />
                <span className="font-[family-name:var(--font-v2-target)] text-[11px] text-v2-ink-muted">
                  Dica Cultural
                </span>
              </div>
              <p className="font-[family-name:var(--font-v2-arabic)] text-xs leading-relaxed text-v2-ink">
                عند دخول المقهى أو السوبرماركت في البرتغال، ابدأ دائماً بـ{' '}
                <span
                  className="inline-block font-[family-name:var(--font-v2-target)] font-semibold text-v2-primary"
                  dir="ltr"
                >
                  &quot;Bom dia&quot;
                </span>{' '}
                أو{' '}
                <span
                  className="inline-block font-[family-name:var(--font-v2-target)] font-semibold text-v2-primary"
                  dir="ltr"
                >
                  &quot;Boa tarde&quot;
                </span>{' '}
                قبل طلب أي شيء. يُعد ذلك أساسياً في اللباقة اليومية.
              </p>
            </div>
          </div>
        </section>

        {/* Serpentine roadmap */}
        <section className="-mx-4 px-4 pt-4 pb-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-[family-name:var(--font-v2-arabic)] text-base font-bold text-v2-ink">
                خريطة مسار التعلم
              </h3>
              <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
                الوحدة {week}: البدايات في البرتغال (Lisboa)
              </p>
            </div>
            <span className="shrink-0 rounded-lg border border-v2-line bg-v2-card px-2.5 py-1 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-primary">
              محطة {Math.max(1, currentIndex)} من {days.length}
            </span>
          </div>

          <div className="relative flex w-full flex-col items-center py-6">
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full stroke-current"
              fill="none"
              viewBox={`0 0 340 ${roadHeight}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                d={serpentinePath(roadHeight)}
                stroke="var(--color-v2-paper-deep)"
                strokeLinecap="round"
                strokeWidth="12"
              />
              <path
                d={serpentinePath(roadHeight)}
                opacity="0.6"
                stroke="var(--color-v2-primary-strong)"
                strokeDasharray="6 6"
                strokeLinecap="round"
                strokeWidth="3"
              />
            </svg>

            <div className="relative z-10 flex w-full flex-col gap-12">
              {nodes.map(({ row, status }, index) => {
                const onStart = index % 2 === 0;
                const icon = DAY_ICONS[index % DAY_ICONS.length];
                const isCurrent = status === 'current';
                const isLocked = status === 'locked' || status === 'bakra';
                const isDone = status === 'done';
                const isBakra = status === 'bakra';
                const isCheckpoint =
                  row.is_test ||
                  (row.is_story && index === days.length - 1) ||
                  index === days.length - 1;

                if (isCheckpoint && isLocked && index === days.length - 1) {
                  return (
                    <div
                      key={row.day}
                      className="flex items-center justify-center pt-2 opacity-70"
                    >
                      <div className="flex flex-col items-center gap-1.5 text-center">
                        <div className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-v2-sand/50 bg-v2-paper-deep text-v2-sand shadow-sm">
                          <Icon name="trophy" size={24} variant="outlined" />
                        </div>
                        <p className="font-[family-name:var(--font-v2-arabic)] text-xs font-bold text-v2-ink">
                          {row.is_test
                            ? `اختبار نهاية الوحدة ${week}`
                            : row.title_ar}
                        </p>
                        <p className="font-[family-name:var(--font-v2-arabic)] text-[10px] text-v2-sand">
                          {row.situation_eg || row.title_tl}
                        </p>
                      </div>
                    </div>
                  );
                }

                const tile = (
                  <div
                    className={[
                      'flex items-center gap-3',
                      onStart ? '' : 'flex-row-reverse',
                    ].join(' ')}
                  >
                    <div className="relative flex items-center justify-center">
                      {isCurrent ? (
                        <div className="v2-beacon-pulse absolute size-20 rounded-full bg-v2-secondary-fixed" />
                      ) : null}
                      <div
                        className={[
                          'relative z-10 flex items-center justify-center border-2 border-v2-card shadow-md transition-transform group-hover:scale-105',
                          isCurrent
                            ? 'size-16 flex-col rounded-2xl bg-v2-primary text-white'
                            : isDone
                              ? 'size-14 rounded-2xl bg-v2-success text-white'
                              : 'size-12 rounded-2xl border border-v2-line/50 bg-v2-paper-deep text-v2-sand shadow-sm',
                        ].join(' ')}
                      >
                        <Icon
                          name={
                            isDone
                              ? 'check'
                              : isLocked
                                ? 'lock'
                                : isCurrent
                                  ? icon
                                  : icon
                          }
                          size={isCurrent ? 24 : 20}
                          variant="outlined"
                          fill={isDone || isCurrent}
                        />
                        {isCurrent ? (
                          <span className="mt-0.5 font-[family-name:var(--font-v2-arabic)] text-[9px] font-bold tracking-wider">
                            الحالي
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className={[
                        'max-w-[185px] rounded-xl border p-2.5 shadow-sm backdrop-blur-sm',
                        isCurrent
                          ? 'border-2 border-v2-primary/40 bg-v2-card p-3 shadow-md'
                          : isDone
                            ? 'border-v2-line/40 bg-v2-card/90'
                            : 'border-v2-line/30 bg-v2-action-tint/70',
                        onStart ? '' : 'text-left',
                      ].join(' ')}
                    >
                      {isDone ? (
                        <span className="font-[family-name:var(--font-v2-arabic)] text-[10px] font-bold text-v2-success">
                          مكتمل • Dia {row.day}
                        </span>
                      ) : isCurrent ? (
                        <span className="inline-flex items-center gap-1 font-[family-name:var(--font-v2-arabic)] text-[10px] font-bold text-v2-primary">
                          <span className="size-1.5 animate-ping rounded-full bg-v2-primary" />
                          محطتك الحالية • Dia {row.day}
                        </span>
                      ) : isBakra ? (
                        <span className="font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold text-v2-sand">
                          بكرة • Dia {row.day}
                        </span>
                      ) : (
                        <span className="font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold text-v2-sand">
                          مغلق • Dia {row.day}
                        </span>
                      )}
                      <p
                        className={[
                          'truncate font-[family-name:var(--font-v2-target)] text-xs font-bold text-v2-ink',
                          isLocked ? 'font-medium' : '',
                        ].join(' ')}
                        dir="ltr"
                      >
                        {row.situation_tl ?? row.title_tl}
                      </p>
                      <p
                        className={[
                          'font-[family-name:var(--font-v2-arabic)] text-[10px]',
                          isLocked ? 'text-v2-sand' : 'text-v2-ink-muted',
                        ].join(' ')}
                      >
                        {row.title_ar}
                      </p>
                    </div>
                  </div>
                );

                const rowClass = [
                  'flex items-center group',
                  onStart ? 'justify-start pe-10' : 'justify-end ps-10',
                  isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
                ].join(' ');

                if (isLocked || !row.href) {
                  return (
                    <div key={row.day} className={rowClass}>
                      {tile}
                    </div>
                  );
                }

                return (
                  <Link key={row.day} href={row.href} className={rowClass}>
                    {tile}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function serpentinePath(height: number): string {
  // Stitch-like S-curve for a ~340-wide viewBox; scales with node count.
  const midY = Math.max(540, height - 40);
  return `M 90 40
    C 220 70, 260 130, 245 160
    C 230 190, 80 230, 95 280
    C 110 330, 265 370, 245 420
    C 225 470, 100 500, 120 ${midY}`;
}
