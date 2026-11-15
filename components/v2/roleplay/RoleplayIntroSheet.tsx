'use client';

type Props = {
  emoji: string;
  titleTl: string;
  titleAr: string;
  placeEg: string;
  taskEg: string;
  onStart: () => void;
  starting?: boolean;
  resume?: boolean;
};

/** One-button entry — no tier picker, no key phrases before the call. */
export function RoleplayIntroSheet({
  emoji,
  titleTl,
  titleAr,
  placeEg,
  taskEg,
  onStart,
  starting,
  resume,
}: Props) {
  return (
    <div className="flex flex-col gap-5 px-4 pb-10 pt-4">
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <div>
        <p
          className="font-[family-name:var(--font-v2-target)] text-xl font-semibold text-v2-primary"
          dir="ltr"
        >
          {titleTl}
        </p>
        <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink">
          {titleAr}
        </p>
        <p className="mt-3 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {placeEg}
        </p>
        <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
          {taskEg}
        </p>
      </div>
      <button
        type="button"
        disabled={starting}
        onClick={onStart}
        className="flex min-h-12 items-center justify-center rounded-v2-row bg-v2-primary font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white disabled:opacity-60"
      >
        {starting
          ? 'جاري…'
          : resume
            ? 'كمّل المكالمة'
            : 'ابدأ المكالمة'}
      </button>
    </div>
  );
}
