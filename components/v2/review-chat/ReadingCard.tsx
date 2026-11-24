'use client';

type Line = { tl?: string; price?: string; ar?: string };
type Props = {
  kind?: string;
  lines?: Line[];
  total?: string;
  title?: string;
};

export function ReadingCard({ kind, lines, total, title }: Props) {
  return (
    <div className="mx-auto w-full max-w-xs rounded-xl border border-v2-line bg-v2-paper p-3.5 shadow-sm">
      <div className="flex items-center justify-between pb-1.5">
        <span className="font-[family-name:var(--font-v2-ui)] text-[10px] font-bold uppercase tracking-wide text-v2-meta">
          {title ?? (kind === 'receipt' ? 'Recibo / Talão' : 'قراءة')}
        </span>
        <span className="font-[family-name:var(--font-v2-target)] text-[10px] text-v2-meta">
          Lisboa
        </span>
      </div>
      <div className="space-y-1 font-[family-name:var(--font-v2-target)] text-sm text-v2-ink">
        {(lines ?? []).map((line, i) => (
          <div key={i} className="flex items-center justify-between">
            {line.tl ? <span dir="ltr">{line.tl}</span> : null}
            {line.price ? <span dir="ltr">{line.price}</span> : null}
            {line.ar ? <span>{line.ar}</span> : null}
          </div>
        ))}
      </div>
      {total ? (
        <>
          <div className="my-1 h-0.5 w-full bg-v2-line" />
          <div className="flex items-center justify-between font-[family-name:var(--font-v2-target)] text-base font-semibold text-v2-ink">
            <span dir="ltr">Total</span>
            <span dir="ltr">{total}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}