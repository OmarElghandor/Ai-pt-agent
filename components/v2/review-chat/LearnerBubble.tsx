'use client';

type Props = {
  text: string;
  variant?: 'text' | 'choice' | 'tiles';
};

export function LearnerBubble({ text, variant = 'text' }: Props) {
  return (
    <div className="flex justify-end">
      <div
        className={[
          'max-w-[78%] rounded-v2-bubble rounded-tl-sm bg-v2-primary px-4 py-2.5 text-v2-on-primary shadow-sm',
          variant === 'tiles' ? 'font-[family-name:var(--font-v2-target)]' : '',
        ].join(' ')}
        dir={variant === 'text' ? 'auto' : 'ltr'}
      >
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm leading-relaxed">
          {text}
        </p>
      </div>
    </div>
  );
}