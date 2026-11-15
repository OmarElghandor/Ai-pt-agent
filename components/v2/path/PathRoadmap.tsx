'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Icon } from '@/components/v2/Icon';
import type { PathDayRow } from '@/lib/v2/path';
import type { LearnerPathDay } from '@/lib/v2/progress/learnerPath';

type NodeStatus = 'done' | 'current' | 'available' | 'locked' | 'bakra';

type PathRoadDay = PathDayRow &
  Partial<
    Pick<
      LearnerPathDay,
      | 'learner_status'
      | 'bakra'
      | 'practised'
      | 'steps_done'
      | 'steps_total'
    >
  >;

export type CurrentDayStepsProp = {
  done: number;
  total: number;
  next_step: { id: string; title: string; href: string | null } | null;
  last_done_step: { id: string; title: string; href: string | null } | null;
  started: boolean;
  practised: boolean;
  total_minutes: number;
  first_step_href: string | null;
  practice_href: string | null;
  day_map_href: string;
  completed: boolean;
};

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

const EASTERN = '٠١٢٣٤٥٦٧٨٩';

function toEastern(n: number): string {
  return String(n)
    .split('')
    .map((c) => EASTERN[Number(c)] ?? c)
    .join('');
}

function heroCta(steps: CurrentDayStepsProp | null, bakra: boolean): {
  label: string;
  href: string | null;
  disabled: boolean;
} {
  if (bakra) {
    return { label: 'بيفتح بكرة', href: null, disabled: true };
  }
  if (!steps) {
    return { label: 'يلا نبدأ', href: null, disabled: true };
  }
  if (steps.completed && steps.practised) {
    return {
      label: 'راجع الدرس',
      href: steps.day_map_href,
      disabled: false,
    };
  }
  if (steps.completed && !steps.practised) {
    return {
      label: 'اتمرّن على الدرس',
      href: steps.practice_href ?? steps.day_map_href,
      disabled: !steps.practice_href,
    };
  }
  if (!steps.started) {
    return {
      label: 'يلا نبدأ',
      href: steps.first_step_href ?? steps.day_map_href,
      disabled: false,
    };
  }
  if (steps.next_step) {
    return {
      label: `كمّل: ${steps.next_step.title}`,
      href: steps.next_step.href ?? steps.day_map_href,
      disabled: false,
    };
  }
  return {
    label: 'راجع الدرس',
    href: steps.day_map_href,
    disabled: false,
  };
}

export function PathRoadmap({
  week,
  days,
  currentDay: ssrCurrentDay,
  coverUrl = null,
  deckLeft = null,
  deckTotal = null,
  currentDaySteps = null,
  suggestion = null,
}: {
  week: number;
  days: PathRoadDay[];
  currentDay: number | null;
  coverUrl?: string | null;
  deckLeft?: number | null;
  deckTotal?: number | null;
  currentDaySteps?: CurrentDayStepsProp | null;
  suggestion?: { kind: string; text: string } | null;
}) {
  const nodes = useMemo(() => {
    let markedCurrent = false;
    return days.map((row) => {
      // Server status only — sessionStorage must never mark a day done (13 §5).
      if (row.learner_status === 'completed') {
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
  }, [days, ssrCurrentDay]);

  const current =
    nodes.find((n) => n.status === 'current')?.row ??
    nodes.find((n) => n.status === 'bakra')?.row ??
    days.find((d) => d.day === ssrCurrentDay) ??
    days.find((d) => d.status !== 'locked') ??
    null;

  const doneCount = nodes.filter((n) => n.status === 'done').length;
  const currentIndex = current
    ? days.findIndex((d) => d.day === current.day) + 1
    : doneCount;

  const bakra = Boolean(current?.bakra || current?.learner_status === 'scheduled');
  const cta = heroCta(currentDaySteps, bakra);
  const stationsDone = currentDaySteps?.done ?? 0;
  const stationsTotal = currentDaySteps?.total ?? 0;

  const cardsLabel =
    deckTotal != null && deckTotal > 0
      ? deckLeft === 0
        ? 'خلصت النهارده'
        : `${deckLeft ?? deckTotal} بطاقة جاهزة`
      : 'مراجعة سريعة';

  const roadHeight = Math.max(520, days.length * 110 + 80);

  return (
    <div className="relative flex flex-col">
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
                  <span className="rounded-full bg-v2-primary px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[11px] font-bold text-white shadow-sm">
                    مستوى A1
                  </span>
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

                {stationsTotal > 0 ? (
                  <div className="flex flex-col gap-2">
                    <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
                      {stationsDone === 0
                        ? `${toEastern(stationsTotal)} محطات · حوالي ${toEastern(currentDaySteps?.total_minutes ?? 0)} دقيقة`
                        : `${toEastern(stationsDone)} من ${toEastern(stationsTotal)} محطات`}
                    </p>
                    <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
                      {Array.from({ length: stationsTotal }, (_, i) => (
                        <div
                          key={i}
                          className={[
                            'h-full flex-1 first:rounded-s-full last:rounded-e-full',
                            i < stationsDone
                              ? 'bg-v2-primary'
                              : 'bg-v2-primary-tint',
                          ].join(' ')}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {currentDaySteps?.started &&
                !currentDaySteps.completed &&
                currentDaySteps.last_done_step ? (
                  <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
                    وقفت عند: {currentDaySteps.last_done_step.title}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 pt-1">
                  {cta.disabled || !cta.href ? (
                    <button
                      type="button"
                      disabled
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-v2-paper-deep px-5 text-sm font-semibold text-v2-sand"
                    >
                      <span className="font-[family-name:var(--font-v2-arabic)]">
                        {cta.label}
                      </span>
                    </button>
                  ) : (
                    <Link
                      href={cta.href}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-v2-primary px-5 text-sm font-semibold text-white shadow-sm transition-colors active:scale-95 hover:bg-v2-primary-strong"
                    >
                      <span className="font-[family-name:var(--font-v2-arabic)]">
                        {cta.label}
                      </span>
                      <Icon name="play_arrow" size={20} variant="outlined" fill />
                    </Link>
                  )}
                  {bakra && suggestion?.text ? (
                    <p className="font-[family-name:var(--font-v2-arabic)] text-xs leading-relaxed text-v2-ink-muted">
                      {suggestion.text}
                    </p>
                  ) : null}
                  <Link
                    href={
                      currentDaySteps?.day_map_href ??
                      current.href ??
                      `/day/${current.day}`
                    }
                    className="text-center font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-primary hover:underline"
                  >
                    شوف كل المحطات
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ) : null}

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
                const showStepsFrac =
                  row.learner_status === 'in_progress' &&
                  typeof row.steps_done === 'number' &&
                  typeof row.steps_total === 'number' &&
                  row.steps_total > 0;

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
                          name={isDone ? 'check' : isLocked ? 'lock' : icon}
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
                      {showStepsFrac ? (
                        <p className="mt-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold text-v2-primary">
                          {toEastern(row.steps_done!)}/{toEastern(row.steps_total!)}
                        </p>
                      ) : null}
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
  const midY = Math.max(540, height - 40);
  return `M 90 40
    C 220 70, 260 130, 245 160
    C 230 190, 80 230, 95 280
    C 110 330, 265 370, 245 420
    C 225 470, 100 500, 120 ${midY}`;
}
