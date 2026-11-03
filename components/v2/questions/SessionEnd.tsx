'use client';

import Link from 'next/link';
import { NoteCard } from '@/components/v2/NoteCard';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import type { Skill } from '@/lib/v2/content/lesson';
import { easternDigits, type SessionStats } from './types';

function skillLabel(skill: Skill): string {
  switch (skill) {
    case 'listening':
      return 'سمع';
    case 'writing':
      return 'كتابة';
    case 'speaking':
      return 'تحدث';
    case 'grammar':
      return 'قواعد';
    case 'reading':
      return 'قراية';
    default:
      return skill;
  }
}

function skillStatus(
  skill: Skill,
  score: { correct: number; total: number } | undefined,
): string {
  if (!score || score.total === 0) return '—';
  if (skill === 'speaking') return 'تقييم ذاتي';
  const r = score.correct / score.total;
  if (r >= 0.9) return 'ممتاز';
  if (r >= 0.7) return 'جيد جداً';
  if (r >= 0.5) return 'محتاج تثبيت';
  return 'راجع تاني';
}

/** Design 12c-q07 — session complete. */
export function SessionEnd({
  day,
  stats,
}: {
  day: number;
  stats: SessionStats;
}) {
  const gridSkills: Skill[] = ['listening', 'writing', 'speaking', 'grammar'];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col px-4 pb-10 pt-4">
      <div className="flex items-center justify-between">
        <span className="rounded-v2-pill bg-v2-paper-deep px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-primary">
          ✓ جلسة اليوم اكتملت
        </span>
        <Link
          href={`/day/${day}`}
          className="text-v2-ink"
          aria-label="إغلاق"
        >
          ✕
        </Link>
      </div>

      <div className="mt-4 rounded-v2-card bg-v2-primary px-5 py-6 text-center text-white shadow-[var(--shadow-v2-soft)]">
        <p className="font-[family-name:var(--font-v2-display)] text-3xl font-bold">
          {easternDigits(stats.correct)} من {easternDigits(stats.total)}
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-v2-arabic)] text-xl font-bold">
          خلّصت أسئلة اليوم
        </h1>
        <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-sm text-white/80">
          كويس — كمّل للمحادثة عشان تثبّت اللي اتقال
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {gridSkills.map((skill) => {
          const s = stats.bySkill[skill];
          return (
            <div
              key={skill}
              className="rounded-v2-card bg-v2-card p-3 shadow-[var(--shadow-v2-soft)]"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
                  {skillLabel(skill)}
                </span>
                <span className="font-[family-name:var(--font-v2-ui)] text-xs text-v2-ink-muted">
                  {s
                    ? `${easternDigits(s.correct)} / ${easternDigits(s.total)}`
                    : '—'}
                </span>
              </div>
              <p
                className={[
                  'mt-2 font-[family-name:var(--font-v2-arabic)] text-xs',
                  skillStatus(skill, s).includes('تثبيت')
                    ? 'text-v2-attention'
                    : 'text-v2-ink-muted',
                ].join(' ')}
              >
                {skillStatus(skill, s)}
              </p>
            </div>
          );
        })}
      </div>

      {stats.usedCorrectly.length ? (
        <div className="mt-5">
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
            استخدمت صح النهارده:
          </p>
          <div className="mt-2 flex flex-wrap gap-2" dir="ltr">
            {stats.usedCorrectly.slice(0, 8).map((id) => (
              <span
                key={id}
                className="rounded-v2-chip bg-v2-primary/10 px-2.5 py-1 text-sm text-v2-primary"
              >
                ✓ {id.replace(/^(phrase|word|pattern)\./, '')}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {stats.focusNote ? (
        <div className="mt-4">
          <NoteCard>
            <p dir="ltr" className="font-[family-name:var(--font-v2-display)]">
              {stats.focusNote.right} ← {stats.focusNote.wrong}
            </p>
            <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm">
              {stats.focusNote.why_eg}
            </p>
          </NoteCard>
        </div>
      ) : null}

      <div className="mt-auto space-y-3 pt-8">
        <PrimaryButton className="w-full" href={`/practice/${day}`}>
          كمّل للمحادثة ←
        </PrimaryButton>
        <Link
          href={`/day/${day}`}
          className="flex min-h-11 w-full items-center justify-center rounded-v2-pill border border-v2-action font-[family-name:var(--font-v2-arabic)] font-semibold text-v2-action"
        >
          رجوع للمسار التعليمي
        </Link>
      </div>
    </main>
  );
}
