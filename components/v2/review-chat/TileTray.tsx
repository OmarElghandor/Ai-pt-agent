'use client';

type Props = {
  tiles: string[];
  selected: number[];
  onToggle: (index: number) => void;
  onClear: () => void;
  onConfirm: () => void;
  onHint?: () => void;
  disabled?: boolean;
};

export function TileTray({
  tiles,
  selected,
  onToggle,
  onClear,
  onConfirm,
  onHint,
  disabled,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex min-h-14 flex-wrap gap-2 rounded-xl border border-dashed border-v2-line bg-v2-input p-3" dir="ltr">
        {selected.map((i) => (
          <span
            key={`s-${i}`}
            className="rounded-lg bg-v2-primary-tint px-3 py-1.5 font-[family-name:var(--font-v2-target)] text-sm font-semibold text-v2-primary-strong"
          >
            {tiles[i]}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" dir="ltr">
        {tiles.map((t, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled || selected.includes(i)}
            onClick={() => onToggle(i)}
            className="rounded-xl border border-v2-line bg-v2-paper px-3 py-2 font-[family-name:var(--font-v2-target)] text-sm font-medium text-v2-ink disabled:opacity-40"
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="rounded-lg px-3 py-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted"
        >
          مسح
        </button>
        {onHint ? (
          <button
            type="button"
            onClick={onHint}
            disabled={disabled}
            className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted"
          >
            مش عارف؟ اطلب تلميح نحوي
          </button>
        ) : null}
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled || !selected.length}
          className="rounded-xl bg-v2-primary px-4 py-2.5 font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-v2-on-primary disabled:opacity-50"
        >
          تأكيد الإجابة
        </button>
      </div>
    </div>
  );
}