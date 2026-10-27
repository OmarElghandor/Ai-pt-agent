'use client';

import { useCallback, useRef, useState } from 'react';

type Props = {
  text: string;
  lang?: 'pt' | 'ar';
  /** When true, show both normal and slow (turtle) controls. */
  showSlow?: boolean;
  className?: string;
  label?: string;
};

async function fetchTts(text: string, lang: 'pt' | 'ar'): Promise<Blob> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) {
    throw new Error(`TTS failed: ${res.status}`);
  }
  return res.blob();
}

export function AudioButton({
  text,
  lang = 'pt',
  showSlow = false,
  className,
  label = 'تشغيل',
}: Props) {
  const cacheRef = useRef<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState(false);

  const play = useCallback(
    async (slow: boolean) => {
      if (!text.trim() || busy) return;
      setBusy(true);
      try {
        if (!cacheRef.current) {
          cacheRef.current = await fetchTts(text, lang);
        }
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        const url = URL.createObjectURL(cacheRef.current);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.preservesPitch = true;
        audio.playbackRate = slow ? 0.75 : 1;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setBusy(false);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setBusy(false);
        };
        await audio.play();
      } catch {
        setBusy(false);
      }
    },
    [busy, lang, text],
  );

  return (
    <span className={['inline-flex items-center gap-1.5', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        aria-label={label}
        disabled={busy}
        onClick={() => void play(false)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-v2-ink bg-v2-card text-v2-ink disabled:opacity-50"
      >
        <SpeakerIcon size={18} />
      </button>
      {showSlow ? (
        <button
          type="button"
          aria-label="بطيء"
          disabled={busy}
          onClick={() => void play(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-v2-rule bg-v2-card text-v2-ink-muted disabled:opacity-50"
        >
          <TurtleIcon />
        </button>
      ) : null}
    </span>
  );
}

export function SpeakerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 5L6 9H3v6h3l5 4V5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 8.5a4.5 4.5 0 010 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TurtleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="12" cy="13" rx="7" ry="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M7 11c1-3 3-4.5 5-4.5S16 8 17 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="9.5" cy="12.5" r="0.8" fill="currentColor" />
      <circle cx="14.5" cy="12.5" r="0.8" fill="currentColor" />
    </svg>
  );
}
