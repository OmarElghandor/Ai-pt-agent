'use client';

import { useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { RichText } from '@/components/v2/RichText';
import type { Item } from '@/lib/v2/content/items';
import type { Question } from '@/lib/v2/content/lesson';
import type { RtSegment } from '@/lib/v2/content/rt';
import { itemTargetText } from '@/lib/v2/render/speechTarget';

function asRt(value: unknown): RtSegment[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ok = value.every(
    (seg) =>
      seg &&
      typeof seg === 'object' &&
      typeof (seg as RtSegment).text === 'string' &&
      typeof (seg as RtSegment).lang === 'string',
  );
  return ok ? (value as RtSegment[]) : null;
}

function promptRecord(prompt: unknown): Record<string, unknown> | null {
  if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) return null;
  return prompt as Record<string, unknown>;
}

export function QuestionCard({
  question,
  items,
  onAnswer,
}: {
  question: Question;
  items: ReadonlyMap<string, Item>;
  onAnswer: (optionIndex: number, correct: boolean) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const prompt = promptRecord(question.prompt);
  const sentence = asRt(prompt?.sentence);
  const meaning = asRt(prompt?.meaning);
  const audioRef = typeof prompt?.audio_ref === 'string' ? prompt.audio_ref : null;
  const audioItem = audioRef ? items.get(audioRef) : undefined;
  const audioText = itemTargetText(audioItem ?? undefined);
  const options = (question.options ?? [])
    .map((option) => asRt(option))
    .filter((option): option is RtSegment[] => option !== null);
  const answerIndex = typeof question.answer === 'number' ? question.answer : null;
  const correct = picked !== null && answerIndex !== null && picked === answerIndex;
  const feedback =
    picked === null
      ? null
      : correct
        ? asRt(question.feedback_eg)
        : asRt(question.why_wrong_eg?.[picked] ?? null);

  return (
    <div className="rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]">
      {audioText ? (
        <div className="mb-2">
          <AudioButton text={audioText} lang="pt" label="اسمع" />
        </div>
      ) : null}
      {sentence ? (
        <p className="text-lg" dir="ltr">
          <RichText segments={sentence} />
        </p>
      ) : null}
      {meaning ? (
        <p className="mt-1 text-sm text-v2-ink-muted">
          <RichText segments={meaning} />
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        {options.map((option, index) => {
          const chosen = picked === index;
          const showCorrect = picked !== null && index === answerIndex;
          return (
            <button
              key={index}
              type="button"
              disabled={picked !== null}
              onClick={() => {
                setPicked(index);
                onAnswer(index, answerIndex !== null && index === answerIndex);
              }}
              className={[
                'rounded-v2-row border px-3 py-2 text-start',
                showCorrect
                  ? 'border-v2-success bg-v2-highlight-fill'
                  : chosen
                    ? 'v2-shake border-v2-attention bg-v2-highlight-fill'
                    : 'border-v2-rule bg-white',
              ].join(' ')}
            >
              <RichText segments={option} />
            </button>
          );
        })}
      </div>
      {feedback ? (
        <p className="mt-3 text-sm text-v2-ink">
          <RichText segments={feedback} />
        </p>
      ) : null}
    </div>
  );
}
