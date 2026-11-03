'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { RichText } from '@/components/v2/RichText';
import { useMicRecorder } from '@/hooks/useMicRecorder';
import { itemTargetText } from '@/lib/v2/render/speechTarget';
import { asRt, promptRecord, type QuestionViewProps } from './types';

type Phase = 'prompt' | 'recording' | 'review';

/** Speaking / read_aloud — designs 12c-q06, q08, q09. Self-rate, no SRS. */
export function SpeakQuestion({
  question,
  items,
  graded,
  onGrade,
  draftText = '',
  onDraftText,
}: QuestionViewProps) {
  const type = String(question.type ?? '');
  const isReadAloud = type === 'read_aloud';
  const isReply = type === 'reply_speak' || type === 'say_it';
  const mic = useMicRecorder({ language: 'pt-PT' });
  const [phase, setPhase] = useState<Phase>('prompt');
  const [writeMode, setWriteMode] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const accepted = Array.isArray(question.accepted)
    ? (question.accepted as string[])
    : [];
  const model = accepted[0] ?? '';
  const testedId = Array.isArray(question.tests)
    ? String(question.tests[0] ?? '')
    : '';
  const tested = testedId ? items.get(testedId) : undefined;
  const say =
    tested && 'say' in tested && typeof tested.say === 'string'
      ? tested.say
      : null;
  const prompt = promptRecord(question.prompt);
  const promptRt = asRt(question.prompt);
  const audioRef =
    typeof prompt?.audio_ref === 'string' ? prompt.audio_ref : null;
  const promptAudio = audioRef
    ? itemTargetText(items.get(audioRef) ?? undefined)
    : null;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  async function startRec() {
    if (graded) return;
    setElapsed(0);
    await mic.start();
    setPhase('recording');
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }

  async function finishRec() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const blob = await mic.stopAndGetBlob();
    if (!blob) {
      setPhase('prompt');
      return;
    }
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(URL.createObjectURL(blob));
    setPhase('review');
  }

  function cancelRec() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mic.cancel();
    setPhase('prompt');
    setElapsed(0);
  }

  function rate(rating: 'hard' | 'near' | 'exact') {
    if (graded || !onGrade) return;
    onGrade({
      optionIndex: -1,
      correct: rating === 'exact' || rating === 'near',
      meta: {
        self_rated: true,
        skip_srs: true,
        rating,
        text: model,
      },
    });
  }

  function submitWrite() {
    if (graded || !onGrade || !draftText.trim()) return;
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[?!.,]/g, '')
        .trim()
        .toLowerCase();
    const ok = accepted.some((a) => norm(a) === norm(draftText));
    onGrade({
      optionIndex: -1,
      correct: ok,
      meta: { text: draftText.trim(), skip_srs: false },
    });
  }

  const title = isReadAloud
    ? 'اقرا الجملة بصوت عالي'
    : isReply
      ? 'رد عليها وعرف نفسك'
      : 'قول الجملة';

  if (writeMode) {
    return (
      <div className="space-y-4">
        <h2 className="font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-primary">
          اكتب الرد
        </h2>
        <input
          type="text"
          dir="ltr"
          value={draftText}
          disabled={graded}
          onChange={(e) => onDraftText?.(e.target.value)}
          className="w-full rounded-v2-row border border-v2-rule bg-white px-3 py-3"
          placeholder="…"
        />
        {!graded ? (
          <button
            type="button"
            disabled={!draftText.trim()}
            onClick={submitWrite}
            className="w-full rounded-v2-pill bg-v2-action py-3 font-[family-name:var(--font-v2-arabic)] font-semibold text-white disabled:opacity-40"
          >
            تأكيد
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-primary">
          {phase === 'review' ? 'قارن نطقك بالنطق الأصلي' : title}
        </h2>
        {promptRt && phase !== 'review' ? (
          <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            <RichText segments={promptRt} />
          </p>
        ) : (
          <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            {phase === 'review'
              ? 'اسمع تسجيلك وقارنه بالجملة النموذجية'
              : 'اضغط على المايك وانطق بوضوح'}
          </p>
        )}
      </div>

      {phase === 'prompt' || phase === 'recording' ? (
        <>
          {promptAudio ? (
            <div className="rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]">
              <p className="mb-2 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
                سؤال
              </p>
              <AudioButton text={promptAudio} lang="pt" label="اسمع" />
              <p className="mt-2 text-lg" dir="ltr">
                «{promptAudio}»
              </p>
            </div>
          ) : null}

          {(isReadAloud || model) && (
            <div
              className="rounded-v2-card bg-v2-card p-4 text-center shadow-[var(--shadow-v2-soft)]"
              dir="ltr"
            >
              <p className="font-[family-name:var(--font-v2-display)] text-2xl text-v2-primary">
                {model || itemTargetText(tested)}
              </p>
              {say ? (
                <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted" dir="rtl">
                  النطق المكتوب: {say}
                </p>
              ) : null}
              {model ? (
                <div className="mt-3 flex justify-center">
                  <AudioButton text={model} lang="pt" label="اسمعها الأول" />
                </div>
              ) : null}
            </div>
          )}

          {phase === 'recording' ? (
            <div className="rounded-v2-card bg-v2-paper-deep p-4 text-center">
              <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-attention">
                جاري التسجيل الصوتي...
              </p>
              <p className="mt-1 font-[family-name:var(--font-v2-ui)] text-2xl tabular-nums">
                0:{String(elapsed).padStart(2, '0')}
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={cancelRec}
                  className="rounded-v2-pill border border-v2-rule bg-white px-4 py-2 font-[family-name:var(--font-v2-arabic)] text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => void finishRec()}
                  className="rounded-v2-pill bg-v2-action px-4 py-2 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-white"
                >
                  خلّصت كلام
                </button>
              </div>
            </div>
          ) : !graded ? (
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => void startRec()}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-v2-action text-2xl text-white shadow-[var(--shadow-v2-soft)]"
                aria-label="سجّل"
              >
                ●
              </button>
              <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                اضغط على المايك للتسجيل
              </p>
              <button
                type="button"
                onClick={() => setWriteMode(true)}
                className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-action underline"
              >
                مش قادر أتكلم دلوقتي (التبديل للكتابة)
              </button>
            </div>
          ) : null}
          {mic.error ? (
            <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-attention">
              {mic.error}
            </p>
          ) : null}
        </>
      ) : null}

      {phase === 'review' && !graded ? (
        <div className="space-y-4">
          <div className="rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]">
            <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              النطق النموذجي
            </p>
            <p className="mt-1 text-xl" dir="ltr">
              {model}
            </p>
            {model ? (
              <div className="mt-2">
                <AudioButton text={model} lang="pt" label="اسمع" />
              </div>
            ) : null}
          </div>
          <div className="rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]">
            <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              تسجيلك الصوتي
            </p>
            {blobUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls src={blobUrl} className="mt-2 w-full" />
            ) : null}
            <button
              type="button"
              onClick={() => {
                setPhase('prompt');
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                setBlobUrl(null);
              }}
              className="mt-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-action"
            >
              إعادة التسجيل مرة تانية
            </button>
          </div>
          <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
            حاسس نطقك كان عامل إزاي؟
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['hard', 'لسه'],
                ['near', 'قريب'],
                ['exact', 'زيه بالظبط'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => rate(key)}
                className="rounded-v2-card border border-v2-rule bg-white px-2 py-3 font-[family-name:var(--font-v2-arabic)] text-sm"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            التقييم ده مش بيتحسب في المراجعة لحد ما نشغل تصحيح الصوت الآلي.
          </p>
        </div>
      ) : null}
    </div>
  );
}
