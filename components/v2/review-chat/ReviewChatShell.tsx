'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { ReviewSession } from '@/lib/v2/review-chat/types';
import { playSpeech } from '@/components/v2/player/speech';
import { AudioPrompt } from './AudioPrompt';
import { ChatThread } from './ChatThread';
import { ChipRow } from './ChipRow';
import { ImageGrid } from './ImageGrid';
import { ChoiceSheet } from './ChoiceSheet';
import { MicComposer } from './MicComposer';
import { SelfRating } from './SelfRating';
import { TextComposer } from './TextComposer';
import { TileTray } from './TileTray';
import { useReviewChatSession } from './useReviewChatSession';

type Props = {
  session: ReviewSession;
  learnerName: string;
  fixtureMode?: boolean;
  backHref?: string;
  /** Testing: rebuild today's review (admins / non-production only). */
  onRegenerate?: () => void;
};

export function ReviewChatShell({
  session,
  learnerName,
  fixtureMode,
  backHref = '/path',
  onRegenerate,
}: Props) {
  const s = useReviewChatSession({
    session,
    fixtureMode,
    learnerName,
  });

  const segments = Array.from({ length: s.progressSegments }, (_, i) => i);
  const autoplayed = useRef<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  // Find-image: autoplay the target phrase once per step (lesson FindImageStep).
  useEffect(() => {
    if (s.composerKind !== 'image_grid') return;
    const text = s.promptAudio?.trim();
    if (!text) return;
    if (autoplayed.current.has(s.currentStep)) return;
    autoplayed.current.add(s.currentStep);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    void playSpeech(text, 'pt', ac.signal);
    return () => {
      ac.abort();
    };
  }, [s.composerKind, s.promptAudio, s.currentStep]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-v2-paper">
      <header className="sticky top-0 z-30 border-b border-v2-line bg-v2-paper/95 px-4 pt-safe pb-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            aria-label="رجوع"
            className="flex size-11 items-center justify-center rounded-full text-v2-ink hover:bg-v2-panel"
          >
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-ink">
              مراجعة النهارده
            </h1>
            <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              {s.headerSubtitle}
            </p>
          </div>
          {onRegenerate ? (
            <button
              type="button"
              onClick={onRegenerate}
              aria-label="ولّد المراجعة من جديد"
              title="ولّد المراجعة من جديد"
              className="flex size-11 items-center justify-center rounded-full text-lg text-v2-ink-muted hover:bg-v2-panel"
            >
              ↻
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex items-center gap-1" role="progressbar">
          {segments.map((i) => (
            <span
              key={i}
              className={[
                'h-1.5 flex-1 rounded-full',
                i < s.progressFilled ? 'bg-v2-primary' : 'bg-v2-line',
              ].join(' ')}
            />
          ))}
        </div>
      </header>

      <ChatThread
        messages={s.messages}
        expandedRounds={s.expandedRounds}
        onToggleRound={s.toggleRound}
        onRoundContinue={s.continueRound}
        onRoundStop={s.stopSession}
        sessionLessons={s.sessionLessons}
        typingLabel={s.typingLabel}
      />

      <section className="fixed bottom-0 z-30 w-full max-w-[390px] rounded-t-[24px] border-t border-v2-line bg-v2-paper/95 px-4 pb-safe pt-3 shadow-lg backdrop-blur-md">
        {s.composerKind === 'image_grid' ? (
          <div className="space-y-3">
            {s.promptAudio ? <AudioPrompt text={s.promptAudio} /> : null}
            <ImageGrid
              cells={s.imageCells.map(({ id, label, url, state }) => ({
                id,
                label,
                url,
                state,
              }))}
              onPick={(_, index) => void s.submitOption(index)}
            />
          </div>
        ) : null}

        {s.composerKind === 'choice' ? (
          <ChoiceSheet
            options={s.options.map((o) => ({
              id: o.id,
              label: o.label,
              tl: !o.ar,
            }))}
            selected={s.selectedOption}
            onSelect={s.setSelectedOption}
            onConfirm={() => {
              if (s.selectedOption != null) {
                void s.submitOption(Number(s.selectedOption));
              }
            }}
          />
        ) : null}

        {s.composerKind === 'chips' ? (
          <ChipRow
            chips={s.chips.map((c) => ({ id: c.id, label: c.label }))}
            selected={s.selectedOption}
            onSelect={(id) => {
              s.setSelectedOption(id);
              if (s.closedChipsImmediate) s.onChipPick(id);
            }}
          />
        ) : null}

        {s.composerKind === 'text' ? (
          <TextComposer
            value={s.composerText}
            onChange={s.setComposerText}
            onSubmit={() => void s.submitText(s.composerText)}
            onHint={() => s.requestHint()}
          />
        ) : null}

        {s.composerKind === 'tiles' ? (
          <TileTray
            tiles={s.tiles}
            selected={s.tileOrder}
            onToggle={(i) =>
              s.setTileOrder((prev) =>
                prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
              )
            }
            onClear={() => s.setTileOrder([])}
            onConfirm={() => s.submitTiles()}
            onHint={() => undefined}
          />
        ) : null}

        {s.composerKind === 'mic' ? (
          <>
            <MicComposer
              onCantSpeak={s.onCantSpeak}
              onRecorded={s.onMicRecorded}
              note={s.selfRateNote}
            />
          </>
        ) : null}

        {s.composerKind === 'self_rate' ? (
          <SelfRating onRate={s.onSelfRate} />
        ) : null}

        {s.composerKind === 'next' ? (
          <button
            type="button"
            onClick={s.advance}
            className="mb-2 w-full rounded-2xl bg-v2-primary py-3.5 font-[family-name:var(--font-v2-arabic)] text-base font-bold text-v2-on-primary"
          >
            {s.nextLabel}
          </button>
        ) : null}

        {s.composerKind !== 'session_end' && s.composerKind !== 'round_end' ? (
          <p className="mt-2 text-center font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-meta">
            {s.footer}
          </p>
        ) : null}
      </section>
    </div>
  );
}
