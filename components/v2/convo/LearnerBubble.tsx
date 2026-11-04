'use client';

type Props = { tl: string };

export function LearnerBubble({ tl }: Props) {
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
