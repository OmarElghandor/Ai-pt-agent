'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { ReviewSession } from '@/lib/v2/review-chat/types';
import { playSpeech } from '@/components/v2/player/speech';
import { ChatThread } from './ChatThread';
import { ComposerTray } from './ComposerTray';
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
    <div className="mx-auto flex h-[100dvh] w-full max-w-[390px] flex-col overflow-hidden bg-v2-paper">
      <header className="sticky top-0 z-30 shrink-0 border-b border-v2-line bg-v2-paper/95 px-4 pt-safe pb-3 backdrop-blur-md">
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

      <ComposerTray
        composerKind={s.composerKind}
        promptAudio={s.promptAudio}
        imageCells={s.imageCells}
        options={s.options}
        chips={s.chips}
        selectedOption={s.selectedOption}
        setSelectedOption={s.setSelectedOption}
        closedChipsImmediate={s.closedChipsImmediate}
        onChipPick={s.onChipPick}
        composerText={s.composerText}
        setComposerText={s.setComposerText}
        submitText={s.submitText}
        submitOption={s.submitOption}
        requestHint={s.requestHint}
        tiles={s.tiles}
        tileOrder={s.tileOrder}
        setTileOrder={s.setTileOrder}
        submitTiles={s.submitTiles}
        onCantSpeak={s.onCantSpeak}
        onMicRecorded={s.onMicRecorded}
        selfRateNote={s.selfRateNote}
        onSelfRate={s.onSelfRate}
        advance={s.advance}
        nextLabel={s.nextLabel}
        footer={s.footer}
      />
    </div>
  );
}
