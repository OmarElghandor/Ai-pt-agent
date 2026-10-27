import type { RtGroup, RtSegment } from '@/lib/v2/rt';

const CHIP =
  'inline whitespace-nowrap rounded-md px-1 py-0.5 align-baseline text-[0.92em] font-extrabold leading-none text-white';

const GROUP_CLASS: Record<RtGroup, string> = {
  a: `${CHIP} bg-v2-group-a`,
  b: `${CHIP} bg-v2-group-b`,
  c: 'text-v2-group-c',
  m: 'text-v2-group-m',
  f: 'text-v2-group-f',
  verb: 'text-v2-group-verb bg-v2-group-verb-bg rounded-v2-chip px-1.5 py-0.5',
  prep: 'text-v2-group-prep',
  pron: 'text-v2-group-pron',
  neg: 'text-v2-group-neg bg-v2-group-neg-bg rounded-v2-chip px-1.5 py-0.5',
  neutral: 'text-v2-group-neutral',
};

const DISPLAY_CLASS: Partial<Record<RtGroup, string>> = {
  a: 'inline-block rounded-xl bg-v2-group-a/10 px-2.5 py-0.5 text-v2-group-a',
  b: 'inline-block rounded-xl bg-v2-group-b/10 px-2.5 py-0.5 text-v2-group-b',
};

type Props = {
  segments: RtSegment[];
  className?: string;
  /**
   * onDark: caption bar, no group colors.
   * display: large title words, tinted rather than solid chips.
   */
  tone?: 'default' | 'onDark' | 'display';
};

function segmentDir(lang: RtSegment['lang']): 'ltr' | 'rtl' {
  return lang === 'tl' ? 'ltr' : 'rtl';
}

/** Consecutive same-direction segments stay one isolate, so an RTL page cannot reverse a Portuguese sentence. */
function directionRuns(segments: RtSegment[]) {
  const runs: { dir: 'ltr' | 'rtl'; segments: { seg: RtSegment; index: number }[] }[] = [];
  segments.forEach((seg, index) => {
    const dir = segmentDir(seg.lang);
    const last = runs[runs.length - 1];
    if (last && last.dir === dir) last.segments.push({ seg, index });
    else runs.push({ dir, segments: [{ seg, index }] });
  });
  return runs;
}

export function RichText({ segments, className, tone = 'default' }: Props) {
  return (
    <span className={className}>
      {directionRuns(segments).map((run) => (
        <span key={run.segments[0].index} dir={run.dir} style={{ unicodeBidi: 'isolate' }}>
          {run.segments.map(({ seg, index }) => {
            const vs = tone === 'display' && seg.lang === 'tl' && seg.text.trim().toLowerCase() === 'vs';
            const groupClass =
              tone === 'onDark' || !seg.group
                ? ''
                : tone === 'display'
                  ? (DISPLAY_CLASS[seg.group] ?? GROUP_CLASS[seg.group])
                  : GROUP_CLASS[seg.group];
            const fontClass =
              seg.lang === 'tl'
                ? 'font-[family-name:var(--font-v2-target)]'
                : 'font-[family-name:var(--font-v2-arabic)]';
            return (
              <span
                key={`${index}-${seg.text.slice(0, 12)}`}
                className={[
                  fontClass,
                  groupClass,
                  tone === 'onDark' ? 'text-white' : '',
                  vs ? 'px-1 font-serif text-[0.7em] italic text-v2-ink-muted' : '',
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
      ))}
    </span>
  );
}
