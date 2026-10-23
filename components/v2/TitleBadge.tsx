type Tile = {
  text: string;
  group?: 'a' | 'b' | 'c';
};

const GROUP_TILE: Record<'a' | 'b' | 'c', string> = {
  a: 'border-v2-group-a bg-v2-group-a/10 text-v2-group-a',
  b: 'border-v2-group-b bg-v2-group-b/10 text-v2-group-b',
  c: 'border-v2-group-c bg-v2-group-c/10 text-v2-group-c',
};

type Props = {
  tiles: Tile[];
  separator?: string;
  eyebrow?: string;
  subtitle?: string;
  className?: string;
};

export function TitleBadge({
  tiles,
  separator = 'vs',
  eyebrow = 'ملخّص القاعدة',
  subtitle,
  className,
}: Props) {
  return (
    <div
      className={[
        'mx-auto w-full max-w-md rounded-v2-card border border-v2-ink bg-gradient-to-b from-v2-highlight-fill/60 to-v2-card px-4 py-4 text-center shadow-[2px_2px_0_rgba(18,35,90,0.08)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="inline-flex rounded-v2-chip bg-v2-highlight-fill px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-attention">
        {eyebrow}
      </span>

      <div
        dir="ltr"
        className="mt-3 flex flex-wrap items-center justify-center gap-2"
      >
        {tiles.map((tile, i) => (
          <span key={`${tile.text}-${i}`} className="inline-flex items-center gap-2">
            {i > 0 ? (
              <span className="font-[family-name:var(--font-v2-target)] text-base italic text-v2-ink-muted">
                {separator}
              </span>
            ) : null}
            <span
              dir="ltr"
              className={[
                'rounded-v2-row border-2 px-3 py-1.5 font-[family-name:var(--font-v2-display-latin)] text-3xl font-bold tracking-wide',
                GROUP_TILE[tile.group ?? (i === 0 ? 'a' : 'b')],
              ].join(' ')}
            >
              {tile.text}
            </span>
          </span>
        ))}
      </div>

      {subtitle ? (
        <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
