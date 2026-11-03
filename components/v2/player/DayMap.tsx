'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { readDonePages } from './session';

export type DayMapStep = {
  id: string;
  kind: 'page' | 'practice' | 'questions' | 'find_image';
  title: string;
  subtitle?: string;
  minutes: number;
  href: string | null;
};

type Status = 'done' | 'current' | 'locked';

const EASTERN = '٠١٢٣٤٥٦٧٨٩';

function arPad(n: number): string {
  return String(n)
    .padStart(2, '0')
    .split('')
    .map((c) => EASTERN[Number(c)] ?? c)
    .join('');
}

function stepIcon(kind: DayMapStep['kind'], status: Status): string {
  if (status === 'done') return 'check_circle';
  if (status === 'locked') return 'lock';
  if (kind === 'questions') return 'quiz';
  if (kind === 'practice') return 'record_voice_over';
  if (kind === 'find_image') return 'image_search';
  return 'menu_book';
}

export function DayMap({
  day,
  situation,
  steps,
  lastPageId,
  practiceDevUnlock = false,
  hasPublishedPack = false,
  questionsAfterId = null,
}: {
  day: number;
  situation?: { tl: string; eg: string };
  steps: DayMapStep[];
  lastPageId?: string | null;
  practiceDevUnlock?: boolean;
  hasPublishedPack?: boolean;
  /** Page that must be done before questions unlock. */
  questionsAfterId?: string | null;
}) {
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    setDone(readDonePages(day));
  }, [day]);

  const doneSet = new Set(done);
  const gateDone = lastPageId ? doneSet.has(lastPageId) : false;
  const practiceUnlocked =
    hasPublishedPack && (gateDone || practiceDevUnlock);

  let markedCurrent = false;
  const rows = steps.map((step, i) => {
    const prev = steps[i - 1];
    const prevDone = !prev || doneSet.has(prev.id);

    if (step.kind === 'practice') {
      if (!practiceUnlocked || !step.href) {
        return { step, status: 'locked' as Status };
      }
      if (!markedCurrent) {
        markedCurrent = true;
        return { step, status: 'current' as Status };
      }
      return { step, status: 'current' as Status };
    }

    if (step.kind === 'questions') {
      const unlocked =
        practiceDevUnlock ||
        (questionsAfterId ? doneSet.has(questionsAfterId) : prevDone);
      if (!unlocked) return { step, status: 'locked' as Status };
    }

    if (
      (step.kind === 'page' || step.kind === 'find_image') &&
      prev &&
      !prevDone &&
      !practiceDevUnlock
    ) {
      if (
        prev.kind === 'page' ||
        prev.kind === 'questions' ||
        prev.kind === 'find_image'
      ) {
        return { step, status: 'locked' as Status };
      }
    }

    if (doneSet.has(step.id)) return { step, status: 'done' as Status };
    if (!markedCurrent && (prevDone || practiceDevUnlock || i === 0)) {
      markedCurrent = true;
      return { step, status: 'current' as Status };
    }
    if (!prevDone && !practiceDevUnlock) {
      return { step, status: 'locked' as Status };
    }
    if (!markedCurrent) {
      markedCurrent = true;
      return { step, status: 'current' as Status };
    }
    return { step, status: 'locked' as Status };
  });

  const doneCount = rows.filter((r) => r.status === 'done').length;
  const currentIndex = rows.findIndex((r) => r.status === 'current');
  const currentRow = currentIndex >= 0 ? rows[currentIndex] : null;
  const totalMinutes = steps.reduce((sum, s) => sum + s.minutes, 0);
  const remainingMinutes = rows
    .filter((r) => r.status !== 'done')
    .reduce((sum, r) => sum + r.step.minutes, 0);
  const progressPct =
    steps.length === 0 ? 0 : Math.round((doneCount / steps.length) * 100);
  const railFillPct =
    steps.length <= 1
      ? doneCount > 0
        ? 100
        : 0
      : Math.round(
          ((Math.max(doneCount, currentIndex >= 0 ? currentIndex : 0) /
            (steps.length - 1)) *
            100),
        );

  return (
    <main className="flex min-h-dvh flex-col bg-v2-paper pb-28">
      <header className="sticky top-0 z-30 border-b border-v2-line/60 bg-v2-paper/85 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/path"
              aria-label="رجوع للمسار"
              className="flex h-11 w-11 items-center justify-center rounded-full text-v2-ink hover:bg-v2-paper-deep"
            >
              <Icon name="arrow_forward" size={24} />
            </Link>
            <h1 className="font-[family-name:var(--font-v2-arabic)] text-lg font-semibold text-v2-primary">
              محطات اليوم
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4 pt-4">
        <section className="relative overflow-hidden rounded-2xl bg-v2-paper-deep p-4 shadow-[var(--shadow-v2-soft)]">
          <div className="pointer-events-none absolute -start-6 -top-6 h-24 w-24 rounded-full bg-v2-primary-tint/40 blur-xl" />
          <div className="pointer-events-none absolute -bottom-6 -end-6 h-28 w-28 rounded-full bg-v2-action-tint/50 blur-xl" />
          <div className="relative z-10 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-v2-primary px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs font-medium text-white shadow-sm">
                <Icon name="map" size={20} />
                اليوم {day} · خطة تفاعلية
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-v2-card px-2.5 py-1 font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold text-v2-ink-muted">
                <Icon name="schedule" size={20} className="text-v2-primary" />
                ⏱ {totalMinutes} دقيقة إجمالية
              </span>
            </div>
            <div>
              <h2 className="font-[family-name:var(--font-v2-arabic)] text-2xl font-bold tracking-tight text-v2-primary">
                {situation?.eg ?? `اليوم ${day}`}
              </h2>
              {situation?.tl ? (
                <p
                  className="mt-0.5 inline-block font-[family-name:var(--font-v2-target)] text-sm font-medium tracking-wide text-v2-action"
                  dir="ltr"
                >
                  {situation.tl} · Dia {day}
                </p>
              ) : null}
            </div>
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm leading-relaxed text-v2-ink-muted">
              {steps.length} محطات متسلسلة بتنقلك من القصة والتفصيل لحد أسئلة
              اليوم والتدريب.
            </p>
            <div className="mt-1 flex items-center gap-3 pt-1">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-v2-line">
                <div
                  className="h-full rounded-full bg-v2-action transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="shrink-0 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-ink">
                محطات مكتملة ({doneCount}/{steps.length})
              </span>
            </div>
          </div>
        </section>

        <section className="relative">
          <div className="pointer-events-none absolute bottom-8 top-6 end-[21px] flex w-4 justify-center">
            <div className="relative h-full w-1 rounded-full bg-v2-line">
              <div
                className="w-full rounded-full bg-v2-primary transition-all"
                style={{ height: `${Math.min(100, railFillPct)}%` }}
              />
            </div>
          </div>

          <ol className="relative z-10 flex flex-col gap-4">
            {rows.map(({ step, status }, index) => {
              const stationLabel =
                status === 'current'
                  ? 'المحطة الحالية'
                  : `المحطة ${arPad(index + 1)}`;
              const statusPill =
                status === 'done'
                  ? {
                      label: 'مكتملة ✓',
                      className: 'bg-v2-primary-fixed text-v2-primary-strong',
                    }
                  : status === 'current'
                    ? {
                        label: 'جارية',
                        className: 'bg-v2-action text-white',
                      }
                    : {
                        label: 'مقفل مؤقتاً',
                        className: 'bg-v2-line text-v2-ink-muted',
                      };

              const pinClass =
                status === 'done'
                  ? 'bg-v2-primary text-white'
                  : status === 'current'
                    ? 'bg-v2-action text-white ring-4 ring-v2-action/20'
                    : 'bg-v2-paper-deep text-v2-ink-muted';

              const cardClass = [
                'flex-1 rounded-2xl p-4 shadow-[var(--shadow-v2-soft)]',
                status === 'current'
                  ? 'border-2 border-v2-action bg-v2-card'
                  : status === 'done'
                    ? 'bg-v2-card'
                    : 'bg-v2-paper-deep opacity-90',
              ].join(' ');

              const body = (
                <div className="flex items-start gap-3">
                  <div
                    className={[
                      'z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm',
                      pinClass,
                    ].join(' ')}
                  >
                    {status === 'current' ? (
                      <span className="font-[family-name:var(--font-v2-ui)] text-sm font-bold">
                        {arPad(index + 1)}
                      </span>
                    ) : (
                      <Icon
                        name={stepIcon(step.kind, status)}
                        size={20}
                        fill={status === 'done'}
                      />
                    )}
                  </div>
                  <div className={cardClass}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span
                        className={[
                          'font-[family-name:var(--font-v2-arabic)] text-[10px] font-bold',
                          status === 'current'
                            ? 'text-v2-action'
                            : 'text-v2-ink-muted',
                        ].join(' ')}
                      >
                        {stationLabel}
                        {status === 'current' ? ' 🎯' : ''}
                      </span>
                      <span
                        className={[
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold',
                          statusPill.className,
                        ].join(' ')}
                      >
                        {statusPill.label}
                      </span>
                    </div>
                    <h3 className="font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-primary">
                      {step.title}
                    </h3>
                    {step.subtitle ? (
                      <p
                        className="mt-0.5 font-[family-name:var(--font-v2-ui)] text-[10px] font-medium text-v2-ink-muted"
                        dir="ltr"
                      >
                        {step.subtitle}
                      </p>
                    ) : null}
                    <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
                      {step.minutes} دقيقة
                    </p>
                    {status === 'current' && step.href ? (
                      <span className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-v2-action py-3 px-4 font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-white shadow-md">
                        كمّل الخطوة ({step.minutes} د)
                        <Icon name="arrow_back" size={20} />
                      </span>
                    ) : null}
                  </div>
                </div>
              );

              if (status === 'locked' || !step.href) {
                return (
                  <li key={step.id} aria-disabled="true">
                    {body}
                  </li>
                );
              }

              return (
                <li key={step.id}>
                  <Link href={step.href} className="block">
                    {body}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {currentRow?.step.href ? (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-v2-line/50 bg-v2-card/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="font-[family-name:var(--font-v2-arabic)] text-[10px] font-medium text-v2-ink-muted">
                الوقت المتبقي
              </span>
              <span className="font-[family-name:var(--font-v2-arabic)] text-xs font-bold text-v2-action">
                باقيلك {remainingMinutes} دقايق على إنهاء اليوم
              </span>
            </div>
            <Link
              href={currentRow.step.href}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-v2-action py-3 px-4 font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-white shadow-md active:scale-95"
            >
              كمّل من المحطة {currentIndex + 1}
              <Icon name="arrow_back" size={20} />
            </Link>
          </div>
        </div>
      ) : null}
    </main>
  );
}
