type BrandLogoProps = {
  /** Full wordmark vs bubble mark only */
  variant?: 'full' | 'mark';
  className?: string;
  priority?: boolean;
};

/** A-Z Talkie logo (transparent PNGs in /public/v2). */
export function BrandLogo({
  variant = 'full',
  className,
  priority = false,
}: BrandLogoProps) {
  const src = variant === 'mark' ? '/v2/mark.png' : '/v2/logo.png';
  const alt = 'A-Z Talkie';
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset; avoid layout shift from next/image remote config
    <img
      src={src}
      alt={alt}
      className={className}
      decoding="async"
      {...(priority ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
    />
  );
}
