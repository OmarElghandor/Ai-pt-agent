type Props = {
  /** Material Symbols ligature name, e.g. volume_up, bolt, lightbulb */
  name: string;
  size?: 20 | 24 | 32;
  /** Fill 1 for active / selected states only */
  fill?: boolean;
  /** Outlined matches Stitch path/home chrome; rounded is the default elsewhere. */
  variant?: 'rounded' | 'outlined';
  className?: string;
};

/** Material Symbols — outline by default; fill only when active. */
export function Icon({
  name,
  size = 24,
  fill = false,
  variant = 'rounded',
  className,
}: Props) {
  const family =
    variant === 'outlined'
      ? 'material-symbols-outlined'
      : 'material-symbols-rounded';

  return (
    <span
      className={[family, 'select-none leading-none', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        fontSize: size,
        fontVariationSettings: fill
          ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
      }}
      aria-hidden
    >
      {name}
    </span>
  );
}
