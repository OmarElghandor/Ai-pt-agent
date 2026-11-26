'use client';

/** Rule layout: highlight ending via nested spans (RN-safe). */
export function TlWithHighlight({
  tl,
  highlight,
  className = '',
}: {
  tl: string;
  highlight?: { start: number; end: number } | null;
  className?: string;
}) {
  if (
    !highlight ||
    highlight.start < 0 ||
    highlight.end <= highlight.start ||
    highlight.end > tl.length
  ) {
    return (
      <span className={className} dir="ltr">
        {tl}
      </span>
    );
  }
  const before = tl.slice(0, highlight.start);
  const mid = tl.slice(highlight.start, highlight.end);
  const after = tl.slice(highlight.end);
  return (
    <span className={className} dir="ltr">
      {before}
      <span className="font-bold text-primary">{mid}</span>
      {after}
    </span>
  );
}
