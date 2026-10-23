import type { ReactNode } from 'react';

type Props = {
  n?: number;
  title: string;
  body: string;
  active?: boolean;
  dimmed?: boolean;
  illustration?: ReactNode;
  className?: string;
};

export function RuleRow({
  n,
  title,
  body,
  active,
  dimmed,
  illustration,
  className,
}: Props) {
  return (
    <div
      className={[
        'flex gap-2 rounded-v2-row border border-transparent p-1.5 sm:gap-3 sm:p-2',
        active ? 'border-2 border-v2-highlight-border bg-v2-highlight-fill' : '',
        dimmed ? 'opacity-20' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-v2-row border border-v2-rule bg-v2-paper sm:h-14 sm:w-14">
        {illustration ?? <PlaceholderIllustration />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-[family-name:var(--font-v2-arabic)] text-xs font-semibold leading-snug text-v2-ink sm:text-sm">
          {n != null ? (
            <span className="text-v2-ink-muted">{n}. </span>
          ) : null}
          {title}
        </p>
        <p className="mt-0.5 font-[family-name:var(--font-v2-arabic)] text-[11px] leading-snug text-v2-ink-muted sm:text-xs">
          {body}
        </p>
      </div>
    </div>
  );
}

function PlaceholderIllustration() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="4" y="6" width="24" height="20" rx="4" fill="var(--color-v2-group-verb-bg)" />
      <circle cx="12" cy="14" r="3" fill="var(--color-v2-group-a)" />
      <path
        d="M8 22c1.5-3 5-4 8-4s6.5 1 8 4"
        stroke="var(--color-v2-group-a)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M20 11h5M20 15h4"
        stroke="var(--color-v2-ink-muted)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
