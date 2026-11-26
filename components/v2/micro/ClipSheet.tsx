'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { playSpeech } from '@/components/v2/player/speech';
import { toArDigits } from '@/lib/v2/formatAr';
import { PlaceholderBar } from './PlaceholderBar';
import { ScenePicture } from './ScenePicture';
import { TlWithHighlight } from './TlWithHighlight';

export type ClipLineView = {
  item_id: string;
  tl: string;
  ar: string;
  icon_url?: string | null;
  box?: { x: number; y: number; w: number; h: number } | null;
  highlight?: { start: number; end: number } | null;
};

export type ClipView = {
  id: string;
  layout: 'list' | 'pairs' | 'scene' | 'rule';
  title_tl: string;
  title_ar: string;
  note?: string | null;
  level: number;
  main_image_url?: string | null;
  rule_card?: {
    pattern_tl: string;
    pattern_ar?: string;
    ending_table?: Array<{ label: string; from: string; to: string }>;
  } | null;
  lines: ClipLineView[];
};

const LEVEL = ['', 'سهل جداً', 'سهل', 'متوسط', 'أصعب شوية', 'صعب'];
const ADVANCE_MS = 1500;

export function ClipSheet({
  clip,
  seriesTitle,
  clipIndex,
  clipTotal,
  initialRevealed = 0,
  initialListening = false,
  onClose,
  onReveal,
  onFinished,
  onSaveLine,
  onNext,
}: {
  clip: ClipView;
  seriesTitle?: string;
  clipIndex?: number;
  clipTotal?: number;
  initialRevealed?: number;
  initialListening?: boolean;
  onClose?: () => void;
  onReveal?: (count: number) => void;
  onFinished?: () => void;
  onSaveLine?: (itemId: string) => void;
  onNext?: () => void;
}) {
  const [revealed, setRevealed] = useState(initialRevealed);
  const [active, setActive] = useState(
    Math.min(initialRevealed, Math.max(0, clip.lines.length - 1)),
  );
  const [listening, setListening] = useState(initialListening);
  const [autoplay, setAutoplay] = useState(false);
  const [done, setDone] = useState(
    initialRevealed >= clip.lines.length && clip.lines.length > 0,
  );
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      audioAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (done) return;
    void playActive(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function playActive(index: number) {
    const line = clip.lines[index];
    if (!line) return;
    audioAbort.current?.abort();
    const ac = new AbortController();
    audioAbort.current = ac;
    try {
      await playSpeech(line.tl, 'pt', ac.signal);
    } catch {
      /* aborted or tts fail */
    }
  }

  function clearAdvance() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }

  function revealCurrent() {
    if (done) return;
    const nextCount = Math.max(revealed, active + 1);
    setRevealed(nextCount);
    onReveal?.(nextCount);
    clearAdvance();
    if (nextCount >= clip.lines.length) {
      setDone(true);
      onFinished?.();
      return;
    }
    const go = () => {
      setActive(nextCount);
      if (autoplay) {
        advanceTimer.current = setTimeout(
          () => revealCurrent(),
          ADVANCE_MS + 800,
        );
      }
    };
    advanceTimer.current = setTimeout(go, ADVANCE_MS);
  }

  function onSheetTap() {
    if (autoplay) {
      setAutoplay(false);
      clearAdvance();
      return;
    }
    if (active < revealed) {
      void playActive(active);
      return;
    }
    revealCurrent();
  }

  function onRowTap(index: number) {
    if (index < revealed) {
      setActive(index);
      void playActive(index);
      return;
    }
    if (index === active) {
      revealCurrent();
    }
  }

  function showTl(index: number): boolean {
    if (!listening) return true;
    return index < revealed || (index === active && revealed > index);
  }

  function showAr(index: number): boolean {
    return index < revealed;
  }

  function arTextForRender(index: number): string | null {
    return showAr(index) ? clip.lines[index]!.ar : null;
  }

  const seriesLabel =
    seriesTitle && clipIndex != null && clipTotal != null
      ? `${seriesTitle} · ${toArDigits(clipIndex + 1)} من ${toArDigits(clipTotal)}`
      : 'لقطة لغوية سريعة';

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-background"
      dir="rtl"
      data-testid="clip-sheet"
      data-revealed={revealed}
      onClick={onSheetTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSheetTap();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Top control bar */}
      <header className="flex items-center justify-between gap-2 bg-surface-container-lowest px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {onClose ? (
            <button
              type="button"
              aria-label="إغلاق"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-on-surface-variant shadow-sm hover:bg-surface-variant"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              <Icon name="close" size={20} />
            </button>
          ) : null}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed/40 px-3 py-1 text-on-primary-fixed-variant">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <span className="truncate font-[family-name:var(--font-v2-arabic)] text-[10px] font-bold">
              {seriesLabel}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-bold shadow-sm ${
              listening
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setListening((v) => !v);
            }}
          >
            <Icon name="hearing" size={20} className="!text-[16px]" />
            وضع السمع
          </button>
          <button
            type="button"
            aria-label={autoplay ? 'إيقاف' : 'تشغيل تلقائي'}
            className={`flex h-8 w-8 items-center justify-center rounded-full shadow-sm ${
              autoplay
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-primary'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setAutoplay((v) => !v);
              if (!autoplay) revealCurrent();
            }}
          >
            <Icon
              name={autoplay ? 'pause' : 'play_arrow'}
              size={20}
              fill
              className="!text-[16px]"
            />
          </button>
        </div>
      </header>

      {/* Teal header band + segmented progress */}
      <div className="relative overflow-hidden bg-primary-container px-4 pb-3.5 pt-3.5 text-on-primary-container shadow-sm">
        <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-surface-container-lowest/5" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="font-[family-name:var(--font-v2-target)] text-[28px] font-bold tracking-wide text-surface-container-lowest"
              dir="ltr"
            >
              {clip.title_tl}
            </h1>
            <p className="mt-0.5 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-primary-fixed">
              {clip.title_ar}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-surface-container-lowest px-2.5 py-0.5 text-[10px] font-bold text-primary shadow-sm">
            {LEVEL[clip.level] ?? ''}
          </span>
        </div>
        {clip.lines.length > 0 ? (
          <div className="relative z-10 mt-4 flex items-center gap-1.5" dir="rtl">
            {clip.lines.map((_, i) => {
              const filled = i < revealed;
              const current = i === active && !done;
              return (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    filled
                      ? 'bg-secondary-fixed'
                      : current
                        ? 'bg-primary-fixed'
                        : 'bg-on-primary-container/20'
                  }`}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      {clip.layout === 'rule' && clip.rule_card ? (
        <div className="mx-4 mt-3 rounded-xl bg-surface-container-low px-3 py-2">
          <p className="font-semibold text-on-surface" dir="ltr">
            {clip.rule_card.pattern_tl}
          </p>
          {clip.rule_card.pattern_ar ? (
            <p className="text-sm text-on-surface-variant">
              {clip.rule_card.pattern_ar}
            </p>
          ) : null}
          {clip.rule_card.ending_table?.length ? (
            <div className="mt-1 flex flex-wrap gap-2" dir="ltr">
              {clip.rule_card.ending_table.map((row) => (
                <span
                  key={row.label}
                  className="rounded-md bg-surface-container px-2 py-0.5 text-xs"
                >
                  {row.label}: {row.from} → {row.to}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Hero */}
      <div
        className={`relative w-full overflow-hidden bg-surface-container-lowest ${
          clip.layout === 'pairs' ? 'mt-3 max-h-24 px-4' : 'aspect-[4/3] max-h-[290px]'
        }`}
      >
        {clip.layout === 'scene' ? (
          <ScenePicture
            src={clip.main_image_url}
            alt={clip.title_tl}
            lines={clip.lines.map((l, i) => ({
              box: l.box,
              label: l.tl,
              active: i === active,
              revealed: i < revealed,
              index: i + 1,
            }))}
          />
        ) : clip.layout === 'pairs' ? (
          <div className="relative h-20 w-full overflow-hidden rounded-xl bg-surface-container-low shadow-sm">
            {clip.main_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clip.main_image_url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-surface-container" />
            )}
            <div className="absolute inset-0 bg-gradient-to-l from-on-surface/80 via-on-surface/40 to-transparent" />
            <div className="relative z-10 flex h-full items-center justify-between px-4">
              <div className="flex flex-col justify-center">
                <span className="font-[family-name:var(--font-v2-arabic)] text-[10px] uppercase tracking-wider text-primary-fixed">
                  لقطة لغوية سريعة
                </span>
                <span className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-surface-container-lowest drop-shadow">
                  {clip.title_ar}
                </span>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-lowest/20 text-surface-container-lowest">
                <Icon name="record_voice_over" size={20} />
              </div>
            </div>
          </div>
        ) : (
          <>
            {clip.main_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clip.main_image_url}
                alt=""
                className="h-full w-full object-fill"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-surface-container text-on-surface-variant">
                <Icon name="image" size={32} />
              </div>
            )}
            {clip.main_image_url ? (
              <div
                className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-on-surface/60 px-2.5 py-1 font-[family-name:var(--font-v2-arabic)] text-[10px] text-surface-container-lowest"
                dir="ltr"
              >
                <Icon
                  name="headphones"
                  size={20}
                  className="!text-[13px] text-primary-fixed"
                />
                <span>
                  {toArDigits(clip.lines.length)} لقطات سريعة
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Connected lines card overlapping hero */}
      <div className="relative z-10 -mt-2 flex flex-1 flex-col gap-2 px-4 pb-28">
        {done ? (
          <FinishedRows clip={clip} onSaveLine={onSaveLine} />
        ) : (
          <div
            className={`flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-md ${
              clip.layout === 'pairs' ? 'gap-2 p-2' : ''
            }`}
          >
            {clip.lines.map((line, i) => {
              const isActive = i === active;
              const isRevealed = i < revealed;
              const isFuture = i > active;
              const ar = arTextForRender(i);

              if (clip.layout === 'pairs') {
                return (
                  <button
                    key={line.item_id + i}
                    type="button"
                    className={`grid w-full grid-cols-2 gap-2 ${
                      isFuture ? 'opacity-55' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRowTap(i);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (ar) onSaveLine?.(line.item_id);
                    }}
                  >
                    <div
                      className={`relative flex items-center justify-between rounded-lg px-3.5 py-3 ${
                        ar
                          ? 'bg-on-surface text-surface-container-lowest shadow-sm'
                          : isActive
                            ? 'bg-surface-container ring-2 ring-primary'
                            : 'bg-surface-container'
                      }`}
                    >
                      {ar ? (
                        <>
                          <span className="font-[family-name:var(--font-v2-arabic)] font-medium">
                            {ar}
                          </span>
                          <Icon
                            name="check"
                            size={20}
                            className="!text-[18px] text-surface-variant opacity-80"
                          />
                        </>
                      ) : (
                        <PlaceholderBar widthCh={Math.min(14, line.ar.length)} />
                      )}
                    </div>
                    <div
                      className={`relative flex items-center justify-between overflow-hidden rounded-lg px-3.5 py-3 text-left shadow-sm ${
                        isActive && !isRevealed
                          ? 'bg-primary text-on-primary'
                          : isRevealed
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-low text-on-surface-variant'
                      }`}
                      dir="ltr"
                    >
                      {showTl(i) && !isFuture ? (
                        <span className="font-[family-name:var(--font-v2-target)] font-semibold tracking-wide">
                          {line.tl}
                        </span>
                      ) : (
                        <PlaceholderBar
                          widthCh={Math.min(14, line.tl.length)}
                          className={
                            isActive ? 'bg-on-primary/35' : undefined
                          }
                        />
                      )}
                      {isActive && !isRevealed ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-primary/90 font-[family-name:var(--font-v2-arabic)] text-[11px] font-bold text-on-primary">
                          اضغط للكشف
                        </span>
                      ) : isRevealed ? (
                        <Icon
                          name="volume_up"
                          size={20}
                          className="text-primary-fixed"
                        />
                      ) : (
                        <Icon
                          name="lock"
                          size={20}
                          className="!text-[18px] text-outline-variant"
                        />
                      )}
                    </div>
                  </button>
                );
              }

              return (
                <button
                  key={line.item_id + i}
                  type="button"
                  className={`relative flex w-full items-center gap-3 p-3.5 text-right transition-colors ${
                    i < clip.lines.length - 1
                      ? 'border-b border-outline-variant/20'
                      : ''
                  } ${
                    isActive
                      ? 'bg-primary-fixed/20'
                      : isRevealed
                        ? 'bg-surface-container-lowest'
                        : ''
                  } ${isFuture ? 'opacity-55' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRowTap(i);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (ar) onSaveLine?.(line.item_id);
                  }}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold shadow-sm ${
                      isRevealed || isActive
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {toArDigits(i + 1)}
                  </span>

                  {line.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={line.icon_url}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-container text-on-surface-variant">
                      <Icon name="chat_bubble" size={20} className="!text-[16px]" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    {showTl(i) && !isFuture ? (
                      <TlWithHighlight
                        tl={line.tl}
                        highlight={
                          clip.layout === 'rule' ? line.highlight : null
                        }
                        className="truncate font-[family-name:var(--font-v2-target)] font-semibold text-on-surface"
                      />
                    ) : (
                      <PlaceholderBar widthCh={Math.min(18, line.tl.length)} />
                    )}
                    <div className="mt-0.5 flex items-center gap-2">
                      {ar ? (
                        <span className="truncate font-[family-name:var(--font-v2-arabic)] text-sm text-on-surface-variant">
                          {ar}
                        </span>
                      ) : isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] font-bold text-on-primary shadow-sm">
                          اضغط
                        </span>
                      ) : (
                        <PlaceholderBar
                          widthCh={Math.min(16, line.ar.length)}
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {isFuture ? (
                      <Icon
                        name="lock"
                        size={20}
                        className="!text-[18px] text-outline-variant"
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label="استماع"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-surface-container-low"
                          onClick={(e) => {
                            e.stopPropagation();
                            void playActive(i);
                          }}
                        >
                          <Icon name="volume_up" size={20} />
                        </button>
                        {ar ? (
                          <button
                            type="button"
                            aria-label="حفظ"
                            className="flex h-8 w-8 items-center justify-center rounded-full text-tertiary hover:bg-surface-container-low"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSaveLine?.(line.item_id);
                            }}
                          >
                            <Icon name="favorite" size={20} fill />
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {clip.note && !done ? (
          <div className="mt-1 flex items-start gap-2 rounded-xl bg-tertiary-fixed px-3 py-2.5 text-on-tertiary-fixed">
            <Icon
              name="lightbulb"
              size={20}
              className="mt-0.5 shrink-0 text-on-tertiary-fixed-variant"
            />
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm">
              {clip.note}
            </p>
          </div>
        ) : null}
      </div>

      {done ? (
        <div
          className="fixed inset-x-0 bottom-0 z-20 rounded-t-2xl bg-surface-container-lowest p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant" />
          <div className="mb-2 flex items-center justify-center gap-2">
            <Icon name="check_circle" size={20} fill className="text-secondary" />
            <p className="text-center font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-on-surface">
              اتضافوا لكروتك · {toArDigits(clip.lines.length)} جمل
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl bg-primary py-3 font-[family-name:var(--font-v2-arabic)] font-semibold text-on-primary"
              onClick={() => onNext?.()}
            >
              اللقطة اللي بعدها
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl bg-surface-container py-3 font-[family-name:var(--font-v2-arabic)] font-semibold"
              onClick={() => {
                setListening(true);
                setRevealed(0);
                setActive(0);
                setDone(false);
              }}
            >
              تاني بوضع السمع
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FinishedRows({
  clip,
  onSaveLine,
}: {
  clip: ClipView;
  onSaveLine?: (itemId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 opacity-90">
      <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary-container/50 text-secondary">
            <Icon name="check_circle" size={20} fill />
          </div>
          <div className="min-w-0">
            <span className="block font-[family-name:var(--font-v2-arabic)] text-[10px] uppercase tracking-wider text-on-surface-variant">
              سلسلة اللقطات
            </span>
            <h2 className="truncate font-[family-name:var(--font-v2-target)] text-sm font-semibold text-on-surface">
              {clip.title_tl}
              <span className="font-[family-name:var(--font-v2-arabic)]">
                {' '}
                · {clip.title_ar}
              </span>
            </h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface-container-lowest px-2.5 py-1 shadow-sm">
          <Icon name="check_circle" size={20} fill className="!text-[16px] text-secondary" />
          <span className="font-[family-name:var(--font-v2-arabic)] text-[10px] font-bold text-secondary">
            {toArDigits(clip.lines.length)} / {toArDigits(clip.lines.length)} مبروك
          </span>
        </div>
      </div>
      {clip.lines.map((line, i) => (
        <div
          key={line.item_id + i}
          className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-2.5 shadow-sm"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary-container/60 text-secondary">
              <Icon name="check" size={20} fill className="!text-[16px]" />
            </div>
            <div className="min-w-0 truncate">
              <div
                className="truncate font-[family-name:var(--font-v2-target)] text-sm font-semibold text-on-surface"
                dir="ltr"
              >
                {line.tl}
              </div>
              <div className="truncate font-[family-name:var(--font-v2-arabic)] text-xs text-on-surface-variant">
                {line.ar}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="حفظ"
              className="flex h-8 w-8 items-center justify-center rounded-full text-tertiary"
              onClick={(e) => {
                e.stopPropagation();
                onSaveLine?.(line.item_id);
              }}
            >
              <Icon name="favorite" size={20} fill />
            </button>
            <span className="mr-1 font-[family-name:var(--font-v2-arabic)] text-[10px] text-outline">
              {toArDigits(i + 1)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Test helper: which Arabic strings would render for a reveal state. */
export function visibleArabic(
  lines: ClipLineView[],
  revealed: number,
): Array<string | null> {
  return lines.map((l, i) => (i < revealed ? l.ar : null));
}
