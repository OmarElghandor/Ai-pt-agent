'use client';

type Props = {
  labels: string[];
  filled?: string[];
};

export function SlotLine({ labels, filled }: Props) {
  return (
    <div className="flex min-h-12 flex-wrap gap-2 rounded-xl border border-dashed border-v2-line bg-v2-input p-3" dir="ltr">
      {labels.map((slot, i) => (
        <span
          key={i}
          className="rounded-lg border border-v2-line bg-v2-paper px-3 py-1.5 font-[family-name:var(--font-v2-target)] text-sm text-v2-ink"
        >
          {filled?.[i] ?? slot}
        </span>
      ))}
    </div>
  );
}