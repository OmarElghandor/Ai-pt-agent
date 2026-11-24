'use client';

const ACCENTS = ['á', 'à', 'â', 'ã', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú', 'ç'];

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onHint?: () => void;
  disabled?: boolean;
  sendLabel?: string;
};

export function TextComposer({
  value,
  onChange,
  onSubmit,
  onHint,
  disabled,
  sendLabel = 'إرسال',
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {ACCENTS.map((ch) => (
          <button
            key={ch}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value + ch)}
            className="min-h-11 min-w-11 rounded-lg border border-v2-line bg-v2-paper font-[family-name:var(--font-v2-target)] text-sm font-semibold text-v2-ink"
            dir="ltr"
          >
            {ch}
          </button>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        dir="ltr"
        placeholder="اكتب بالبرتغالي…"
        className="w-full resize-none rounded-2xl border border-v2-input-border bg-v2-input px-4 py-3 font-[family-name:var(--font-v2-target)] text-base text-v2-ink outline-none focus:ring-[3px] focus:ring-[color:var(--color-v2-focus-ring)]"
      />
      <div className="flex items-center justify-between gap-2">
        {onHint ? (
          <button
            type="button"
            onClick={onHint}
            disabled={disabled}
            className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted underline-offset-2 hover:underline"
          >
            مش عارف (ساعدني أحلها)
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={onSubmit}
          className="rounded-xl bg-v2-primary px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-v2-on-primary disabled:opacity-50"
        >
          {sendLabel}
        </button>
      </div>
    </div>
  );
}