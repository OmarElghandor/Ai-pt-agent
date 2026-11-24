'use client';

type Props = {
  template: string;
  blank?: string;
};

export function BlankSentence({ template, blank }: Props) {
  const parts = template.split('___');
  return (
    <p className="font-[family-name:var(--font-v2-target)] text-lg font-semibold leading-relaxed text-v2-ink" dir="ltr">
      {parts[0]}
      <span className="mx-1 inline-block min-w-[3rem] border-b-2 border-dashed border-v2-primary text-v2-primary">
        {blank ?? ''}
      </span>
      {parts[1] ?? ''}
    </p>
  );
}