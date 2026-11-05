import type { BubbleTone } from './CharacterBubble';

type Props = {
  tl: string;
  tone?: BubbleTone;
  /** Soft draft look (text-mode preview) — Calm only. */
  draft?: boolean;
};

export function LearnerBubble({ tl, tone = 'warm', draft }: Props) {
  if (tone === 'calm') {
    return (
      <div className="flex max-w-[85%] flex-col items-end self-end">
        <div
          className={[
            'rounded-[20px] rounded-se-md px-3.5 py-2.5 shadow-[var(--ft-shadow-soft)]',
            draft
              ? 'bg-[var(--ft-success-soft)] text-[var(--ft-ink)] ring-1 ring-[var(--ft-border)]'
              : 'bg-[var(--ft-sage)] text-[var(--ft-on-sage)]',
          ].join(' ')}
        >
          {draft ? (
            <p className="mb-1 font-[family-name:var(--font-ft-ar)] text-[10px] font-medium text-[var(--ft-text-secondary)]">
              مسوّدة ردّك بالكتابة
            </p>
          ) : null}
          <p
            dir="ltr"
            lang="pt"
            className="text-start font-[family-name:var(--font-ft-pt)] text-[15px] font-semibold leading-snug"
          >
            {tl}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-[85%] flex-col items-end self-end">
      <div className="rounded-2xl rounded-bl-md bg-v2-primary px-3.5 py-2.5 text-white shadow-[var(--shadow-v2-soft)]">
        <p
          dir="ltr"
          lang="pt"
          className="text-start font-[family-name:var(--font-v2-target)] text-[15px] font-semibold leading-snug"
        >
          {tl}
        </p>
      </div>
    </div>
  );
}
