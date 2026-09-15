'use client';

import { parseTaggedMessage, type Segment } from '@/lib/parseTaggedMessage';

export function TaggedBubble({ raw }: { raw: string }) {
  const segments = parseTaggedMessage(raw);
  return (
    <p dir="rtl" lang="ar" className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap">
      {segments.map((seg, i) =>
        seg.lang === 'pt' ? (
          <span
            key={i}
            style={{ unicodeBidi: 'isolate', direction: 'ltr' }}
            lang="pt"
            className={`ml-1 text-accent-mint ${seg.pending ? 'opacity-70' : ''}`}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i} className={seg.pending ? 'opacity-70' : undefined}>
            {seg.text}
          </span>
        ),
      )}
    </p>
  );
}

export function getSegments(raw: string): Segment[] {
  return parseTaggedMessage(raw);
}
