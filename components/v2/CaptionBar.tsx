import { ImageSlot } from '@/components/v2/ImageSlot';
import { RichText } from '@/components/v2/RichText';
import type { RtSegment } from '@/lib/v2/rt';

type Chapter = {
  id: string;
  label: string;
  /** 0–1 fill for the current segment; omitted / 0 = empty track */
  progress?: number;
  active?: boolean;
};

type Props = {
  tipEg?: string;
  /** Rich tip. Wins over tipEg when both are set. */
  tip?: RtSegment[];
  chapters?: Chapter[];
  avatarSrc?: string;
  paused?: boolean;
  speedLabel?: string;
  onTogglePause?: () => void;
  onCycleSpeed?: () => void;
  onChapterSelect?: (id: string) => void;
  className?: string;
};

export function CaptionBar({
  tipEg,
  tip,
  chapters = [],
  avatarSrc,
  paused,
  speedLabel = '1×',
  onTogglePause,
  onCycleSpeed,
  onChapterSelect,
  className,
}: Props) {
  return (
    <div
      className={[
        'rounded-v2-card border border-white/10 bg-v2-primary text-white shadow-[var(--shadow-v2-soft)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center gap-2.5 px-3 pt-2.5">
        {avatarSrc ? (
          <ImageSlot
            variant="avatar"
            size={40}
            src={avatarSrc}
            className="ring-1 ring-white/25"
          />
        ) : (
          <div
            className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 font-[family-name:var(--font-v2-display-ar)] text-sm ring-1 ring-white/25"
            aria-hidden
          >
            م
          </div>
        )}

        <p dir="rtl" className="min-w-0 flex-1 text-start font-[family-name:var(--font-v2-arabic)] text-[13px] font-bold leading-snug text-v2-highlight-fill">
          {tip?.length ? (
            <RichText segments={tip} tone="onDark" />
          ) : tipEg ? (
            <RichText segments={[{ text: tipEg, lang: 'eg' }]} tone="onDark" />
          ) : null}
        </p>

        <SoundWaveGlyph />

        {onTogglePause || onCycleSpeed ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {onTogglePause ? (
              <button
                type="button"
                aria-label={paused ? 'تشغيل' : 'إيقاف'}
                onClick={onTogglePause}
                className="rounded-v2-chip px-2 py-1 font-[family-name:var(--font-v2-ui)] text-xs text-white/90"
              >
                {paused ? '▶' : '❚❚'}
              </button>
            ) : null}
            {onCycleSpeed ? (
              <button
                type="button"
                aria-label="السرعة"
                onClick={onCycleSpeed}
                className="rounded-v2-chip px-2 py-1 font-[family-name:var(--font-v2-ui)] text-xs text-white/90"
              >
                {speedLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {chapters.length ? (
        <div className="flex gap-1.5 px-3 pb-2.5 pt-2">
          {chapters.map((ch) => {
            const fill = segmentFill(ch);
            const body = (
              <>
                <div className="h-1 overflow-hidden rounded-full bg-white/20">
                  <div
                    className={[
                      'h-full rounded-full transition-[width]',
                      fill > 0 ? 'bg-v2-highlight-border' : 'bg-transparent',
                    ].join(' ')}
                    style={{ width: `${fill * 100}%` }}
                  />
                </div>
                <p
                  className={[
                    'mt-1 truncate text-center font-[family-name:var(--font-v2-ui)] text-[10px]',
                    ch.active ? 'font-semibold text-white' : 'text-white/55',
                  ].join(' ')}
                >
                  {ch.label}
                </p>
              </>
            );
            if (!onChapterSelect) {
              return (
                <div key={ch.id} className="min-w-0 flex-1">
                  {body}
                </div>
              );
            }
            return (
              <button
                key={ch.id}
                type="button"
                className="min-w-0 flex-1"
                aria-current={ch.active ? 'step' : undefined}
                onClick={() => onChapterSelect(ch.id)}
              >
                {body}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Done chapters are full, the current one is partial, later ones stay empty. */
function segmentFill(ch: Chapter): number {
  const progress = ch.progress ?? 0;
  if (progress >= 1) return 1;
  if (ch.active) return progress > 0 ? Math.min(progress, 0.92) : 0.4;
  return 0;
}

function SoundWaveGlyph() {
  return (
    <svg
      width="28"
      height="20"
      viewBox="0 0 28 20"
      fill="none"
      aria-hidden
      className="shrink-0 text-v2-highlight-border"
    >
      <rect x="2" y="7" width="2.5" height="6" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="7" y="3" width="2.5" height="14" rx="1" fill="currentColor" />
      <rect x="12" y="5" width="2.5" height="10" rx="1" fill="currentColor" opacity="0.85" />
      <rect x="17" y="2" width="2.5" height="16" rx="1" fill="currentColor" />
      <rect x="22" y="6" width="2.5" height="8" rx="1" fill="currentColor" opacity="0.75" />
    </svg>
  );
}
