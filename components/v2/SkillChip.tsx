import type { Skill } from '@/lib/v2/rt';

const SKILL_META: Record<Skill, { label: string; className: string }> = {
  listening: { label: 'سماع', className: 'bg-v2-skill-listening text-white' },
  reading: { label: 'قراية', className: 'bg-v2-skill-reading text-white' },
  speaking: { label: 'كلام', className: 'bg-v2-skill-speaking text-white' },
  writing: { label: 'كتابة', className: 'bg-v2-skill-writing text-white' },
};

type Props = {
  skill: Skill;
  className?: string;
};

export function SkillChip({ skill, className }: Props) {
  const meta = SKILL_META[skill];
  return (
    <span
      className={[
        'inline-flex items-center rounded-v2-chip px-2.5 py-1 text-xs font-[family-name:var(--font-v2-ui)] font-semibold',
        meta.className,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {meta.label}
    </span>
  );
}
