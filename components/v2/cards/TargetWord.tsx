/** Colored article (o / a) + rest of the target lemma. */
export function TargetWord({
  tl,
  gender,
  className,
  size = 'md',
  /** Back of the card uses ink for the noun; front keeps primary. */
  nounTone = 'primary',
}: {
  tl: string;
  gender?: 'm' | 'f' | 'n';
  className?: string;
  size?: 'md' | 'lg' | 'xl';
  nounTone?: 'primary' | 'ink';
}) {
  const sizeClass =
    size === 'xl'
      ? 'text-[40px] leading-tight'
      : size === 'lg'
        ? 'text-2xl'
        : 'text-lg';
  const nounClass =
    nounTone === 'ink' ? 'text-v2-ink' : 'text-v2-primary';
  const m = tl.match(/^(o|a|os|as|um|uma)\s+(.+)$/i);
  if (!m) {
    return (
      <span
        dir="ltr"
        className={[
          'font-[family-name:var(--font-v2-target)] font-semibold',
          nounClass,
          sizeClass,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {tl}
      </span>
    );
  }
  const article = m[1]!;
  const rest = m[2]!;
  const artGender =
    gender ??
    (/^a|^uma/i.test(article) ? 'f' : /^o|^um/i.test(article) ? 'm' : 'n');
  const artClass =
    artGender === 'f'
      ? 'text-v2-group-f'
      : artGender === 'm'
        ? 'text-v2-group-m'
        : 'text-v2-ink-muted';

  return (
    <span
      dir="ltr"
      className={[
        'font-[family-name:var(--font-v2-target)] font-semibold',
        sizeClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={artClass}>{article}</span>
      <span className={nounClass}> {rest}</span>
    </span>
  );
}
