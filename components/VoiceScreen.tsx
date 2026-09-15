'use client';

import type { Segment } from '@/lib/parseTaggedMessage';
import { SpeakingOrb, type OrbMode } from '@/components/SpeakingOrb';

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
      </div>

      {/* Bottom dock — chat bubble | mic | X */}
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
            strokeWidth="1.8"
          >
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="relative flex items-center justify-center">
          {recording && (
            <>
              <span className="absolute h-24 w-24 animate-ping rounded-full bg-accent-mint/20" />
              <span className="absolute h-20 w-20 rounded-full border border-accent-mint/40" />
            </>
          )}
          <button
            type="button"
            aria-label={recording ? 'إيقاف التسجيل' : 'ابدأ التسجيل'}
            onClick={onMic}
            className={`accent-gradient relative z-10 flex h-16 w-16 items-center justify-center rounded-full text-[#04100e] shadow-lg shadow-teal-900/50 ${
              recording ? 'scale-105 ring-4 ring-accent-mint/30' : ''
            }`}
          >
            {recording ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" />
                <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11z" />
              </svg>
            )}
          </button>
        </div>

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
