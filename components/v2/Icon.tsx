type Props = {
  /** Material Symbols ligature name, e.g. volume_up, bolt, lightbulb */
  name: string;
  size?: 20 | 24 | 32;
  /** Fill 1 for active / selected states only */
  fill?: boolean;
  className?: string;
};

/** Material Symbols Rounded — one family for all v2 UI icons. */
export function Icon({ name, size = 24, fill = false, className }: Props) {
  return (
    <span
      className={['material-symbols-rounded select-none leading-none', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        fontSize: size,
        fontVariationSettings: fill ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
      }}
      aria-hidden
    >
      {name}
    </span>
  );
}
