'use client';

import Link from 'next/link';

/** In-lesson chip: opens a clip and returns via browser back / returnTo. */
export function LessonClipChip({
  seriesSlug,
  clipSlug,
  label,
  returnTo,
}: {
  seriesSlug: string;
  clipSlug?: string;
  label: string;
  returnTo?: string;
}) {
  const href =
    `/micro/${seriesSlug}` +
    (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '') +
    (clipSlug ? `#${clipSlug}` : '');
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-1 text-sm text-primary"
    >
      شوف لقطة: {label}
    </Link>
  );
}
