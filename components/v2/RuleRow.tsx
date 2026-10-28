import { Icon } from '@/components/v2/Icon';

type Props = {
  n?: number;
  title: string;
  body: string;
  active?: boolean;
  dimmed?: boolean;
  /** Material Symbols name from content; else numbered circle when n is set */
  icon?: string;
  className?: string;
};

export function RuleRow({
  n,
  title,
  body,
  active,
  dimmed,
  icon,
  className,
}: Props) {
  return (
    <div
      className={[
        'flex gap-3 rounded-v2-row border border-transparent px-4 py-3',
        active ? 'border-2 border-v2-highlight-border bg-v2-highlight-fill' : '',
        dimmed ? 'opacity-20' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <RuleMarker n={n} icon={icon} />
      <div className="min-w-0 flex-1" dir="rtl">
        <p className="text-start font-[family-name:var(--font-v2-arabic)] text-xs font-semibold leading-snug text-v2-ink sm:text-sm">
          {title}
        </p>
        <p className="mt-0.5 text-start font-[family-name:var(--font-v2-arabic)] text-[11px] leading-snug text-v2-ink-muted sm:text-xs">
          {body}
        </p>
      </div>
    </div>
  );
}

function RuleMarker({ n, icon }: { n?: number; icon?: string }) {
  if (icon) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-v2-primary-tint text-v2-primary">
        <Icon name={icon} size={20} />
      </div>
    );
  }
  if (n != null) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-v2-primary-tint font-[family-name:var(--font-v2-ui)] text-sm font-bold text-v2-primary-strong">
        {n}
      </div>
    );
  }
  return <div className="h-8 w-8 shrink-0 rounded-full bg-v2-primary-tint" aria-hidden />;
}
