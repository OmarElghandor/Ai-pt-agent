'use client';

import { useEffect, useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { Icon } from '@/components/v2/Icon';
import { DemoImageGenerate } from '@/components/v2/DemoImageGenerate';
import { ImageSlot } from '@/components/v2/ImageSlot';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { ReportErrorButton } from '@/components/v2/ReportErrorButton';
import { TargetWord } from '@/components/v2/cards/TargetWord';
import { VerbPoster } from '@/components/v2/cards/VerbPoster';
import { cloudinaryDisplayUrl } from '@/lib/v2/images/cloudinaryUrl';
import type { CardFacePayload } from '@/lib/v2/decks';

export function FrontFace({
  face,
  showHint,
  onFlip,
  onHint,
}: {
  face: CardFacePayload | null;
  showHint: boolean;
  onFlip: () => void;
  onHint: () => void;
}) {
  if (!face) {
    return (
      <p className="m-auto font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        الكارت ناقص بيانات.
      </p>
    );
  }

  return (
    <div className="flex min-h-[60dvh] flex-1 flex-col">
      <div className="flex flex-[0_0_33%] flex-col items-center justify-start gap-5 pt-6">
        <TargetWord tl={face.tl} gender={face.gender} size="xl" />
        <AudioButton text={face.tl} showSlow label="اسمع" />
        {showHint && face.hint_tl ? (
          <p
            dir="ltr"
            className="max-w-full rounded-v2-row bg-v2-note/40 px-4 py-3 text-center font-[family-name:var(--font-v2-target)] text-xl font-semibold text-v2-primary"
            style={{ unicodeBidi: 'isolate' }}
          >
            {face.hint_tl}
          </p>
        ) : null}
      </div>
      <div className="mt-auto flex w-full flex-col items-center gap-3 pb-1 pt-8">
        <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          فاكر معناها؟ قولها في سرّك واقلب
        </p>
        <PrimaryButton className="w-full" onClick={onFlip}>
          اقلب
        </PrimaryButton>
        {!showHint && face.hint_tl ? (
          <button
            type="button"
            onClick={onHint}
            className="min-h-11 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-primary"
          >
            محتاج تلميح؟
          </button>
        ) : showHint ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-action">
            استخدمت تلميح
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function BackFace({
  face,
  hintUsed,
  day,
  deckId,
}: {
  face: CardFacePayload | null;
  hintUsed: boolean;
  /** Lesson day for admin image generate / report. Null hides those (custom decks). */
  day: number | null;
  /** Custom/official deck id for wrong-picture reports. */
  deckId?: string;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [picMsg, setPicMsg] = useState<string | null>(null);
  useEffect(() => {
    setImgSrc(face?.image_url ?? null);
    setPicMsg(null);
  }, [face?.item_id, face?.image_url]);
  if (!face) return null;

  async function reportWrongPicture() {
    if (!deckId || !face) return;
    const bare = deckId.replace(/^(custom|official):/, '');
    try {
      const res = await fetch(
        `/api/v2/custom-decks/${encodeURIComponent(bare)}/report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'wrong_picture',
            item_id: face.item_id,
          }),
        },
      );
      if (!res.ok) throw new Error('report');
      setPicMsg('شكراً، بلّغنا عن الصورة');
    } catch {
      setPicMsg('ما قدرناش نبلّغ دلوقتي');
    }
  }

  const showWordBlock =
    face.kind === 'word' && Boolean(face.plural || face.example);

  return (
    <div className="flex h-auto flex-col gap-4">
      <div className="space-y-1 text-center">
        <TargetWord
          tl={face.tl}
          gender={face.gender}
          size="lg"
          nounTone="ink"
        />
        {face.ar ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-xl text-v2-ink">
            {face.ar}
          </p>
        ) : null}
        {hintUsed ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-action">
            استخدمت تلميح · التقييم مقفول على صعب أو متوسط
          </p>
        ) : null}
      </div>

      <div className="relative">
        <ImageSlot variant="flashcard" src={imgSrc} />
        {day != null ? (
          <DemoImageGenerate
            body={{ kind: 'item', day, item_id: face.item_id }}
            label={imgSrc ? 'Regenerate' : 'Generate'}
            onReady={(url) =>
              setImgSrc(
                cloudinaryDisplayUrl(url, { aspect: '4:3', width: 600 }),
              )
            }
          />
        ) : null}
      </div>

      {face.kind === 'verb' && face.conjugation ? (
        <VerbPoster
          lemma={face.lemma ?? face.tl}
          verbClass={face.verbClass}
          rows={face.conjugation}
        />
      ) : null}

      {showWordBlock ? (
        <div className="flex flex-col gap-3">
          {face.plural ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
              الجمع:{' '}
              <span
                dir="ltr"
                className="font-[family-name:var(--font-v2-target)] font-semibold text-v2-ink"
                style={{ unicodeBidi: 'isolate' }}
              >
                {face.plural}
              </span>
            </p>
          ) : null}
          {face.example ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2" dir="ltr">
                <AudioButton text={face.example} label={`نطق ${face.example}`} />
                <p
                  className="min-w-0 font-[family-name:var(--font-v2-target)] text-sm text-v2-ink"
                  style={{ unicodeBidi: 'isolate' }}
                >
                  {face.example}
                </p>
              </div>
              {face.example_ar ? (
                <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                  {face.example_ar}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {face.kind === 'phrase' ? <PhraseBack face={face} /> : null}

      {day != null ? (
        <ReportErrorButton day={day} itemId={face.item_id} label="فيه غلط" />
      ) : null}

      {day == null && deckId && imgSrc ? (
        <button
          type="button"
          onClick={() => void reportWrongPicture()}
          className="min-h-11 self-start font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted underline"
        >
          الصورة غلط
        </button>
      ) : null}
      {picMsg ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
          {picMsg}
        </p>
      ) : null}
    </div>
  );
}

function PhraseBack({ face }: { face: CardFacePayload }) {
  const heard = face.role === 'heard';
  const hasSaidContext = Boolean(face.context_eg || face.replies_to_tl);
  const hasVariation = Boolean(face.variation_tl);
  if (!heard && !hasSaidContext && !hasVariation) return null;

  return (
    <div className="flex flex-col gap-2">
      {heard ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
          هتسمعها
        </p>
      ) : (
        <>
          {face.context_eg ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
              امتى تقولها: {face.context_eg}
            </p>
          ) : null}
          {face.replies_to_tl ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
              هتسمع:{' '}
              <span
                dir="ltr"
                className="font-[family-name:var(--font-v2-target)] font-semibold text-v2-primary"
                style={{ unicodeBidi: 'isolate' }}
              >
                {face.replies_to_tl}
              </span>
            </p>
          ) : null}
        </>
      )}
      {face.variation_tl ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
          شكل تاني:{' '}
          <span
            dir="ltr"
            className="font-[family-name:var(--font-v2-target)] font-semibold text-v2-primary"
            style={{ unicodeBidi: 'isolate' }}
          >
            {face.variation_tl}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function RateBtn({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 flex-col items-center justify-center rounded-xl bg-v2-paper-deep py-3 text-v2-primary disabled:opacity-40"
    >
      <Icon name={icon} size={24} />
      <span className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold">
        {label}
      </span>
    </button>
  );
}
