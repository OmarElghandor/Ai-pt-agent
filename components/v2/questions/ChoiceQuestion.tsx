'use client';

import { AudioButton } from '@/components/v2/AudioButton';
import { RichText } from '@/components/v2/RichText';
import { itemTargetText } from '@/lib/v2/render/speechTarget';
import {
  asRt,
  optionLabel,
  promptRecord,
  type QuestionViewProps,
} from './types';

/** Grammar / reading MCQ — design 12c-q01. */
export function ChoiceQuestion({
  question,
  items,
  graded,
  selectedIndex,
  onSelect,
}: QuestionViewProps) {
  const prompt = promptRecord(question.prompt);
  const promptRt = asRt(question.prompt);
  const audioRef =
    typeof prompt?.audio_ref === 'string' ? prompt.audio_ref : null;
  const audioItem = audioRef ? items.get(audioRef) : undefined;
  const audioText = itemTargetText(audioItem ?? undefined);
  const options = question.options ?? [];
  const answerIndex =
    typeof question.answer === 'number' ? question.answer : null;
  const feedback =
    graded && selectedIndex !== null
      ? selectedIndex === answerIndex
        ? asRt(question.feedback_eg)
        : asRt(question.why_wrong_eg?.[selectedIndex] ?? null)
      : null;
  const correct = graded && selectedIndex !== null && selectedIndex === answerIndex;

  const egSegs = promptRt?.filter((s) => s.lang === 'eg') ?? [];
  const tlSegs = promptRt?.filter((s) => s.lang === 'tl') ?? [];
  const arSegs = promptRt?.filter((s) => s.lang === 'ar') ?? [];
  const type = String(question.type ?? '');
  const fallbackTitle =
    type === 'listen_meaning' || type === 'listen_pick_tl'
      ? 'اسمع واختار'
      : type === 'fill_blank_choice'
        ? 'اختر الإجابة المناسبة'
        : type === 'read_meaning'
          ? 'معناها إيه؟'
          : type === 'situation_choice'
            ? 'حد كلّمك في الشارع، ترد إزاي؟'
            : 'جاوب';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-primary">
          {egSegs.length ? <RichText segments={egSegs} /> : fallbackTitle}
        </h2>
        {tlSegs.length ? (
          <div
            className="mt-3 rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]"
            dir="ltr"
          >
            {audioText ? (
              <div className="mb-2 flex justify-end">
                <AudioButton text={audioText} lang="pt" label="استمع للجملة" />
              </div>
            ) : null}
            <p className="font-[family-name:var(--font-v2-display)] text-xl text-v2-ink">
              <RichText segments={tlSegs} />
            </p>
            {arSegs.length ? (
              <p className="mt-2 rounded-v2-row bg-v2-paper-deep px-2 py-1 text-sm text-v2-ink-muted">
                <RichText segments={arSegs} />
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {audioText && !tlSegs.length ? (
        <div className="rounded-v2-card bg-v2-paper-deep px-4 py-3">
          <AudioButton text={audioText} lang="pt" label="اسمع" showSlow />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {options.map((opt, index) => {
          const chosen = selectedIndex === index;
          const showCorrect = graded && index === answerIndex;
          const showWrong = graded && chosen && index !== answerIndex;
          return (
            <button
              key={index}
              type="button"
              disabled={graded}
              onClick={() => onSelect(index)}
              className={[
                'relative rounded-v2-card border px-3 py-4 text-center font-[family-name:var(--font-v2-display)] text-lg',
                showCorrect
                  ? 'border-v2-success bg-v2-primary-fixed text-v2-primary-strong'
                  : showWrong
                    ? 'v2-shake border-v2-attention bg-v2-note text-v2-attention'
                    : chosen
                      ? 'border-v2-action bg-v2-action text-white'
                      : 'border-v2-rule bg-v2-card text-v2-ink',
              ].join(' ')}
              dir="ltr"
            >
              {asRt(opt) ? <RichText segments={asRt(opt)!} /> : optionLabel(opt)}
            </button>
          );
        })}
      </div>

      {graded ? (
        <div
          className={[
            'flex items-start gap-3 rounded-v2-row px-3 py-3',
            correct ? 'bg-v2-highlight-fill' : 'bg-v2-paper-deep',
          ].join(' ')}
        >
          <span
            className={[
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-white',
              correct ? 'bg-v2-success' : 'bg-v2-attention',
            ].join(' ')}
          >
            {correct ? '✓' : '!'}
          </span>
          <div className="min-w-0 font-[family-name:var(--font-v2-arabic)] text-sm">
            <p className={correct ? 'font-semibold text-v2-success' : 'font-semibold text-v2-attention'}>
              {correct ? 'إجابة صحيحة! أحسنت' : 'قربت — شوف التصحيح'}
            </p>
            {feedback ? (
              <p className="mt-1 text-v2-ink">
                <RichText segments={feedback} />
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
