import type { ReactNode } from 'react';
import { Icon } from '@/components/v2/Icon';
import { SkillChip } from '@/components/v2/SkillChip';
import type { Skill } from '@/lib/v2/rt';

type Props = {
  children: ReactNode;
  skill?: Skill;
  className?: string;
};

/** Mustard tip / coach card (Warm Editorial). */
export function NoteCard({ children, skill, className }: Props) {
  return (
    <aside
      className={[
        'flex items-start gap-3 rounded-v2-row border border-v2-note-border border-s-4 bg-v2-note/90 px-4 py-3 text-v2-ink shadow-[var(--shadow-v2-soft)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-v2-row bg-v2-card text-v2-primary"
      >
        <Icon name="lightbulb" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        {skill ? (
          <div className="mb-1.5">
            <SkillChip skill={skill} />
          </div>
        ) : null}
        <div
          dir="rtl"
          className="text-start font-[family-name:var(--font-v2-arabic)] text-sm leading-6"
        >
          {children}
        </div>
      </div>
    </aside>
  );
}

/** @deprecated Prefer NoteCard — alias kept for existing call sites. */
export const StickyNote = NoteCard;
