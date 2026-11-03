'use client';

import { AudioButton } from '@/components/v2/AudioButton';
import { RichText } from '@/components/v2/RichText';
import { itemTargetText } from '@/lib/v2/render/speechTarget';
import type { Item } from '@/lib/v2/content/items';
import {
  asRt,
  itemImageUrl,
  optionLabel,
  promptRecord,
  type QuestionViewProps,
} from './types';
import { ChoiceQuestion } from './ChoiceQuestion';

function imageCandidates(
  question: QuestionViewProps['question'],
  items: ReadonlyMap<string, Item>,
): { id: string; url: string; label: string }[] {
  const rawRefs = (question as Record<string, unknown>).image_refs;
  const refs = Array.isArray(rawRefs)
    ? rawRefs.filter((id): id is string => typeof id === 'string')
    : [];
  const tests = Array.isArray(question.tests) ? question.tests.map(String) : [];
  const ids = [...refs, ...tests];
  // Peer distractors from same-type items with images
  const tested = tests[0] ? items.get(tests[0]) : undefined;
  if (tested) {
    for (const [id, item] of items) {
      if (id === tested.id) continue;
      if (item.type !== tested.type) continue;
      if (itemImageUrl(item)) ids.push(id);
      if (ids.length >= 8) break;
    }
  }
  const out: { id: string; url: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const item = items.get(id);
    const url = itemImageUrl(item);
    if (!url) continue;
    out.push({
      id,
      url,
      label: itemTargetText(item) || id,
    });
    if (out.length >= 4) break;
  }
  return out;
}

/** Listen → pick image (12c-q02). Falls back to fallback_type UI when images missing. */
export function ListenPickImage(props: QuestionViewProps) {
  const { question, items, graded, selectedIndex, onSelect } = props;
  const images = imageCandidates(question, items);
  const prompt = promptRecord(question.prompt);
  const audioRef =
    typeof prompt?.audio_ref === 'string'
      ? prompt.audio_ref
      : Array.isArray(question.tests)
        ? String(question.tests[0] ?? '')
        : null;
  const audioItem = audioRef ? items.get(audioRef) : undefined;
  const audioText = itemTargetText(audioItem ?? undefined);
  const promptRt = asRt(question.prompt);
  const fallbackType =
    typeof (question as { fallback_type?: unknown }).fallback_type === 'string'
      ? String((question as { fallback_type: string }).fallback_type)
      : 'listen_meaning';

  if (images.length < 2) {
    // Player uses fallback_type until image_ref is ready — no regen needed
    return (
      <ChoiceQuestion
        {...props}
        question={{ ...question, type: fallbackType }}
      />
    );
  }

  const answerId = Array.isArray(question.tests)
    ? String(question.tests[0] ?? '')
    : '';
  // Prefer matching answer by tested item id in image grid
  const answerIndex = Math.max(
    0,
    images.findIndex((img) => img.id === answerId),
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="font-[family-name:var(--font-v2-ui)] text-xs text-v2-ink-muted">
          البرتغالية الأوروبية
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-primary">
          اسمع واختار الصورة
        </h2>
        <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          اضغط على زر الصوت عشان تسمع الكلمة بوضوح
        </p>
        {promptRt ? (
          <p className="mt-2 text-sm text-v2-ink-muted">
            <RichText segments={promptRt} />
          </p>
        ) : null}
      </div>

      {audioText ? (
        <div className="rounded-v2-card bg-v2-paper-deep px-4 py-3">
          <AudioButton text={audioText} lang="pt" label="اسمع" showSlow />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {images.map((img, index) => {
          const chosen = selectedIndex === index;
          const isCorrect = graded && index === answerIndex;
          const isWrong = graded && chosen && index !== answerIndex;
          return (
            <button
              key={img.id}
              type="button"
              disabled={graded}
              onClick={() => onSelect(index)}
              className={[
                'relative aspect-square overflow-hidden rounded-v2-card border-2 bg-v2-card',
                isCorrect || (chosen && !graded)
                  ? 'border-v2-primary'
                  : isWrong
                    ? 'border-v2-attention'
                    : 'border-transparent',
              ].join(' ')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.label}
                className="h-full w-full object-cover"
              />
              {(isCorrect || (chosen && !graded)) && (
                <span className="absolute end-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-v2-primary text-xs text-white">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Expose answer index via data for shell confirm — shell uses selectedIndex vs question.answer;
          for image grid we remap: store correct index as answerIndex when confirming. */}
      <span className="sr-only" data-answer-index={answerIndex}>
        {optionLabel(question.options?.[answerIndex])}
      </span>
    </div>
  );
}

/** Resolve whether a selected image index is correct. */
export function listenPickImageCorrect(
  question: QuestionViewProps['question'],
  items: ReadonlyMap<string, Item>,
  selectedIndex: number | null,
): boolean {
  if (selectedIndex === null) return false;
  const images = imageCandidates(question, items);
  if (images.length < 2) {
    return selectedIndex === question.answer;
  }
  const answerId = Array.isArray(question.tests)
    ? String(question.tests[0] ?? '')
    : '';
  const answerIndex = Math.max(
    0,
    images.findIndex((img) => img.id === answerId),
  );
  return selectedIndex === answerIndex;
}
