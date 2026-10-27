import type { RtGroup, RtSegment } from '@/lib/v2/rt';

const GROUP_CLASS: Record<RtGroup, string> = {
  a: 'text-v2-group-a',
  b: 'text-v2-group-b',
  c: 'text-v2-group-c',
  m: 'text-v2-group-m',
  f: 'text-v2-group-f',
  verb: 'text-v2-group-verb bg-v2-group-verb-bg rounded-v2-chip px-1.5 py-0.5',
  prep: 'text-v2-group-prep',
  pron: 'text-v2-group-pron',
  neg: 'text-v2-group-neg bg-v2-group-neg-bg rounded-v2-chip px-1.5 py-0.5',
  neutral: 'text-v2-group-neutral',
};

type Props = {
  segments: RtSegment[];
  className?: string;
};

export function RichText({ segments, className }: Props) {
  return (
    <span className={className}>
      {segments.map((seg, i) => {
        const dir = seg.lang === 'tl' ? 'ltr' : 'rtl';
        const groupClass = seg.group ? GROUP_CLASS[seg.group] : '';
        const fontClass =
          seg.lang === 'tl'
            ? 'font-[family-name:var(--font-v2-target)]'
            : 'font-[family-name:var(--font-v2-arabic)]';
        return (
          <span
            key={`${i}-${seg.text.slice(0, 12)}`}
            dir={dir}
            style={{ unicodeBidi: 'isolate' }}
            className={[
              fontClass,
              groupClass,
              seg.bold ? 'font-semibold' : '',
              seg.wrong ? 'line-through opacity-70' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {seg.text}
          </span>
        );
      })}
    </span>
  );
}
