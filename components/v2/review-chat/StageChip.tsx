'use client';

type Props = {
  label: string;
};

export function StageChip({ label }: Props) {
  return (
    <span className="inline-flex items-center rounded-full bg-v2-success-panel px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-success-text">
      {label}
    </span>
  );
}