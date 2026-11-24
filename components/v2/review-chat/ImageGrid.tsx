'use client';

import { ImageSlot } from '@/components/v2/ImageSlot';
import { toArDigits } from '@/lib/v2/formatAr';

type Cell = {
  id: string;
  url?: string | null;
  label: string;
  state?: 'idle' | 'correct' | 'wrong';
};

type Props = {
  cells: Cell[];
  attempt?: number;
  maxAttempts?: number;
  onPick?: (id: string, index: number) => void;
  disabled?: boolean;
};

export function ImageGrid({
  cells,
  attempt = 0,
  maxAttempts = 6,
  onPick,
  disabled,
}: Props) {
  return (
    <div className="space-y-2">
      <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
        لاقي الصورة · {toArDigits(Math.min(attempt + 1, maxAttempts))} من{' '}
        {toArDigits(maxAttempts)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {cells.slice(0, 4).map((cell, i) => {
          const tone =
            cell.state === 'correct'
              ? 'ring-2 ring-v2-success'
              : cell.state === 'wrong'
                ? 'ring-2 ring-v2-warning'
                : '';
          return (
            <button
              key={cell.id}
              type="button"
              disabled={disabled || cell.state === 'correct'}
              onClick={() => onPick?.(cell.id, i)}
              className={`overflow-hidden rounded-v2-card text-start ${tone}`}
              aria-label={cell.label}
            >
              <ImageSlot variant="thumb" src={cell.url} alt={cell.label} />
              {cell.state === 'correct' ? (
                <p className="px-1 py-1 font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-success-text">
                  صح! · <span dir="ltr">{cell.label}</span>
                </p>
              ) : null}
              {cell.state === 'wrong' ? (
                <p className="px-1 py-1 font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-warning-text">
                  مش دي
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}