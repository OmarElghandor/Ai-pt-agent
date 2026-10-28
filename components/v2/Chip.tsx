import type { ReactNode } from 'react';
import type { RtGroup } from '@/lib/v2/rt';

const GROUP_STYLES: Record<RtGroup, string> = {
  a: 'bg-v2-group-a text-white',
  b: 'bg-v2-group-b text-white',
  c: 'bg-v2-group-c text-white',
  m: 'bg-v2-group-m text-white',
  f: 'bg-v2-group-f text-white',
  verb: 'bg-v2-group-verb-bg text-v2-group-verb',
  prep: 'bg-v2-group-prep text-white',
  pron: 'bg-v2-group-pron text-white',
  neg: 'bg-v2-group-neg-bg text-v2-group-neg',
  neutral: 'bg-v2-paper-deep text-v2-ink',
};

type Props = {
  children: ReactNode;
  group?: RtGroup;
  className?: string;
};

export function Chip({ children, group = 'neutral', className }: Props) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-v2-chip px-2.5 py-1 text-sm font-[family-name:var(--font-v2-ui)] font-medium',
        GROUP_STYLES[group],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
