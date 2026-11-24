'use client';

type Props = {
  onRate: (rating: 'said_correct' | 'near' | 'still') => void;
  disabled?: boolean;
};

const CHIPS: { id: 'said_correct' | 'near' | 'still'; label: string }[] = [
  { id: 'said_correct', label: 'قلتها صح' },
  { id: 'near', label: 'قربت' },
  { id: 'still', label: 'لسه' },
];

export function SelfRating({ onRate, disabled }: Props) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {CHIPS.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={disabled}
          onClick={() => onRate(c.id)}
          className="min-h-11 rounded-full border border-v2-line bg-v2-paper px-4 py-2 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}