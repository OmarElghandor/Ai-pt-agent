'use client';

type Props = {
  label: string;
  collapsed?: boolean;
  onToggle?: () => void;
};

export function RoundDivider({ label, collapsed, onToggle }: Props) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="mx-auto flex w-full max-w-[92%] justify-center py-1"
      >
        <span className="rounded-full border border-v2-line bg-v2-panel px-3.5 py-1.5 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-primary">
          {label}
        </span>
      </button>
    );
  }
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-full border border-v2-line bg-v2-panel px-3.5 py-1 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-primary">
        {label}
      </span>
    </div>
  );
}