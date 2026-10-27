import type { ReactNode } from 'react';
import { SkillChip } from '@/components/v2/SkillChip';
import type { Skill } from '@/lib/v2/rt';

type Props = {
  children: ReactNode;
  skill?: Skill;
  className?: string;
};

export function StickyNote({ children, skill, className }: Props) {
  return (
    <aside
      className={[
        'rounded-v2-row border border-v2-highlight-border bg-v2-highlight-fill px-3 py-2.5 text-v2-ink shadow-[2px_2px_0_rgba(18,35,90,0.12)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {skill ? (
        <div className="mb-1.5">
          <SkillChip skill={skill} />
        </div>
      ) : null}
      <p dir="rtl" className="text-end font-[family-name:var(--font-v2-arabic)] text-sm leading-6">
        {children}
      </p>
    </aside>
  );
}
