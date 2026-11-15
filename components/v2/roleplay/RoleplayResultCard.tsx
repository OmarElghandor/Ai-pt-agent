'use client';

import Link from 'next/link';
import type { RoleplayResultState } from './roleplayStreamReduce';

type Props = {
  result: RoleplayResultState;
  situationId: string;
  nextSituationId?: string | null;
};

export function RoleplayResultCard({
  result,
  situationId,
  nextSituationId = null,
}: Props) {
  return (
    <div className="mx-4 mb-4 flex flex-col gap-3 rounded-v2-card bg-v2-card px-4 py-5 shadow-[var(--shadow-v2-soft)]">
      <p className="font-[family-name:var(--font-v2-display-ar)] text-xl font-bold text-v2-primary">
        خلصت ✓
      </p>
      <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
        لوحدك: {result.alone} · بمساعدة: {result.assisted}
      </p>
      {result.key_phrases.length > 0 ? (
        <div>
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            عبارات قلتَها
          </p>
          <ul className="mt-1 flex flex-col gap-1" dir="ltr">
            {result.key_phrases.map((p) => (
              <li
                key={p}
                className="font-[family-name:var(--font-v2-target)] text-sm text-v2-primary"
              >
                {p}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.corrections.length > 0 ? (
        <div>
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            تصحيحات
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {result.corrections.map((c, i) => (
              <li
                key={`${c.tl}-${i}`}
                className="font-[family-name:var(--font-v2-target)] text-sm text-v2-attention"
                dir="ltr"
              >
                {c.tl}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
        {result.summary_eg}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {nextSituationId ? (
          <Link
            href={`/roleplay/${encodeURIComponent(nextSituationId)}`}
            className="flex min-h-11 items-center justify-center rounded-v2-row bg-v2-primary font-[family-name:var(--font-v2-arabic)] font-semibold text-white"
          >
            المكالمة الجاية
          </Link>
        ) : null}
        <Link
          href="/roleplay"
          className="flex min-h-11 items-center justify-center rounded-v2-row bg-v2-paper font-[family-name:var(--font-v2-arabic)] font-semibold text-v2-primary ring-1 ring-v2-line"
        >
          رجوع للقائمة
        </Link>
        <Link
          href={`/roleplay/${encodeURIComponent(situationId)}`}
          className="text-center font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted"
        >
          إعادة المكالمة
        </Link>
      </div>
    </div>
  );
}
