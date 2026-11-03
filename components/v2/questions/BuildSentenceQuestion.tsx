'use client';

import { useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { NoteCard } from '@/components/v2/NoteCard';
import { RichText } from '@/components/v2/RichText';
import { asRt, type QuestionViewProps } from './types';

/** Tile order — design 12c-q03. Grades immediately via onGrade. */
export function BuildSentenceQuestion({
  question,
  graded,
  onGrade,
}: QuestionViewProps) {
  const tilesRaw = (question as { tiles?: unknown }).tiles;
  const tiles: string[] = Array.isArray(tilesRaw)
    ? tilesRaw.filter((t): t is string => typeof t === 'string')
    : (question.options ?? []).map((o) => {
        const rt = asRt(o);
        return rt ? rt.map((s) => s.text).join('') : String(o ?? '');
      });
  const answerOrder = Array.isArray(question.answer)
    ? (question.answer as number[])
    : [];
  const model =
    Array.isArray(question.accepted) && typeof question.accepted[0] === 'string'
      ? question.accepted[0]
      : answerOrder.map((i) => tiles[i]).join(' ');

  const [order, setOrder] = useState<number[]>([]);
  const [localGraded, setLocalGraded] = useState(false);
  const [correct, setCorrect] = useState(false);
  const done = graded || localGraded;

  function toggle(idx: number) {
    if (done) return;
    setOrder((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    );
  }

  function clear() {
    if (done) return;
    setOrder([]);
  }

  function confirm() {
    if (done || !onGrade) return;
    const ok =
      order.length === answerOrder.length &&
      order.every((v, i) => v === answerOrder[i]);
    setLocalGraded(true);
    setCorrect(ok);
    onGrade({ optionIndex: ok ? 1 : 0, correct: ok });
  }

  const tip = asRt(question.feedback_eg);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-primary">
          رتّب الجملة بالبرتغالية
        </h2>
        {asRt(question.prompt) ? (
          <p className="mt-1 text-sm text-v2-ink-muted">
            <RichText segments={asRt(question.prompt)!} />
          </p>
        ) : null}
      </div>

      <div className="min-h-14 rounded-v2-card border border-dashed border-v2-rule bg-v2-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            منطقة التركيب
          </span>
          {!done ? (
            <button
              type="button"
              onClick={clear}
              className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-action"
            >
              امسح
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2" dir="ltr">
          {order.map((ti) => (
            <button
              key={`sel-${ti}`}
              type="button"
              disabled={done}
              onClick={() => toggle(ti)}
              className="rounded-v2-chip bg-v2-primary px-3 py-1.5 text-sm text-white"
            >
              {tiles[ti]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
          الكلمات المتاحة:
        </p>
        <div className="flex flex-wrap gap-2" dir="ltr">
          {tiles.map((t, i) =>
            order.includes(i) ? null : (
              <button
                key={`tile-${i}`}
                type="button"
                disabled={done}
                onClick={() => toggle(i)}
                className="rounded-v2-chip border border-v2-rule bg-white px-3 py-1.5 text-sm text-v2-ink"
              >
                {t}
              </button>
            ),
          )}
        </div>
      </div>

      {!done ? (
        <button
          type="button"
          disabled={order.length === 0}
          onClick={confirm}
          className="flex w-full items-center justify-center gap-2 rounded-v2-pill bg-v2-action py-3 font-[family-name:var(--font-v2-arabic)] font-semibold text-white disabled:opacity-40"
        >
          تأكيد الإجابة
        </button>
      ) : (
        <div className="space-y-3">
          <div
            className={[
              'rounded-v2-row px-3 py-3 font-[family-name:var(--font-v2-arabic)] text-sm',
              correct ? 'bg-v2-highlight-fill text-v2-success' : 'bg-v2-paper-deep text-v2-attention',
            ].join(' ')}
          >
            {correct ? 'صح!' : 'قريب جدًا!'}
            {!correct && model ? (
              <p className="mt-2" dir="ltr">
                <span className="font-[family-name:var(--font-v2-display)] text-base text-v2-primary">
                  {model}
                </span>
                <span className="ms-2 inline-block align-middle">
                  <AudioButton text={model} lang="pt" size="chip" />
                </span>
              </p>
            ) : null}
          </div>
          {!correct && tip ? (
            <NoteCard>
              <RichText segments={tip} />
            </NoteCard>
          ) : !correct ? (
            <NoteCard>
              في البرتغالية الأوروبية، الضمير بييجي بعد الفعل مربوط بشرطة.
            </NoteCard>
          ) : null}
        </div>
      )}
    </div>
  );
}
