'use client';

type Props = {
  rule: string;
  wrong: string;
  right: string;
};

export function GrammarNote({ rule, wrong, right }: Props) {
  return (
    <div className="rounded-lg border border-v2-grammar-note-border bg-v2-grammar-note p-3">
      <p className="font-[family-name:var(--font-v2-arabic)] text-xs font-bold text-v2-grammar-note-text">
        {rule}
      </p>
      <div className="mt-2 space-y-1 font-[family-name:var(--font-v2-target)] text-sm">
        <p className="text-end text-v2-ink-muted line-through" dir="ltr">
          ❌ {wrong}
        </p>
        <p className="text-end font-semibold text-v2-primary-strong" dir="ltr">
          ✓ {right}
        </p>
      </div>
    </div>
  );
}