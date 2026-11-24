'use client';

import { useEffect, useRef } from 'react';
import type { ThreadMessage } from '@/lib/v2/review-chat/types';
import { CharacterBubble } from './CharacterBubble';
import { CoachMessage } from './CoachMessage';
import { FeedbackPanel } from './FeedbackPanel';
import { LearnerBubble } from './LearnerBubble';
import { QuestionCard } from './QuestionCard';
import { RoundDivider } from './RoundDivider';
import { RoundEndCard } from './RoundEndCard';
import { SessionEndCard } from './SessionEndCard';
import { TypingRow } from './TypingRow';

type Props = {
  messages: ThreadMessage[];
  expandedRounds: Set<number>;
  onToggleRound: (round: number) => void;
  onRoundContinue?: () => void;
  onRoundStop?: () => void;
  sessionLessons?: Array<{ title: string; subtitle?: string; status: string }>;
  typingLabel: string;
};

export function ChatThread({
  messages,
  expandedRounds,
  onToggleRound,
  onRoundContinue,
  onRoundStop,
  sessionLessons,
  typingLabel,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const id = requestAnimationFrame(() => {
      try {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
      } catch {
        scroller.scrollTop = scroller.scrollHeight;
      }
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    return () => cancelAnimationFrame(id);
  }, [messages]);

  return (
    <div
      ref={scrollerRef}
      className="flex-1 space-y-5 overflow-y-auto px-4 pt-4 pb-48 no-scrollbar"
    >
      {messages.map((m) => {
        switch (m.kind) {
          case 'opening':
            return (
              <CoachMessage key={m.id}>
                <div className="rounded-v2-bubble rounded-tr-sm border border-v2-line bg-v2-paper px-4 py-3 shadow-sm">
                  <p className="font-[family-name:var(--font-v2-arabic)] text-sm leading-relaxed text-v2-ink">
                    {m.text}
                  </p>
                </div>
              </CoachMessage>
            );
          case 'round_divider':
            return <RoundDivider key={m.id} label={m.text ?? ''} />;
          case 'round_collapsed':
            return (
              <RoundDivider
                key={m.id}
                label={m.text ?? ''}
                collapsed
                onToggle={() => m.round != null && onToggleRound(m.round)}
              />
            );
          case 'character':
            return (
              <CharacterBubble
                key={m.id}
                name={m.characterName ?? ''}
                tl={m.characterTl ?? ''}
                hiddenUntilAnswered
                answered={!m.characterHidden}
              />
            );
          case 'question':
            return (
              <QuestionCard
                key={m.id}
                question={m.question}
                lessonDay={m.lessonDay}
                stepInRound={m.stepInRound}
                stepsInRound={m.stepsInRound}
                compact={m.compact}
                audioText={m.audioText}
                learnerText={m.learnerText}
              />
            );
          case 'learner':
            return <LearnerBubble key={m.id} text={m.text ?? ''} />;
          case 'feedback':
            return m.display ? (
              <div key={m.id} className="ps-10">
                <FeedbackPanel
                  display={m.display}
                  stepIndex={m.stepIndex ?? 0}
                />
              </div>
            ) : null;
          case 'typing':
            return <TypingRow key={m.id} label={typingLabel} />;
          case 'hint':
            return (
              <CoachMessage key={m.id}>
                <div className="rounded-v2-bubble rounded-tr-sm border border-v2-line bg-v2-panel px-4 py-3 shadow-sm">
                  <p className="font-[family-name:var(--font-v2-arabic)] text-sm leading-relaxed text-v2-ink">
                    {m.text}
                  </p>
                </div>
              </CoachMessage>
            );
          case 'round_end':
            return (
              <RoundEndCard
                key={m.id}
                round={m.round ?? 1}
                count={m.answeredCount ?? 0}
                nextRound={(m.round ?? 1) + 1}
                onContinue={() => onRoundContinue?.()}
                onStop={() => onRoundStop?.()}
              />
            );
          case 'session_end':
            return (
              <SessionEndCard
                key={m.id}
                lessons={sessionLessons ?? []}
              />
            );
          default:
            return null;
        }
      })}
      <div ref={endRef} />
    </div>
  );
}