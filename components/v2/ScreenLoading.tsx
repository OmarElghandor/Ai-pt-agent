import { TalkieSpinner } from '@/components/v2/TalkieSpinner';

type ScreenLoadingProps = {
  /** Optional Arabic (or other) caption under the spinner. */
  label?: string;
  /** Fill the viewport height (flow / talk shells). */
  fullScreen?: boolean;
  className?: string;
  spinnerSize?: number;
};

/** Centered Talkie spinner for page-level loading states. */
export function ScreenLoading({
  label,
  fullScreen = false,
  className,
  spinnerSize = 96,
}: ScreenLoadingProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-4 px-4',
        fullScreen ? 'min-h-dvh w-full' : 'flex-1 min-h-0 w-full',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <TalkieSpinner size={spinnerSize} decorative={Boolean(label)} />
      {label ? (
        <p className="max-w-xs text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {label}
        </p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}
