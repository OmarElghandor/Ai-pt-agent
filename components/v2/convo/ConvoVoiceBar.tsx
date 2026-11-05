'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMicRecorder } from '@/hooks/useMicRecorder';
import { NoteCard } from '@/components/v2/NoteCard';

const INPUT_MODE_KEY = 'v2.talk.inputMode';
const ACCENTS = ['ã', 'õ', 'ç', 'á', 'é', 'í', 'ó', 'ú', 'â', 'ê', 'ô', 'à'];

export type ConvoInputMode = 'voice' | 'text';

function readInputMode(): ConvoInputMode {
  try {
    const v = localStorage.getItem(INPUT_MODE_KEY);
    if (v === 'text' || v === 'voice') return v;
  } catch {
    /* ignore */
  }
  return 'voice';
}

function writeInputMode(mode: ConvoInputMode): void {
  try {
    localStorage.setItem(INPUT_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

type Frame = { tl: string; eg: string; chips: string[] };

type Props = {
  busy: boolean;
  disabled?: boolean;
  /** Portuguese (or open) text submit. */
  onSend: (text: string, opts?: { assisted?: boolean; via?: 'voice' | 'text' }) => void;
  /** Arabic voice/text → side channel (same turn API; Arabic detected server-side). */
  onArabicSend: (text: string) => void;
  onSurvival?: (action: 'repeat' | 'slow' | 'nao_percebi') => void;
  /** Stop character TTS when mic starts (barge-in). */
  onBargeIn?: () => void;
  frame?: Frame | null;
  helpOpen?: boolean;
  onToggleHelp?: () => void;
  /** Called with STT ms when a voice send completes. */
  onSttMs?: (ms: number) => void;
  /** Unclear STT coach message. */
  onUnclearStt?: () => void;
};

export function ConvoVoiceBar({
  busy,
  disabled,
  onSend,
  onArabicSend,
  onSurvival,
  onBargeIn,
  frame,
  helpOpen,
  onToggleHelp,
  onSttMs,
  onUnclearStt,
}: Props) {
  const [mode, setMode] = useState<ConvoInputMode>('voice');
  const [text, setText] = useState('');
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(
    null,
  );
  const [recSeconds, setRecSeconds] = useState(0);
  const [promptSay, setPromptSay] = useState<string | null>(null);
  const ptMic = useMicRecorder({ language: 'pt-PT' });
  const arMic = useMicRecorder({ language: 'ar' });
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMode(readInputMode());
  }, []);

  useEffect(() => {
    if (ptMic.recording || arMic.recording) {
      setRecSeconds(0);
      recTimer.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } else if (recTimer.current) {
      clearInterval(recTimer.current);
      recTimer.current = null;
    }
    return () => {
      if (recTimer.current) clearInterval(recTimer.current);
    };
  }, [ptMic.recording, arMic.recording]);

  const setModePersist = (m: ConvoInputMode) => {
    setMode(m);
    writeInputMode(m);
  };

  const clearPending = useCallback(() => {
    setPendingTranscript(null);
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
  }, []);

  const commitTranscript = useCallback(
    (t: string) => {
      clearPending();
      onSend(t, { via: 'voice', assisted: Boolean(promptSay) });
      setPromptSay(null);
    },
    [clearPending, onSend, promptSay],
  );

  const handlePtMic = async () => {
    if (busy || disabled || ptMic.transcribing) return;
    if (!ptMic.recording) {
      onBargeIn?.();
      arMic.cancel();
      await ptMic.start();
      return;
    }
    const t0 = performance.now();
    const t = await ptMic.stopAndTranscribe();
    onSttMs?.(Math.round(performance.now() - t0));
    if (!t) {
      onUnclearStt?.();
      return;
    }
    setPendingTranscript(t);
    cancelTimer.current = setTimeout(() => commitTranscript(t), 3000);
  };

  const handleArMic = async () => {
    if (busy || disabled || arMic.transcribing) return;
    if (!arMic.recording) {
      onBargeIn?.();
      ptMic.cancel();
      await arMic.start();
      return;
    }
    const t = await arMic.stopAndTranscribe();
    if (!t) {
      onUnclearStt?.();
      return;
    }
    onArabicSend(t);
  };

  const sendText = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    // Arabic script → side channel
    if (/[\u0600-\u06FF]/.test(t)) {
      onArabicSend(t);
    } else {
      onSend(t, { via: 'text', assisted: Boolean(promptSay) });
      setPromptSay(null);
    }
  };

  const recording = ptMic.recording || arMic.recording;
  const micError = ptMic.error || arMic.error;

  return (
    <section className="shrink-0 border-t border-v2-line/60 bg-v2-paper px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      {onSurvival ? (
        <div className="mb-2 flex flex-wrap justify-center gap-1.5">
          {(
            [
              ['repeat', 'Pode repetir?'],
              ['slow', 'Mais devagar'],
              ['nao_percebi', 'Não percebi'],
            ] as const
          ).map(([action, label]) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => onSurvival(action)}
              dir="ltr"
              className="rounded-v2-pill border border-v2-line bg-white px-2.5 py-1.5 font-[family-name:var(--font-v2-target)] text-[11px] font-semibold text-v2-primary disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {helpOpen && frame ? (
        <NoteCard className="mb-3 self-stretch">
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
            {frame.eg}
          </p>
          <p
            className="mt-1 font-[family-name:var(--font-v2-target)] text-sm font-semibold text-v2-primary"
            dir="ltr"
          >
            {frame.tl}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {frame.chips.map((chip) => (
              <button
                key={chip}
                type="button"
                className="rounded-v2-chip bg-v2-card px-3 py-1.5 font-[family-name:var(--font-v2-target)] text-sm text-v2-primary shadow-[var(--shadow-v2-soft)]"
                dir="ltr"
                onClick={() => {
                  if (mode === 'voice') {
                    setPromptSay(chip);
                    void fetch('/api/tts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: chip, lang: 'pt' }),
                    }).catch(() => {});
                    void ptMic.start();
                  } else {
                    setText(chip);
                  }
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        </NoteCard>
      ) : null}

      {promptSay ? (
        <div className="mb-2 rounded-v2-row bg-v2-primary/10 px-3 py-2 text-center">
          <p
            dir="ltr"
            className="font-[family-name:var(--font-v2-target)] text-lg font-bold text-v2-primary"
          >
            {promptSay}
          </p>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
            قولها
          </p>
        </div>
      ) : null}

      {pendingTranscript ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-v2-row bg-v2-card px-3 py-2">
          <p
            dir="ltr"
            className="min-w-0 flex-1 font-[family-name:var(--font-v2-target)] text-sm text-v2-primary"
          >
            {pendingTranscript}
          </p>
          <button
            type="button"
            className="shrink-0 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-action underline"
            onClick={() => {
              clearPending();
              void ptMic.start();
            }}
          >
            مش ده اللي قلته
          </button>
        </div>
      ) : null}

      {mode === 'voice' ? (
        <div className="flex items-end justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              ptMic.cancel();
              arMic.cancel();
              setModePersist('text');
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-v2-card text-v2-primary shadow-[var(--shadow-v2-soft)]"
            aria-label="لوحة المفاتيح"
          >
            <span className="material-symbols-rounded text-[22px]">keyboard</span>
          </button>

          <button
            type="button"
            disabled={busy || disabled || ptMic.transcribing}
            onClick={() => void handlePtMic()}
            className={[
              'flex h-16 w-16 flex-col items-center justify-center rounded-full font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-white shadow-[var(--shadow-v2-soft)] transition',
              ptMic.recording ? 'bg-v2-action' : 'bg-v2-primary',
              'disabled:opacity-50',
            ].join(' ')}
            aria-label={ptMic.recording ? 'وقّف وابعت' : 'اتكلم'}
          >
            <span className="material-symbols-rounded text-[28px]">
              {ptMic.recording ? 'send' : 'mic'}
            </span>
            {ptMic.recording ? `${recSeconds}s` : ptMic.transcribing ? '…' : ''}
          </button>

          <button
            type="button"
            disabled={busy || disabled || arMic.transcribing}
            onClick={() => void handleArMic()}
            className={[
              'flex min-h-11 min-w-[4.5rem] flex-col items-center justify-center rounded-v2-chip px-2 py-1.5 font-[family-name:var(--font-v2-arabic)] text-[11px] font-semibold shadow-[var(--shadow-v2-soft)]',
              arMic.recording
                ? 'bg-v2-action text-white'
                : 'bg-v2-card text-v2-primary',
              'disabled:opacity-50',
            ].join(' ')}
          >
            اسأل بالعربي 🇪🇬
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                className="rounded-v2-chip bg-v2-card px-2 py-1 font-[family-name:var(--font-v2-target)] text-sm text-v2-primary"
                onClick={() => setText((t) => t + a)}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModePersist('voice')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-v2-card text-v2-primary"
              aria-label="مايك"
            >
              <span className="material-symbols-rounded text-[22px]">mic</span>
            </button>
            <input
              className="min-w-0 flex-1 rounded-v2-row border border-v2-line/50 bg-v2-card px-3 py-2 font-[family-name:var(--font-v2-target)] text-v2-primary"
              dir="ltr"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendText();
              }}
              placeholder="Escreve aqui…"
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={sendText}
              className="rounded-v2-chip bg-v2-action px-4 py-2 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-white disabled:opacity-40"
            >
              ابعت
            </button>
          </div>
        </div>
      )}

      {frame && onToggleHelp ? (
        <button
          type="button"
          onClick={onToggleHelp}
          className="mt-2 w-full rounded-v2-row bg-v2-card px-3 py-2 text-center font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-primary shadow-[var(--shadow-v2-soft)]"
        >
          {helpOpen ? 'إخفاء المساعدة' : 'ساعدني أرد'}
        </button>
      ) : null}

      {micError ? (
        <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-[12px] text-v2-ink">
          {micError}
        </p>
      ) : null}

      {recording ? (
        <div className="mx-auto mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-v2-line/40">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-v2-action" />
        </div>
      ) : null}
    </section>
  );
}
