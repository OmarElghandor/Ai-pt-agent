import { directionRuns, splitLatinInArabic } from '@/lib/v2/bidi';
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

const TL_FONT = 'font-[family-name:var(--font-v2-target)]';
const AR_FONT = 'font-[family-name:var(--font-v2-arabic)]';

export function RichText({ segments, className, tone = 'default' }: Props) {
  return (
    <span className={className}>
      {directionRuns(segments).map((run) => (
        <span
          key={run.segments[0]!.index}
          dir={run.dir}
          style={{ unicodeBidi: 'isolate' }}
        >
          {run.segments.map(({ seg, index }) => {
            if (seg.lang === 'eg' || seg.lang === 'ar') {
              return (
                <ArabicWithLatin
                  key={`${index}-${seg.text.slice(0, 12)}`}
                  seg={seg}
                  tone={tone}
                />
              );
            }
            return (
              <TlSpan
                key={`${index}-${seg.text.slice(0, 12)}`}
                seg={seg}
                tone={tone}
              />
            );
          })}
        </span>
      ))}
    </span>
  );
}

function ArabicWithLatin({
  seg,
  tone,
}: {
  seg: RtSegment;
  tone: NonNullable<Props['tone']>;
}) {
  const parts = splitLatinInArabic(seg.text);
  return (
    <>
      {parts.map((part, i) =>
        part.latin ? (
          <span
            key={i}
            dir="ltr"
            style={{ unicodeBidi: 'isolate' }}
            className={[
              TL_FONT,
              tone === 'onDark' ? 'text-white' : '',
              seg.bold ? 'font-semibold' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {part.text}
          </span>
        ) : (
          <span
            key={i}
            className={[
              AR_FONT,
              groupClass(seg.group, tone),
              tone === 'onDark' ? 'text-white' : '',
              seg.bold ? 'font-semibold' : '',
              seg.wrong ? 'line-through opacity-70' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {part.text}
          </span>
        ),
      )}
    </>
  );
}

function TlSpan({
  seg,
  tone,
}: {
  seg: RtSegment;
  tone: NonNullable<Props['tone']>;
}) {
  const vs =
    tone === 'display' && seg.lang === 'tl' && seg.text.trim().toLowerCase() === 'vs';
  return (
    <span
      className={[
        TL_FONT,
        groupClass(seg.group, tone),
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
}

function groupClass(
  group: RtGroup | undefined,
  tone: NonNullable<Props['tone']>,
): string {
  if (tone === 'onDark' || !group) return '';
  if (tone === 'display') return DISPLAY_CLASS[group] ?? GROUP_CLASS[group];
  return GROUP_CLASS[group];
}
