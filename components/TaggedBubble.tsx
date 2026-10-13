'use client';

import { parseTaggedMessage, type Segment } from '@/lib/parseTaggedMessage';

function needsGap(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  if (/\s$/.test(prev) || /^\s/.test(next)) return false;
  if (/^[,.;:!?…)]/.test(next)) return false;
  return true;
}

export function TaggedBubble({ raw }: { raw: string }) {
  const segments = parseTaggedMessage(raw);
  return (
    <p dir="rtl" lang="ar" className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap">
      {segments.map((seg, i) => {
        const prev = i > 0 ? segments[i - 1].text : '';
        const gap = needsGap(prev, seg.text) ? ' ' : '';
        return seg.lang === 'pt' ? (
          <span
            key={i}
            style={{ unicodeBidi: 'isolate', direction: 'ltr' }}
            lang="pt"
            className={`text-accent-mint ${seg.pending ? 'opacity-70' : ''}`}
          >
            {gap}
            {seg.text}
          </span>
        ) : (
          <span key={i} className={seg.pending ? 'opacity-70' : undefined}>
            {gap}
            {seg.text}
          </span>
        );
      })}
    </p>
  );
}

export function getSegments(raw: string): Segment[] {
  return parseTaggedMessage(raw);
}
