type Chapter = {
  id: string;
  label: string;
  /** 0–1 fill for the current segment; omitted / 0 = empty track */
  progress?: number;
  active?: boolean;
};

type Props = {
  tipEg: string;
  chapters?: Chapter[];
  avatarSrc?: string;
  paused?: boolean;
  speedLabel?: string;
  onTogglePause?: () => void;
  onCycleSpeed?: () => void;
  className?: string;
};

export function CaptionBar({
  tipEg,
  chapters = [],
  avatarSrc,
  paused,
  speedLabel = '1×',
  onTogglePause,
  onCycleSpeed,
  className,
}: Props) {
  return (
    <div
      className={[
        'border-t border-v2-ink/20 bg-v2-ink text-white',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center gap-2.5 px-3 pt-2.5">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/15 ring-1 ring-white/25">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center font-[family-name:var(--font-v2-display-ar)] text-sm"
              aria-hidden
            >
              م
            </div>
          )}
        </div>

        <p className="min-w-0 flex-1 font-[family-name:var(--font-v2-arabic)] text-sm leading-6">
          {tipEg}
        </p>

        <SoundWaveGlyph />

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={paused ? 'تشغيل' : 'إيقاف'}
            onClick={onTogglePause}
            className="rounded-v2-chip px-2 py-1 font-[family-name:var(--font-v2-ui)] text-xs text-white/90"
          >
            {paused ? '▶' : '❚❚'}
          </button>
          <button
            type="button"
            aria-label="السرعة"
            onClick={onCycleSpeed}
            className="rounded-v2-chip px-2 py-1 font-[family-name:var(--font-v2-ui)] text-xs text-white/90"
          >
            {speedLabel}
          </button>
        </div>
      </div>

      {chapters.length ? (
        <div className="flex gap-1.5 px-3 pb-2.5 pt-2">
          {chapters.map((ch) => {
            const fill = ch.active
              ? Math.min(1, Math.max(0, ch.progress ?? 0.45))
              : ch.progress != null && ch.progress > 0
                ? Math.min(1, ch.progress)
                : 0;
            return (
              <div key={ch.id} className="min-w-0 flex-1">
                <div className="h-1 overflow-hidden rounded-full bg-white/20">
                  <div
                    className={[
                      'h-full rounded-full transition-[width]',
                      ch.active ? 'bg-v2-highlight-border' : 'bg-white/50',
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
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
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
