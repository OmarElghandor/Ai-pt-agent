type Props = {
  /** 0–1 */
  value: number;
  className?: string;
  label?: string;
};

/** Thin coral progress track. */
export function ProgressBar({ value, className, label }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={['w-full', className].filter(Boolean).join(' ')}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-1.5 overflow-hidden rounded-full bg-v2-paper-deep">
        <div
          className="h-full rounded-full bg-v2-action transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
