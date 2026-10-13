'use client';

import { ChipRow, WordBank } from '@/components/LessonChrome';
import { SpeakingOrb, type OrbMode } from '@/components/SpeakingOrb';
import type { Segment } from '@/lib/parseTaggedMessage';
import type { Chip } from '@/lib/progressTypes';

type Props = {
  mode: OrbMode;
  segments: Segment[];
  activeIndex: number | null;
  transcript: string;
  error: string | null;
  recording: boolean;
  onMic: () => void;
  onOpenText: () => void;
  onCancel: () => void;
  onStopSpeaking: () => void;
  speaking: boolean;
  chips: Chip[];
  onChip: (chip: Chip) => void;
  wordBank?: { pt: string; meaning: string }[] | null;
  sentenceFrame?: string | null;
  hearLabel: string | null;
  onHear: () => void;
  caption: Segment[];
};

export function VoiceScreen({
  mode,
  segments,
  activeIndex,
  transcript,
  error,
  recording,
  onMic,
  onOpenText,
  onCancel,
  onStopSpeaking,
  speaking,
  chips,
  onChip,
  wordBank,
  sentenceFrame,
  hearLabel,
  onHear,
  caption,
}: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center">
        <SpeakingOrb
          mode={mode}
          segments={segments}
          activeIndex={activeIndex}
          transcript={transcript}
          error={error}
          caption={caption}
          idleLabel={null}
        />
        {speaking && (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="mb-4 rounded-full border border-border px-4 py-1.5 text-xs text-muted"
          >
            إيقاف الصوت
          </button>
        )}
        {hearLabel && (
          <button
            type="button"
            onClick={onHear}
            className="mb-4 rounded-full border border-accent-mint/40 px-4 py-1.5 text-sm text-accent-mint"
          >
            {hearLabel}
          </button>
        )}
      </div>

      {(wordBank && wordBank.length > 0) || sentenceFrame ? (
        <div className="px-6 pb-2">
          <WordBank words={wordBank ?? []} frame={sentenceFrame} onInsert={() => {}} />
        </div>
      ) : null}

      <ChipRow chips={chips} onChip={onChip} />

      <div className="safe-bottom flex items-center justify-between px-8 pb-8 pt-2">
        <button
          type="button"
          aria-label="فتح المحادثة النصية"
          onClick={onOpenText}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface/80 text-white/80"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          aria-label={recording ? 'إيقاف التسجيل' : 'تسجيل'}
          onClick={onMic}
          className={`flex h-16 w-16 items-center justify-center rounded-full ${
            recording ? 'bg-red-500' : 'bg-accent-mint'
          } text-[#04100e] shadow-lg`}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
          </svg>
        </button>

        <button
          type="button"
          aria-label="إلغاء"
          onClick={onCancel}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface/80 text-white/80"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
