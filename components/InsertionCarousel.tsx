'use client';

type Word = { pt: string; meaning: string; emoji?: string };

type Props = {
  words: Word[];
  /** Stuck hints: tap card to insert into the input. */
  onInsert?: (pt: string) => void;
  /** Scene words: play TTS for this word (play button on each card). */
  onPlay?: (pt: string) => void;
  activePt?: string | null;
  playing?: boolean;
};

function CardIcon({ emoji }: { emoji?: string }) {
  if (!emoji?.trim()) return null;
  return (
    <span className="flex h-8 w-8 items-center justify-center text-xl leading-none" aria-hidden>
      {emoji}
    </span>
  );
}

/** Horizontal snap carousel of PT word cards (existing zinc/emerald / mint theme). */
export function InsertionCarousel({
  words,
  onInsert,
  onPlay,
  activePt = null,
  playing = false,
}: Props) {
  if (!words.length) return null;

  const playMode = Boolean(onPlay);

  return (
    <div
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 snap-x snap-mandatory [scrollbar-width:thin]"
      dir="ltr"
    >
      {words.map((w) => {
        const isActive = playing && activePt === w.pt;
        const body = (
          <>
            <CardIcon emoji={w.emoji} />
            <span className="text-base font-medium leading-snug text-emerald-300">{w.pt}</span>
            {w.meaning ? (
              <span className="text-[11px] leading-tight text-zinc-400" dir="rtl">
                {w.meaning}
              </span>
            ) : null}
          </>
        );

        return (
          <div
            key={w.pt}
            className="flex w-[42%] min-w-[7.5rem] max-w-[10rem] shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl border border-zinc-600 bg-zinc-800 px-3 py-3 text-center"
          >
            {playMode ? (
              <>
                {body}
                <button
                  type="button"
                  aria-label={`اسمع ${w.pt}`}
                  onClick={() => onPlay?.(w.pt)}
                  className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full border text-sm ${
                    isActive
                      ? 'border-accent-mint bg-accent-mint/20 text-accent-mint'
                      : 'border-zinc-600 text-zinc-300'
                  }`}
                >
                  ▶
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onInsert?.(w.pt)}
                className="flex w-full flex-col items-center gap-1.5"
              >
                {body}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
