'use client';

import { AudioButton } from '@/components/v2/AudioButton';
import { coachFeedbackLabel, coachLoggedWeak } from '@/lib/v2/review-chat/coach';
import type { ReviewStepDisplay } from '@/lib/v2/review-chat/types';
import { GrammarNote } from './GrammarNote';
import { StageChip } from './StageChip';

type Props = {
  display: ReviewStepDisplay;
  stepIndex: number;
};

export function FeedbackPanel({ display, stepIndex }: Props) {
  const label = coachFeedbackLabel(display.verdict, stepIndex);
  const isCorrect = display.verdict === 'correct';
  const isAccentOk = display.verdict === 'accent_ok';
  const isNear = display.verdict === 'near_miss';
  const isWrong = display.verdict === 'wrong';
  const isUnclear = display.verdict === 'unclear';
  const isSelf = display.verdict === 'self_rated';

  const panel = isCorrect
    ? 'border-v2-success/30 bg-v2-success-panel text-v2-success-text'
    : isAccentOk || isNear || isWrong
      ? 'border-v2-warning/40 bg-v2-warning-panel text-v2-warning-text'
      : 'border-v2-line bg-v2-panel text-v2-ink';

  const playTl = display.correct_tl ?? display.corrected_tl;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div
        className={[
          'flex w-full max-w-[85%] flex-col gap-2 rounded-v2-bubble rounded-tr-sm border px-4 py-3 shadow-sm',
          panel,
        ].join(' ')}
      >
        <div className="flex items-start gap-2">
          <p className="flex-1 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold leading-relaxed">
            <span>{label}</span>
            {display.correct_tl ? (
              <>
                {' · '}
                <span className="font-[family-name:var(--font-v2-target)] font-medium" dir="ltr">
                  {display.correct_tl}
                </span>
              </>
            ) : null}
            {display.meaning_eg ? (
              <span> = {display.meaning_eg}</span>
            ) : null}
          </p>
          {playTl && (isCorrect || isAccentOk) ? (
            <AudioButton text={playTl} label="استماع للجملة" size="chip" />
          ) : null}
        </div>
        {display.corrected_tl ? (
          <p className="font-[family-name:var(--font-v2-target)] text-sm" dir="ltr">
            {display.corrected_tl}
          </p>
        ) : null}
        {display.why_eg ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs leading-relaxed">
            💡 {display.why_eg}
          </p>
        ) : null}
        {isUnclear && display.model_tl ? (
          <p className="font-[family-name:var(--font-v2-target)] text-sm font-medium" dir="ltr">
            {display.model_tl}
          </p>
        ) : null}
        {isSelf && display.model_tl ? (
          <p className="font-[family-name:var(--font-v2-target)] text-sm" dir="ltr">
            {display.model_tl}
          </p>
        ) : null}
        {display.grammar_note ? (
          <GrammarNote
            rule={display.grammar_note.rule_eg}
            wrong={display.grammar_note.wrong_tl}
            right={display.grammar_note.right_tl}
          />
        ) : null}
      </div>
      {display.logged_weak ? (
        <span className="rounded-full bg-v2-panel px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted">
          {coachLoggedWeak(stepIndex)}
        </span>
      ) : null}
      {display.stage_labels?.map((s) => (
        <StageChip key={s} label={s} />
      ))}
    </div>
  );
}