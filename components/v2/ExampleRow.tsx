import { AudioButton } from '@/components/v2/AudioButton';
import { Chip } from '@/components/v2/Chip';
import { RichText } from '@/components/v2/RichText';
import type { RtGroup, RtSegment } from '@/lib/v2/rt';

type Props = {
  tl: string;
  ar: string;
  highlight?: string;
  highlightGroup?: RtGroup;
  active?: boolean;
  dimmed?: boolean;
  className?: string;
};

export function ExampleRow({
  tl,
  ar,
  highlight,
  highlightGroup = 'verb',
  active,
  dimmed,
  className,
}: Props) {
  const segments: RtSegment[] = highlight
    ? splitHighlight(tl, highlight, highlightGroup)
    : [{ text: tl, lang: 'tl' }];

  return (
    <div
      className={[
        'flex items-start gap-3 rounded-v2-row border border-v2-line bg-v2-card px-4 py-3',
        active ? 'border-2 border-v2-highlight-border bg-v2-highlight-fill' : '',
        dimmed ? 'opacity-20' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="min-w-0 flex-1">
        <p
          className="text-end font-[family-name:var(--font-v2-target)] text-[18px] leading-snug text-v2-ink"
          dir="ltr"
        >
          {highlight ? (
            <span className="inline-flex flex-wrap items-center justify-end gap-1">
              {segments.map((seg, i) =>
                seg.group ? (
                  <Chip key={i} group={seg.group}>
                    {seg.text}
                  </Chip>
                ) : (
                  <span key={i} dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                    {seg.text}
                  </span>
                ),
              )}
            </span>
          ) : (
            <RichText segments={segments} />
          )}
        </p>
        <p
          dir="rtl"
          className="mt-1 text-start font-[family-name:var(--font-v2-arabic)] text-[14px] leading-5 text-v2-ink-muted"
        >
          {ar}
        </p>
      </div>
      <AudioButton text={tl} lang="pt" className="shrink-0" />
    </div>
  );
}

function splitHighlight(
  tl: string,
  highlight: string,
  group: RtGroup,
): RtSegment[] {
  const idx = tl.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx < 0) return [{ text: tl, lang: 'tl', group }];
  const before = tl.slice(0, idx);
  const hit = tl.slice(idx, idx + highlight.length);
  const after = tl.slice(idx + highlight.length);
  const out: RtSegment[] = [];
  if (before) out.push({ text: before, lang: 'tl' });
  out.push({ text: hit, lang: 'tl', group });
  if (after) out.push({ text: after, lang: 'tl' });
  return out;
}
