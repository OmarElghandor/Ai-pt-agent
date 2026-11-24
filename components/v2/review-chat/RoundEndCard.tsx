'use client';

import { pickVariant } from '@/lib/v2/review-chat/coach';
import { toArDigits } from '@/lib/v2/formatAr';
import { CoachMessage } from './CoachMessage';

type Props = {
  round: number;
  count: number;
  nextRound?: number;
  minutes?: number;
  stageLabels?: string[];
  onContinue: () => void;
  onStop: () => void;
};

export function RoundEndCard({
  round,
  count,
  nextRound,
  minutes = 5,
  stageLabels,
  onContinue,
  onStop,
}: Props) {
  const title = pickVariant('round_end_title', round, {
    n: round,
    count,
  });
  const cta =
    nextRound != null
      ? pickVariant('round_end_cta', round, {
          next: nextRound,
          minutes,
        })
      : null;
  const stop = pickVariant('round_end_stop', round);

  return (
    <CoachMessage>
      <div className="w-full space-y-4 rounded-2xl border border-v2-line bg-v2-paper p-5 shadow-md">
        <h2 className="font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-ink">
          {title.replace(String(count), toArDigits(count))}
        </h2>
        {stageLabels?.length ? (
          <div className="flex flex-wrap gap-2">
            {stageLabels.map((s) => (
              <span
                key={s}
                className="rounded-full bg-v2-primary-tint px-3 py-1.5 font-[family-name:var(--font-v2-arabic)] text-xs font-bold text-v2-primary-strong"
              >
                {s}
              </span>
            ))}
          </div>
        ) : null}
        {cta && nextRound != null ? (
          <button
            type="button"
            onClick={onContinue}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-v2-primary font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-v2-on-primary"
          >
            {cta
              .replace(String(nextRound), toArDigits(nextRound))
              .replace(String(minutes), toArDigits(minutes))}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onStop}
          className="min-h-11 w-full rounded-lg bg-v2-panel font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink"
        >
          {stop}
        </button>
      </div>
    </CoachMessage>
  );
}