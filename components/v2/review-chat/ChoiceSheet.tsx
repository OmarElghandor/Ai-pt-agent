'use client';

import { AudioButton } from '@/components/v2/AudioButton';

type Option = { id: string; label: string; tl?: boolean };

type Props = {
  options: Option[];
  selected: string | null;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  confirmLabel?: string;
  disabled?: boolean;
};

export function ChoiceSheet({
  options,
  selected,
  onSelect,
  onConfirm,
  confirmLabel = 'تأكيد',
  disabled,
}: Props) {
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const active = selected === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt.id)}
            className={[
              'flex w-full items-center justify-between rounded-2xl border px-3.5 py-2.5 text-right transition-colors',
              active
                ? 'border-2 border-v2-primary bg-v2-primary-tint'
                : 'border-v2-line bg-v2-paper hover:bg-v2-panel',
            ].join(' ')}
          >
            <OptionRadio selected={active} />
            <span
              className="font-[family-name:var(--font-v2-target)] text-base text-v2-ink"
              dir="ltr"
            >
              {opt.label}
            </span>
            {opt.tl !== false ? (
              <AudioButton text={opt.label} size="chip" label="استماع" />
            ) : null}
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled || !selected}
        onClick={onConfirm}
        className="w-full rounded-2xl bg-v2-primary py-3.5 font-[family-name:var(--font-v2-arabic)] text-base font-bold text-v2-on-primary shadow-md disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

function OptionRadio({ selected }: { selected: boolean }) {
  return (
    <span
      className={[
        'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
        selected
          ? 'border-v2-primary bg-v2-primary text-v2-on-primary'
          : 'border-v2-line',
      ].join(' ')}
      aria-hidden
    >
      {selected ? '✓' : ''}
    </span>
  );
}