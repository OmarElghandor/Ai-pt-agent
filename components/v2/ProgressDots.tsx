import type { Skill } from '@/lib/v2/rt';

const SKILL_DOT: Record<Skill, string> = {
  listening: 'bg-v2-skill-listening',
  reading: 'bg-v2-skill-reading',
  speaking: 'bg-v2-skill-speaking',
  writing: 'bg-v2-skill-writing',
};

type Dot = {
  skill?: Skill;
  state?: 'done' | 'current' | 'todo';
};

type Props = {
  dots: Dot[];
  className?: string;
};

export function ProgressDots({ dots, className }: Props) {
  return (
    <div className={['flex items-center gap-1.5', className].filter(Boolean).join(' ')}>
      {dots.map((dot, i) => {
        const skillClass = dot.skill ? SKILL_DOT[dot.skill] : 'bg-v2-ink';
        const stateClass =
          dot.state === 'todo'
            ? 'opacity-25'
            : dot.state === 'current'
              ? 'ring-2 ring-v2-highlight-border ring-offset-1 ring-offset-v2-paper scale-110'
              : '';
        return (
          <span
            key={i}
            className={['h-2.5 w-2.5 rounded-full', skillClass, stateClass].join(' ')}
            aria-hidden
          />
        );
      })}
    </div>
  );
}
