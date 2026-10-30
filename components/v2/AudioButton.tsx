'use client';

import { useCallback, useRef, useState } from 'react';
import { Icon } from '@/components/v2/Icon';

type Props = {
  text: string;
  lang?: 'pt' | 'ar';
  /** When true, show both normal and slow (turtle) controls with captions. */
  showSlow?: boolean;
  /** 40 default; 32 inside chips */
  size?: 'default' | 'chip';
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

/** Stroke turtle matching Material Symbols weight (not the pets glyph). */
function TurtleIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-current"
    >
      <ellipse
        cx="12"
        cy="12.5"
        rx="6.5"
        ry="5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M17.5 11.5c1.2-.2 2.5.4 3 1.4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="20.2" cy="11.2" r="1.35" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7.2 9.2 5.5 7.4M9.8 8.2 8.8 6.2M14.2 8.2 15.2 6.2M16.8 9.2 18.5 7.4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M8.2 16.8 6.8 18.6M15.8 16.8 17.2 18.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AudioButton({
  text,
  lang = 'pt',
  showSlow = false,
  size = 'default',
  className,
  label = 'تشغيل',
}: Props) {
  const cacheRef = useRef<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState(false);
  const chip = size === 'chip';
  const box = chip ? 'h-8 w-8' : 'h-10 w-10';
  const iconSize = chip ? 20 : 24;

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

  if (showSlow && !chip) {
    return (
      <span
        className={['inline-flex items-end gap-4', className].filter(Boolean).join(' ')}
      >
        <span className="inline-flex flex-col items-center gap-1">
          <button
            type="button"
            aria-label="اسمع"
            disabled={busy}
            onClick={() => void play(false)}
            className={`inline-flex ${box} items-center justify-center rounded-full bg-v2-primary-tint text-v2-primary disabled:opacity-50`}
          >
            <Icon name="volume_up" size={iconSize} />
          </button>
          <span className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-primary">
            اسمع
          </span>
        </span>
        <span className="inline-flex flex-col items-center gap-1">
          <button
            type="button"
            aria-label="بطيء"
            disabled={busy}
            onClick={() => void play(true)}
            className={`inline-flex ${box} items-center justify-center rounded-full bg-v2-primary-tint text-v2-primary disabled:opacity-50`}
          >
            <TurtleIcon size={iconSize} />
          </button>
          <span className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-primary">
            بطيء
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className={['inline-flex items-center gap-1.5', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        aria-label={label}
        disabled={busy}
        onClick={() => void play(false)}
        className={`inline-flex ${box} items-center justify-center rounded-full bg-v2-primary-tint text-v2-primary disabled:opacity-50`}
      >
        <Icon name="volume_up" size={iconSize} />
      </button>
      {showSlow ? (
        <button
          type="button"
          aria-label="بطيء"
          disabled={busy}
          onClick={() => void play(true)}
          className={`inline-flex ${box} items-center justify-center rounded-full bg-v2-primary-tint text-v2-primary disabled:opacity-50`}
        >
          <TurtleIcon size={iconSize} />
        </button>
      ) : null}
    </span>
  );
}

/** @deprecated Prefer Icon name="volume_up" — kept for call sites that only need the glyph. */
export function SpeakerIcon({ size = 24 }: { size?: number }) {
  const s = size <= 20 ? 20 : 24;
  return <Icon name="volume_up" size={s} />;
}
