'use client';

import { useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { Icon } from '@/components/v2/Icon';
import { ImageSlot } from '@/components/v2/ImageSlot';
import { RichText } from '@/components/v2/RichText';
import { verbClass } from '@/lib/v2/content/conjugations/regular';
import { parseFormId } from '@/lib/v2/content/conjugations/formId';
import type { Item } from '@/lib/v2/content/items';
import type { RtGroup, RtSegment } from '@/lib/v2/content/rt';
import type { FormView } from '@/lib/v2/render/forms';
import { itemMeaning, itemTargetText } from '@/lib/v2/render/speechTarget';
import { useBlockChrome } from './chrome';

const ENDING_CLASS: Record<string, string> = {
  ar: 'text-v2-verb-ar-text',
  er: 'text-v2-verb-er',
  ir: 'text-v2-verb-ir-text',
};

/** Example / table tile — fixed 56×56 ImageSlot (keys stay sr-only until URLs exist). */
export function MediaTile({ image, icon }: { image?: string; icon?: string }) {
  return (
    <>
      <ImageSlot variant="tile" placeholderIcon={icon || 'image'} />
      {image ? <span className="sr-only">{image}</span> : null}
    </>
  );
}

export function VerbForm({
  form,
  split,
  coverEndings,
  coverTl = false,
}: {
  form: FormView;
  split: boolean;
  coverEndings: boolean;
  coverTl?: boolean;
}) {
  const [peek, setPeek] = useState(false);
  const lemma = parseFormId(form.id)?.lemma ?? '';
  const cls = verbClass(lemma);
  const endingClass = form.irregular
    ? 'text-v2-verb-irregular'
    : ENDING_CLASS[cls ?? ''] ?? 'text-v2-ink';
  const hidden = (coverTl || coverEndings) && !peek;
  const coverClass = hidden ? 'inline-block border-b border-dashed border-current opacity-0' : '';

  const irregularWhole = form.irregular && !split && !coverTl;
  const showSplit = split && !coverTl;
  const body = irregularWhole ? (
    <span dir="ltr" className="inline-flex items-center gap-0.5 font-[family-name:var(--font-v2-target)] text-lg text-v2-verb-irregular">
      <span className={coverClass}>{form.tl}</span>
      <Icon name="bolt" size={20} className="text-v2-verb-irregular" />
    </span>
  ) : showSplit ? (
    <span dir="ltr" className="inline-flex items-center gap-0.5 font-[family-name:var(--font-v2-target)] text-lg">
      <span className="text-v2-ink-muted">{form.stem}</span>
      <span className={[endingClass, coverClass].filter(Boolean).join(' ')}>{form.ending}</span>
      {form.irregular ? (
        <Icon name="bolt" size={20} className="text-v2-verb-irregular" />
      ) : null}
    </span>
  ) : (
    <span dir="ltr" className="font-[family-name:var(--font-v2-target)] text-lg text-v2-ink">
      <span className={coverClass}>{form.tl}</span>
    </span>
  );

  if (!coverEndings && !coverTl) return body;
  return (
    <button type="button" className="text-start" onClick={() => setPeek((open) => !open)}>
      {body}
    </button>
  );
}

function markedSegments(
  tl: string,
  marks?: { text: string; group: RtGroup }[],
): RtSegment[] {
  if (!marks?.length) return [{ text: tl, lang: 'tl' }];
  let rest = tl;
  const out: RtSegment[] = [];
  for (const mark of marks) {
    const idx = rest.toLowerCase().indexOf(mark.text.toLowerCase());
    if (idx < 0) continue;
    if (idx > 0) out.push({ text: rest.slice(0, idx), lang: 'tl' });
    out.push({
      text: rest.slice(idx, idx + mark.text.length),
      lang: 'tl',
      group: mark.group,
      bold: true,
    });
    rest = rest.slice(idx + mark.text.length);
  }
  if (rest) out.push({ text: rest, lang: 'tl' });
  return out.length ? out : [{ text: tl, lang: 'tl' }];
}

export function ContentLine({
  item,
  label,
  media,
  onPlay,
  layout = 'row',
}: {
  item: Item | undefined;
  label?: RtSegment[];
  media?: { icon?: string; image?: string };
  onPlay?: (text: string, lang: 'pt' | 'ar') => void;
  /** Compare columns are ~170px. Stack so the sentence keeps the full width. */
  layout?: 'row' | 'stack';
}) {
  const chrome = useBlockChrome();
  const [peek, setPeek] = useState(false);
  const tl = itemTargetText(item);
  const ar = itemMeaning(item);
  const marks = item && 'marks' in item ? item.marks : undefined;
  const hideTl = chrome.cover === 'tl' && !peek;
  const hideAr = chrome.cover === 'meaning' && !peek;
  const hiddenClass = 'opacity-0';
  const play = () => {
    if (hideTl) {
      setPeek(true);
      return;
    }
    if (tl) onPlay?.(tl, 'pt');
  };

  const labelLine = label?.length ? (
    <p dir="rtl" className="text-start font-[family-name:var(--font-v2-arabic)] text-[11px] font-bold text-v2-ink">
      <RichText segments={label} />
    </p>
  ) : null;

  const sentence = tl ? (
    <button
      type="button"
      dir="ltr"
      className={[
        'mt-0.5 block w-full text-start font-semibold leading-snug text-v2-ink',
        layout === 'stack' ? 'whitespace-nowrap text-[13px]' : 'text-[15px]',
      ].join(' ')}
      onClick={play}
    >
      <span className={hideTl ? 'inline-block border-b border-dashed border-v2-ink-muted' : undefined}>
        <span className={hideTl ? hiddenClass : undefined}>
          <RichText segments={markedSegments(tl, marks)} />
        </span>
      </span>
    </button>
  ) : null;

  const meaning = ar ? (
    <button
      type="button"
      dir="rtl"
      className="mt-0.5 block w-full text-start font-[family-name:var(--font-v2-arabic)] text-[13px] leading-5 text-v2-ink-muted"
      onClick={() => {
        if (hideAr) setPeek(true);
      }}
    >
      <span className={hideAr ? 'inline-block border-b border-dashed border-v2-ink-muted' : undefined}>
        <span className={hideAr ? hiddenClass : undefined}>{`«${ar}»`}</span>
      </span>
    </button>
  ) : null;

  const tools =
    media?.image || media?.icon || (tl && onPlay) ? (
      <div className="mt-1 flex items-center gap-1.5">
        {media?.image || media?.icon ? <MediaTile image={media.image} icon={media.icon} /> : null}
        {tl && onPlay ? <AudioButton text={tl} lang="pt" label="اسمع" /> : null}
      </div>
    ) : null;

  if (layout === 'stack') {
    return (
      <div className="min-w-0">
        {labelLine}
        {sentence}
        {meaning}
        {tools}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        {labelLine}
        {sentence}
        {meaning}
      </div>
      {tools}
    </div>
  );
}
