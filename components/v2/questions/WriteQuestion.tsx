'use client';

import { useMemo } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { RichText } from '@/components/v2/RichText';
import { itemTargetText } from '@/lib/v2/render/speechTarget';
import {
  asRt,
  itemImageUrl,
  promptRecord,
  type QuestionViewProps,
} from './types';

const ACCENTS = ['á', 'à', 'â', 'ã', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú', 'ç'];

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[?!.,]/g, '')
    .trim()
    .toLowerCase();
}

/** Dictation / translate / describe image — 12c-q04 / q05. */
export function WriteQuestion({
  question,
  items,
  graded,
  draftText = '',
  onDraftText,
  onGrade,
}: QuestionViewProps) {
  const type = String(question.type ?? '');
  const isDescribe = type === 'describe_image_write';
  const isDictation = type === 'dictation';
  const prompt = promptRecord(question.prompt);
  const promptRt = asRt(question.prompt);
  const audioRef =
    typeof prompt?.audio_ref === 'string' ? prompt.audio_ref : null;
  const audioItem = audioRef ? items.get(audioRef) : undefined;
  const audioText = itemTargetText(audioItem ?? undefined);
  const testedId = Array.isArray(question.tests)
    ? String(question.tests[0] ?? '')
    : '';
  const tested = testedId ? items.get(testedId) : undefined;
  const imageUrl = itemImageUrl(tested);

  const accepted = Array.isArray(question.accepted)
    ? (question.accepted as string[])
    : [];
  const model = accepted[0] ?? '';

  const wordBank = useMemo(() => {
    if (!isDescribe) return [] as string[];
    const bank: string[] = [];
    if (tested && 'tl' in tested && typeof tested.tl === 'string') {
      bank.push(...tested.tl.split(/\s+/).filter(Boolean).slice(0, 4));
    }
    for (const [, item] of items) {
      if (item.id === testedId) continue;
      if (item.type !== 'word' && item.type !== 'phrase') continue;
      const tl = itemTargetText(item);
      if (tl && !bank.includes(tl)) bank.push(tl);
      if (bank.length >= 6) break;
    }
    return bank.slice(0, 6);
  }, [isDescribe, items, tested, testedId]);

  const title = isDictation
    ? 'اسمع واكتب اللي سمعته'
    : isDescribe
      ? 'اكتب جملة واحدة عن الصورة'
      : 'اكتب بالبرتغالي';
  const isFillBlank = type === 'fill_blank_write';
  const hintText =
    typeof (question as { hint?: unknown }).hint === 'string'
      ? String((question as unknown as { hint: string }).hint)
      : '';

  function submit() {
    if (graded || !onGrade || !draftText.trim()) return;
    const ok = accepted.some((a) => normalize(a) === normalize(draftText));
    onGrade({
      optionIndex: -1,
      correct: ok,
      meta: { text: draftText.trim() },
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-primary">
          {title}
        </h2>
        {promptRt ? (
          <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            <RichText segments={promptRt} />
          </p>
        ) : (
          <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            {isDictation
              ? 'ركز في نطق الحروف والتشكيل الصوتي البرتغالي'
              : isDescribe
                ? 'استخدم الكلمات المساعدة لو حبيت'
                : null}
          </p>
        )}
        {isFillBlank && hintText ? (
          <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            تلميح: {hintText}
          </p>
        ) : null}
      </div>

      {isDictation && audioText ? (
        <div className="rounded-v2-card bg-v2-paper-deep px-4 py-3">
          <AudioButton text={audioText} lang="pt" label="اسمع" showSlow />
        </div>
      ) : null}

      {isDescribe && imageUrl ? (
        <div className="overflow-hidden rounded-v2-card bg-v2-card shadow-[var(--shadow-v2-soft)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="h-40 w-full object-cover" />
        </div>
      ) : null}

      {wordBank.length ? (
        <div>
          <p className="mb-2 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            بنك الكلمات المساعدة:
          </p>
          <div className="flex flex-wrap gap-2" dir="ltr">
            {wordBank.map((w) => (
              <button
                key={w}
                type="button"
                disabled={graded}
                onClick={() =>
                  onDraftText?.(
                    draftText ? `${draftText.trim()} ${w}` : w,
                  )
                }
                className="rounded-v2-chip border border-v2-rule bg-white px-2.5 py-1 text-sm"
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
          الجملة بالبرتغالية:
        </p>
        <input
          type="text"
          dir="ltr"
          value={draftText}
          disabled={graded}
          onChange={(e) => onDraftText?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          className="w-full rounded-v2-row border border-v2-rule bg-white px-3 py-3 text-base"
          placeholder="…"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <div className="mt-2 flex flex-wrap gap-1" dir="ltr">
          {ACCENTS.map((ch) => (
            <button
              key={ch}
              type="button"
              disabled={graded}
              onClick={() => onDraftText?.(draftText + ch)}
              className="rounded border border-v2-rule bg-white px-2 py-1 text-sm"
            >
              {ch}
            </button>
          ))}
          {!graded && draftText ? (
            <button
              type="button"
              onClick={() => onDraftText?.('')}
              className="ms-auto font-[family-name:var(--font-v2-arabic)] text-xs text-v2-action"
            >
              مسح
            </button>
          ) : null}
        </div>
      </div>

      {!graded ? (
        <button
          type="button"
          disabled={!draftText.trim()}
          onClick={submit}
          className="flex w-full items-center justify-center rounded-v2-pill bg-v2-action py-3 font-[family-name:var(--font-v2-arabic)] font-semibold text-white disabled:opacity-40"
        >
          تأكيد الإجابة
        </button>
      ) : (
        <div className="rounded-v2-row bg-v2-paper-deep px-3 py-3 font-[family-name:var(--font-v2-arabic)] text-sm">
          {accepted.some((a) => normalize(a) === normalize(draftText)) ? (
            <p className="text-v2-success">صح!</p>
          ) : (
            <p className="text-v2-attention" dir="ltr">
              الإجابة: {model}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
