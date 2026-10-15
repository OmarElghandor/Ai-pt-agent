'use client';

import { useEffect, useRef } from 'react';
import {
  AssessmentHeaderBar,
  ChipRow,
  PracticeHeader,
  WordBank,
} from '@/components/LessonChrome';
import { TypedBubble, UserBubble, ttsSegmentsFor } from '@/components/TypedBubble';
import type { AssessmentHeader, StageHeader } from '@/lib/learnerView';
import type { AuthoredSegment } from '@/lib/lessons/types';
import type { Chip, TypedMessage } from '@/lib/progressTypes';

type Props = {
  messages: TypedMessage[];
  status: string;
  error?: Error | undefined;
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onStop: () => void;
  onPlaySegments: (segments: AuthoredSegment[]) => void;
  onOpenVoice: () => void;
  isBusy: boolean;
  booted: boolean;
  chips: Chip[];
  onChip: (chip: Chip) => void;
  practiceHeader: StageHeader | null;
  assessmentHeader: AssessmentHeader | null;
  wordBank: { pt: string; meaning: string }[] | null;
  sentenceFrame: string | null;
  onEndPractice?: () => void;
  canEndPractice?: boolean;
  /** Disable composer / chips (e.g. while scene word card is blocking). */
  controlsDisabled?: boolean;
  /** Local reopen chip for scene words (scrolls to in-chat card). */
  showSceneWordChip?: boolean;
  onOpenSceneWords?: () => void;
  /** Scene id currently gated — shows «يلا نبدأ» on matching scene-words message. */
  sceneWordGateSceneId?: string | null;
  onDismissSceneWords?: () => void;
  /** When set, scroll this scene-words message into view (reopen chip). */
  scrollToSceneId?: string | null;
};

export function ChatScreen({
  messages,
  status,
  error,
  input,
  setInput,
  onSubmit,
  onStop,
  onPlaySegments,
  onOpenVoice,
  isBusy,
  booted,
  chips,
  onChip,
  practiceHeader,
  assessmentHeader,
  wordBank,
  sentenceFrame,
  onEndPractice,
  canEndPractice,
  controlsDisabled = false,
  showSceneWordChip = false,
  onOpenSceneWords,
  sceneWordGateSceneId = null,
  onDismissSceneWords,
  scrollToSceneId = null,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const locked = isBusy || controlsDisabled;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  useEffect(() => {
    if (!scrollToSceneId) return;
    const el = document.getElementById(`scene-words-${scrollToSceneId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scrollToSceneId, messages]);

  return (
    <>
      {(practiceHeader || assessmentHeader || canEndPractice) && (
        <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
          {practiceHeader ? <PracticeHeader header={practiceHeader} /> : null}
          {assessmentHeader ? <AssessmentHeaderBar header={assessmentHeader} /> : null}
          {canEndPractice && onEndPractice ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onEndPractice}
                className="text-xs text-zinc-400 underline hover:text-white"
              >
                إنهاء التمرين
              </button>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !isBusy && booted && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-lg font-medium">أهلاً! جاهز نتكلم؟</p>
          </div>
        )}

        <ul className="flex flex-col gap-4">
          {messages.map((m) => {
            if (m.role === 'user') {
              return (
                <li key={m.id} className="flex justify-end">
                  <UserBubble message={m} />
                </li>
              );
            }
            const gateActive =
              m.type === 'scene-words' &&
              Boolean(m.sceneWordCard?.sceneId) &&
              m.sceneWordCard!.sceneId === sceneWordGateSceneId;
            return (
              <li key={m.id} className="flex flex-col gap-1.5 items-start">
                <TypedBubble
                  message={m}
                  onPlay={(segs) => onPlaySegments(segs)}
                  onInsertWord={(pt) => setInput(input ? `${input} ${pt}` : pt)}
                  onWhy={
                    m.showWhyChip
                      ? () =>
                          onChip({
                            id: 'why-grammar',
                            label: 'ليه؟',
                            action: { type: 'show-grammar-card' },
                          })
                      : undefined
                  }
                  sceneWordGateActive={gateActive}
                  onDismissSceneWords={onDismissSceneWords}
                />
                {status !== 'streaming' &&
                m.type !== 'praise' &&
                m.type !== 'narration' &&
                m.type !== 'scene-words' ? (
                  <button
                    type="button"
                    onClick={() => onPlaySegments(ttsSegmentsFor(m))}
                    className="text-[11px] text-zinc-500 hover:text-white"
                  >
                    ▶ تشغيل
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {isBusy && <div className="mt-4 text-sm text-muted">بيكتب…</div>}

        {error && (
          <p className="mt-4 text-center text-sm text-red-300">حصل خطأ: {error.message}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {(wordBank && wordBank.length > 0) || sentenceFrame ? (
        <div className="px-3 pb-2">
          <WordBank
            words={wordBank ?? []}
            frame={sentenceFrame}
            onInsert={(pt) => setInput(input ? `${input} ${pt}` : pt)}
          />
        </div>
      ) : null}

      <div className="px-3">
        {showSceneWordChip && onOpenSceneWords ? (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={onOpenSceneWords}
              disabled={controlsDisabled}
              className="rounded-full border border-accent-mint/35 bg-accent-mint/10 px-3 py-1.5 text-xs text-accent-mint disabled:opacity-40"
            >
              كلمات المشهد
            </button>
          </div>
        ) : null}
        <ChipRow chips={chips} disabled={locked} onChip={onChip} />
      </div>
      <form
        onSubmit={(e) => {
          if (controlsDisabled) {
            e.preventDefault();
            return;
          }
          onSubmit(e);
        }}
        className="safe-bottom flex items-center gap-2.5 px-4 pb-5 pt-2"
      >
        <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-surface/90 px-4 py-2.5 backdrop-blur">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب رسالة..."
            dir="auto"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-muted"
            disabled={controlsDisabled || (isBusy && status === 'submitted')}
          />
          <button
            type="button"
            aria-label="وضع الصوت"
            onClick={onOpenVoice}
            className="text-muted hover:text-accent-mint"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0" strokeLinecap="round" />
              <path d="M3 17c2-4 4-4 6 0s4 4 6 0 4-4 6 0" strokeLinecap="round" opacity="0.5" />
            </svg>
          </button>
        </div>

        {isBusy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="إيقاف"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            aria-label="إرسال"
            disabled={controlsDisabled || !input.trim()}
            className="accent-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[#04100e] shadow-lg shadow-teal-900/40 disabled:opacity-40"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="scale-x-[-1] translate-x-px">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        )}
      </form>
    </>
  );
}
