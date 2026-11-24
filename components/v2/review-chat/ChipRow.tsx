'use client';

type Chip = { id: string; label: string };

type Props = {
  chips: Chip[];
  selected: string | null;
  onSelect: (id: string) => void;
  inline?: boolean;
  disabled?: boolean;
};

export function ChipRow({ chips, selected, onSelect, inline, disabled }: Props) {
  if (inline) {
    return (
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(c.id)}
            className={[
              'rounded-lg px-3 py-1.5 font-[family-name:var(--font-v2-arabic)] text-sm',
              selected === c.id
                ? 'bg-v2-primary-tint text-v2-primary-strong ring-2 ring-v2-primary'
                : 'bg-v2-panel text-v2-ink-muted',
            ].join(' ')}
          >
            {c.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(c.id)}
          className={[
            'min-h-11 rounded-xl px-3 py-2 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold',
            selected === c.id
              ? 'bg-v2-primary-tint text-v2-primary-strong ring-2 ring-v2-primary'
              : 'bg-v2-panel text-v2-ink',
            c.label.match(/^[a-z]/i) ? 'font-[family-name:var(--font-v2-target)]' : '',
          ].join(' ')}
          dir={c.label.match(/^[a-z]/i) ? 'ltr' : undefined}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}