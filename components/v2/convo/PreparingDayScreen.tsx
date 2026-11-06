'use client';

import Link from 'next/link';
import type { DayReadiness } from '@/lib/v2/generation/prepare';
import { PrimaryButton } from '@/components/v2/PrimaryButton';

type Props = {
  partnerName: string;
  readiness: DayReadiness | null;
  day: number | null;
  /** Ready toast visible */
  readyToast?: boolean;
  failed?: boolean;
  errorEg?: string | null;
  onOpen?: () => void;
  onPracticeNow: () => void;
  backHref?: string;
};

function stepState(
  readiness: DayReadiness | null,
  key: 'lesson' | 'pack' | 'audio',
): 'done' | 'active' | 'pending' {
  if (!readiness) return 'pending';
  if (key === 'lesson') {
    if (readiness.lesson === 'published') return 'done';
    if (readiness.lesson === 'generating' || readiness.lesson === 'draft') {
      return 'active';
    }
    return 'pending';
  }
  if (key === 'pack') {
    if (readiness.pack === 'ready') return 'done';
    if (readiness.pack === 'generating') return 'active';
    if (readiness.lesson === 'published') return 'active';
    return 'pending';
  }
  if (readiness.audio === 'ready') return 'done';
  if (readiness.audio === 'warming' || readiness.pack === 'ready') return 'active';
  return 'pending';
}

function StepRow({
  label,
  state,
}: {
  label: string;
  state: 'done' | 'active' | 'pending';
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={[
          'flex h-7 w-7 items-center justify-center rounded-full text-sm',
          state === 'done'
            ? 'bg-[color:var(--ft-sage,#6B7F6E)] text-white'
            : state === 'active'
              ? 'border-2 border-[color:var(--ft-sage,#6B7F6E)] text-[color:var(--ft-sage,#6B7F6E)]'
              : 'border border-[color:var(--ft-mist,#D9E1D9)] text-[color:var(--ft-text-secondary,#666963)]',
        ].join(' ')}
        aria-hidden
      >
        {state === 'done' ? '✓' : state === 'active' ? '…' : ''}
      </span>
      <span className="font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[15px] text-[color:var(--ft-ink,#202A25)]">
        {label}
      </span>
    </div>
  );
}

export function PreparingDayScreen({
  partnerName,
  readiness,
  day,
  readyToast,
  failed,
  errorEg,
  onOpen,
  onPracticeNow,
  backHref = '/talk/learn',
}: Props) {
  const lesson = stepState(readiness, 'lesson');
  const pack = stepState(readiness, 'pack');
  const audio = stepState(readiness, 'audio');

  return (
    <main className="v2-free-talk mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-[color:var(--ft-ivory,#F4EFE8)]">
      <header className="flex items-center justify-between px-4 py-4">
        <div className="w-10" />
        <div className="text-center">
          <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ft-sage,#6B7F6E)] text-lg font-semibold text-white">
            {partnerName.slice(0, 1)}
          </div>
          <p className="font-[family-name:var(--font-ft-pt,var(--font-v2-target))] text-sm font-semibold text-[color:var(--ft-ink,#202A25)]">
            {partnerName}
          </p>
        </div>
        <Link
          href={backHref}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--ft-sage,#6B7F6E)]"
          aria-label="رجوع"
        >
          <span className="material-symbols-rounded text-[22px]">
            arrow_forward
          </span>
        </Link>
      </header>

      <div className="flex flex-1 flex-col px-5 pb-8 pt-2">
        <h1 className="text-center font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[22px] font-semibold leading-snug text-[color:var(--ft-ink,#202A25)]">
          {failed
            ? 'لسه مش جاهز'
            : 'بنجهّزلك الدرس ده ✨'}
        </h1>

        {failed ? (
          <p className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-center font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[14px] leading-relaxed text-[color:var(--ft-ink,#202A25)]">
            {errorEg ||
              'الدرس ده محتاج مراجعة قبل ما يتنشر 🙏 هيبقى جاهز قريب'}
          </p>
        ) : (
          <>
            <div className="mt-8 flex flex-col gap-4 px-2">
              <StepRow label="الدرس" state={lesson} />
              <StepRow label="المحادثة" state={pack} />
              <StepRow label="الصوت" state={audio} />
            </div>
            <p className="mt-8 text-center font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[13px] text-[color:var(--ft-text-secondary,#666963)]">
              بياخد دقيقة أو اتنين
            </p>
          </>
        )}

        {readyToast ? (
          <div className="mt-6 rounded-2xl border border-[color:var(--ft-sage,#6B7F6E)]/30 bg-white px-4 py-3 text-center shadow-sm">
            <p className="font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[15px] font-semibold text-[color:var(--ft-ink,#202A25)]">
              الدرس جاهز 🎉
            </p>
            {onOpen ? (
              <button
                type="button"
                onClick={onOpen}
                className="mt-2 font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[14px] font-semibold text-[color:var(--ft-sage,#6B7F6E)]"
              >
                افتح
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-3 pt-10">
          <PrimaryButton onClick={onPracticeNow}>
            اتكلم عن الموضوع ده دلوقتي
          </PrimaryButton>
          <Link
            href={backHref}
            className="text-center font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[14px] text-[color:var(--ft-text-secondary,#666963)]"
          >
            رجوع
          </Link>
          {day != null ? (
            <p className="text-center font-[family-name:var(--font-ft-pt,var(--font-v2-target))] text-[11px] text-[color:var(--ft-text-secondary,#666963)]">
              day {day}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
