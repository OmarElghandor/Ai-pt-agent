'use client';

/** Solid placeholder — no blur / backdrop-filter (19 §3.3b). Hidden text is not rendered. */
export function PlaceholderBar({
  widthCh = 12,
  className = '',
}: {
  widthCh?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3 rounded-md bg-surface-container-high ${className}`}
      style={{ width: `${Math.max(4, widthCh)}ch` }}
    />
  );
}
