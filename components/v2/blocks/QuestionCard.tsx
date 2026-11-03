'use client';

import { useMemo, useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { RichText } from '@/components/v2/RichText';
import type { Item } from '@/lib/v2/content/items';
import type { Question } from '@/lib/v2/content/lesson';
import type { RtSegment } from '@/lib/v2/content/rt';
import { itemTargetText } from '@/lib/v2/render/speechTarget';
import {
  isOpenWriteType,
  isSpeakingType,
} from '@/lib/v2/generation/lesson/questionTypes';

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

function promptEgText(prompt: unknown): RtSegment[] | null {
  if (Array.isArray(prompt)) return asRt(prompt);
  const rec = promptRecord(prompt);
  if (rec && typeof rec.eg === 'string') {
    return [{ text: rec.eg, lang: 'eg' }];
  }
  return null;
}

export type QuestionAnswerMeta = {
  text?: string;
  /** Speaking self-rate — do not count for SRS. */
  self_rated?: boolean;
  skip_srs?: boolean;
};

/**
 * Shared question UI. onAnswer(optionIndex, correct, meta?):
 * - MCQ: optionIndex is the chosen option
 * - build_sentence: optionIndex 1 = correct order, 0 = wrong (page_quiz)
 * - write/speak: optionIndex -1, meta.text set
 */
export function QuestionCard({
  question,
  items,
  onAnswer,
}: {
  question: Question;
  items: ReadonlyMap<string, Item>;
  onAnswer: (
    optionIndex: number,
    correct: boolean,
    meta?: QuestionAnswerMeta,
  ) => void;
}) {
  const type = String(question.type ?? '');
  const isTiles = type === 'build_sentence';
  const isWrite = isOpenWriteType(type);
  const isSpeak = isSpeakingType(type);
  const isMcq = !isTiles && !isWrite && !isSpeak;

  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [tileOrder, setTileOrder] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [selfRating, setSelfRating] = useState<'good' | 'hard' | null>(null);

  const prompt = promptRecord(question.prompt);
  const promptRt = asRt(question.prompt) ?? promptEgText(question.prompt);
  const sentence = asRt(prompt?.sentence);
  const meaning = asRt(prompt?.meaning);
  const audioRef = typeof prompt?.audio_ref === 'string' ? prompt.audio_ref : null;
  const audioItem = audioRef ? items.get(audioRef) : undefined;
  const audioText = itemTargetText(audioItem ?? undefined);
  const options = (question.options ?? [])
    .map((option) => asRt(option))
    .filter((option): option is RtSegment[] => option !== null);
  const tiles = useMemo(() => {
    const raw = (question as { tiles?: unknown }).tiles;
    if (Array.isArray(raw) && raw.every((t) => typeof t === 'string')) {
      return raw as string[];
    }
    return options.map((o) => o.map((s) => s.text).join(''));
  }, [question, options]);
  const answerIndex = typeof question.answer === 'number' ? question.answer : null;
  const answerOrder = Array.isArray(question.answer)
    ? (question.answer as number[])
    : null;
  const accepted = Array.isArray(question.accepted)
    ? (question.accepted as string[])
    : [];
  const modelAnswer = accepted[0] ?? '';

  const feedback =
    submitted && correct
      ? asRt(question.feedback_eg)
      : submitted && picked !== null
        ? asRt(question.why_wrong_eg?.[picked] ?? null)
        : null;

  function finishMcq(index: number) {
    if (picked !== null) return;
    const ok = answerIndex !== null && index === answerIndex;
    setPicked(index);
    setSubmitted(true);
    setCorrect(ok);
    onAnswer(index, ok);
  }

  function toggleTile(idx: number) {
    if (submitted) return;
    setTileOrder((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    );
  }

  function submitTiles() {
    if (submitted || !answerOrder) return;
    const ok =
      tileOrder.length === answerOrder.length &&
      tileOrder.every((v, i) => v === answerOrder[i]);
    setSubmitted(true);
    setCorrect(ok);
    // page_quiz convention: 1 = correct, 0 = wrong
    onAnswer(ok ? 1 : 0, ok);
  }

  function normalize(s: string): string {
    return s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[?!.,]/g, '')
      .trim()
      .toLowerCase();
  }

  function submitWrite() {
    if (submitted || !text.trim()) return;
    const ok = accepted.some((a) => normalize(a) === normalize(text));
    setSubmitted(true);
    setCorrect(ok);
    onAnswer(-1, ok, { text: text.trim() });
  }

  function submitSpeakSelf(rating: 'good' | 'hard') {
    if (submitted) return;
    setSelfRating(rating);
    setSubmitted(true);
    const ok = rating === 'good';
    setCorrect(ok);
    onAnswer(-1, ok, {
      text: modelAnswer,
      self_rated: true,
      skip_srs: true,
    });
  }

  return (
    <div className="rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]">
      {audioText ? (
        <div className="mb-2">
          <AudioButton text={audioText} lang="pt" label="اسمع" />
        </div>
      ) : null}
      {promptRt ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink">
          <RichText segments={promptRt} />
        </p>
      ) : null}
      {sentence ? (
        <p className="mt-2 text-lg" dir="ltr">
          <RichText segments={sentence} />
        </p>
      ) : null}
      {meaning ? (
        <p className="mt-1 text-sm text-v2-ink-muted">
          <RichText segments={meaning} />
        </p>
      ) : null}

      {isMcq ? (
        <div className="mt-3 flex flex-col gap-2">
          {options.map((option, index) => {
            const chosen = picked === index;
            const showCorrect = picked !== null && index === answerIndex;
            return (
              <button
                key={index}
                type="button"
                disabled={picked !== null}
                onClick={() => finishMcq(index)}
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
      ) : null}

      {isTiles ? (
        <div className="mt-3 space-y-3">
          <div className="flex min-h-12 flex-wrap gap-2 rounded-v2-row border border-dashed border-v2-rule bg-white p-2">
            {tileOrder.map((ti) => (
              <button
                key={`sel-${ti}`}
                type="button"
                disabled={submitted}
                onClick={() => toggleTile(ti)}
                className="rounded-v2-chip bg-v2-primary px-2 py-1 text-sm text-white"
                dir="ltr"
              >
                {tiles[ti]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {tiles.map((t, i) =>
              tileOrder.includes(i) ? null : (
                <button
                  key={`tile-${i}`}
                  type="button"
                  disabled={submitted}
                  onClick={() => toggleTile(i)}
                  className="rounded-v2-chip border border-v2-rule bg-white px-2 py-1 text-sm"
                  dir="ltr"
                >
                  {t}
                </button>
              ),
            )}
          </div>
          {!submitted ? (
            <button
              type="button"
              disabled={tileOrder.length === 0}
              onClick={submitTiles}
              className="rounded-v2-pill bg-v2-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              تأكيد
            </button>
          ) : null}
        </div>
      ) : null}

      {isWrite ? (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            dir="ltr"
            value={text}
            disabled={submitted}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitWrite();
            }}
            className="w-full rounded-v2-row border border-v2-rule bg-white px-3 py-2 text-base"
            placeholder="اكتب بالبرتغالي…"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <div className="flex flex-wrap gap-1" dir="ltr">
            {['á', 'à', 'â', 'ã', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú', 'ç'].map(
              (ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={submitted}
                  onClick={() => setText((t) => t + ch)}
                  className="rounded border border-v2-rule bg-white px-2 py-1 text-sm"
                >
                  {ch}
                </button>
              ),
            )}
          </div>
          {!submitted ? (
            <button
              type="button"
              disabled={!text.trim()}
              onClick={submitWrite}
              className="rounded-v2-pill bg-v2-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              تأكيد
            </button>
          ) : null}
        </div>
      ) : null}

      {isSpeak ? (
        <div className="mt-3 space-y-3">
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            سجّل واسمع نفسك
          </p>
          {modelAnswer ? (
            <p className="text-lg" dir="ltr">
              {modelAnswer}
            </p>
          ) : null}
          {!submitted ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => submitSpeakSelf('good')}
                className="rounded-v2-pill bg-v2-coral px-4 py-2 text-sm font-semibold text-white"
              >
                تمام
              </button>
              <button
                type="button"
                onClick={() => submitSpeakSelf('hard')}
                className="rounded-v2-pill border border-v2-rule bg-white px-4 py-2 text-sm"
              >
                صعب
              </button>
            </div>
          ) : (
            <p className="text-sm text-v2-ink-muted">
              {selfRating === 'good' ? 'تمام — مش هتحسب في المراجعة لسه' : 'هنرجع لها'}
            </p>
          )}
        </div>
      ) : null}

      {submitted && correct !== null && !isSpeak ? (
        <p
          className={[
            'mt-3 font-[family-name:var(--font-v2-arabic)] text-sm',
            correct ? 'text-v2-success' : 'text-v2-attention',
          ].join(' ')}
        >
          {correct ? 'صح' : modelAnswer ? `الإجابة: ${modelAnswer}` : 'غلط'}
        </p>
      ) : null}
      {feedback ? (
        <p className="mt-2 text-sm text-v2-ink">
          <RichText segments={feedback} />
        </p>
      ) : null}
    </div>
  );
}
