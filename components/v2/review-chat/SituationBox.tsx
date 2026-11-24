'use client';

type Props = { text: string };

export function SituationBox({ text }: Props) {
  return (
    <div className="rounded-xl border border-v2-line bg-v2-nested px-3 py-2.5">
      <p className="font-[family-name:var(--font-v2-ui)] text-[10px] font-bold uppercase tracking-wide text-v2-meta">
        الموقف
      </p>
      <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm leading-relaxed text-v2-ink">
        {text}
      </p>
    </div>
  );
}