'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMicRecorder } from '@/hooks/useMicRecorder';

const INPUT_MODE_KEY = 'v2.talk.inputMode';
const ACCENTS = [
  'à',
  'á',
  'â',
  'ã',
  'ç',
  'é',
  'ê',
  'í',
  'ó',
  'ô',
  'õ',
  'ú',
];

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
  onSend: (
    text: string,
    opts?: { assisted?: boolean; via?: 'voice' | 'text' },
  ) => void;
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

function formatRec(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
  const [accentsOpen, setAccentsOpen] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(
    null,
  );
  const [undoLeft, setUndoLeft] = useState(3);
  const [recSeconds, setRecSeconds] = useState(0);
  const [promptSay, setPromptSay] = useState<string | null>(null);
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [modeToast, setModeToast] = useState<string | null>(null);
  const ptMic = useMicRecorder({ language: 'pt-PT' });
  const arMic = useMicRecorder({ language: 'ar' });
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTick = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (!modeToast) return;
    const t = setTimeout(() => setModeToast(null), 2800);
    return () => clearTimeout(t);
  }, [modeToast]);

  const setModePersist = (m: ConvoInputMode) => {
    setMode(m);
    writeInputMode(m);
    if (m === 'text') {
      setModeToast('اتحوّلت للكتابة، دوس المايك ترجع للصوت');
    }
  };

  const clearPending = useCallback(() => {
    setPendingTranscript(null);
    setUndoLeft(3);
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
    if (undoTick.current) clearInterval(undoTick.current);
  }, []);

  const commitTranscript = useCallback(
    (t: string) => {
      clearPending();
      onSend(t, { via: 'voice', assisted: Boolean(promptSay) });
      setPromptSay(null);
      setSelectedChip(null);
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
    setUndoLeft(3);
    if (undoTick.current) clearInterval(undoTick.current);
    undoTick.current = setInterval(() => {
      setUndoLeft((n) => Math.max(0, n - 1));
    }, 1000);
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
    if (/[\u0600-\u06FF]/.test(t)) {
      onArabicSend(t);
    } else {
      onSend(t, { via: 'text', assisted: Boolean(promptSay) });
      setPromptSay(null);
      setSelectedChip(null);
    }
  };

  const pickChip = (chip: string) => {
    setSelectedChip(chip);
    setPromptSay(chip);
    if (mode === 'voice') {
      void fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chip, lang: 'pt' }),
      }).catch(() => {});
      void ptMic.start();
    } else {
      setText(chip);
    }
  };

  const recording = ptMic.recording || arMic.recording;
  const micError = ptMic.error || arMic.error;
  const chipsLocked = recording || busy;

  const survival = (
    <div
      className={[
        'mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        chipsLocked ? 'pointer-events-none opacity-40' : '',
      ].join(' ')}
    >
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
          disabled={chipsLocked || !onSurvival}
          onClick={() => onSurvival?.(action)}
          dir="ltr"
          className="shrink-0 rounded-[var(--ft-radius-control)] border border-[var(--ft-border)] bg-[var(--ft-surface)] px-3 py-1.5 font-[family-name:var(--font-ft-pt)] text-[12px] font-medium text-[var(--ft-ink)] shadow-[var(--ft-shadow-soft)] disabled:opacity-50"
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <section className="relative shrink-0 bg-gradient-to-t from-[var(--ft-ivory)] via-[color-mix(in_srgb,var(--ft-ivory)_95%,transparent)] to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[var(--ft-shadow-dock)]">
      {modeToast ? (
        <div className="mb-2 flex justify-center">
          <p className="rounded-[var(--ft-radius-control)] bg-[var(--ft-ink)] px-3 py-1.5 font-[family-name:var(--font-ft-ar)] text-[12px] text-[var(--ft-ivory)]">
            {modeToast}
          </p>
        </div>
      ) : null}

      {onSurvival && mode === 'voice' && !helpOpen ? survival : null}

      {frame && onToggleHelp && mode === 'voice' && !recording ? (
        <button
          type="button"
          onClick={onToggleHelp}
          className="mb-2 flex w-full items-center justify-center gap-1.5 font-[family-name:var(--font-ft-ar)] text-[13px] font-semibold text-[var(--ft-sage)] underline decoration-[var(--ft-sand)] underline-offset-4"
        >
          <span className="material-symbols-rounded text-[18px]">
            back_hand
          </span>
          {helpOpen ? 'إخفاء المساعدة' : 'ساعدني أرد'}
        </button>
      ) : null}

      {promptSay && !helpOpen ? (
        <div className="mb-2 rounded-2xl bg-[color-mix(in_srgb,var(--ft-mist)_45%,transparent)] px-3 py-2 text-center">
          <p
            dir="ltr"
            className="font-[family-name:var(--font-ft-pt)] text-lg font-semibold text-[var(--ft-sage-dark)]"
          >
            {promptSay}
          </p>
          <p className="font-[family-name:var(--font-ft-ar)] text-sm text-[var(--ft-ink)]">
            قولها دلوقتي
          </p>
        </div>
      ) : null}

      {pendingTranscript ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-[var(--ft-surface)] px-3 py-2.5 ring-1 ring-[var(--ft-border)]">
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 font-[family-name:var(--font-ft-ar)] text-[10px] text-[var(--ft-text-secondary)]">
              تسجيل صوتي محوّل
            </p>
            <p
              dir="ltr"
              className="font-[family-name:var(--font-ft-pt)] text-sm text-[var(--ft-ink)]"
            >
              {pendingTranscript}
            </p>
          </div>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1.5 font-[family-name:var(--font-ft-ar)] text-[12px] font-semibold text-[var(--ft-correction-text)] underline decoration-[var(--ft-correction)] underline-offset-2"
            onClick={() => {
              clearPending();
              void ptMic.start();
            }}
          >
            <span
              aria-hidden
              className="relative flex h-7 w-7 items-center justify-center"
            >
              <svg viewBox="0 0 28 28" className="absolute inset-0 h-7 w-7 -rotate-90">
                <circle
                  cx="14"
                  cy="14"
                  r="12"
                  fill="none"
                  stroke="var(--ft-mist)"
                  strokeWidth="2.5"
                />
                <circle
                  cx="14"
                  cy="14"
                  r="12"
                  fill="none"
                  stroke="var(--ft-correction)"
                  strokeWidth="2.5"
                  strokeDasharray={`${(undoLeft / 3) * 75.4} 75.4`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-[10px] tabular-nums">{undoLeft}</span>
            </span>
            مش ده اللي قلته؟
          </button>
        </div>
      ) : null}

      {/* Help bottom sheet (screen 3) */}
      {helpOpen && frame ? (
        <div className="mb-3 overflow-hidden rounded-[var(--ft-radius-card)] bg-[var(--ft-surface)] p-4 shadow-[var(--ft-shadow-sheet)] ring-1 ring-[var(--ft-border)]">
          <div className="mb-3 flex items-start justify-between gap-2">
            <p className="rounded-[var(--ft-radius-control)] bg-[color-mix(in_srgb,var(--ft-mist)_55%,transparent)] px-3 py-1.5 font-[family-name:var(--font-ft-ar)] text-[12px] font-medium text-[var(--ft-ink)]">
              {frame.eg}
            </p>
            {onToggleHelp ? (
              <button
                type="button"
                onClick={onToggleHelp}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--ft-ink)]"
                aria-label="إغلاق"
              >
                <span className="material-symbols-rounded text-[20px]">close</span>
              </button>
            ) : null}
          </div>

          <p className="mb-1 font-[family-name:var(--font-ft-ar)] text-[11px] font-medium text-[var(--ft-text-secondary)]">
            النمط المستهدف
          </p>
          <p
            dir="ltr"
            className="mb-3 font-[family-name:var(--font-ft-pt)] text-xl font-semibold text-[var(--ft-sage-dark)]"
          >
            {frame.tl}
          </p>

          <div className="flex flex-col gap-2">
            {frame.chips.map((chip) => {
              const selected = selectedChip === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => pickChip(chip)}
                  className={[
                    'rounded-2xl px-3.5 py-3 text-start transition',
                    selected
                      ? 'bg-[color-mix(in_srgb,var(--ft-mist)_70%,white)] shadow-[var(--ft-shadow-soft)] ring-1 ring-[var(--ft-sage)]/30'
                      : 'bg-[var(--ft-ivory)] ring-1 ring-[var(--ft-border)]',
                  ].join(' ')}
                >
                  {selected ? (
                    <span className="mb-1 inline-block rounded-full bg-[color-mix(in_srgb,var(--ft-mist)_80%,transparent)] px-2 py-0.5 font-[family-name:var(--font-ft-ar)] text-[10px] font-medium text-[var(--ft-sage-dark)]">
                      الخيار الأنسب للرد
                    </span>
                  ) : null}
                  <span
                    dir="ltr"
                    className="block font-[family-name:var(--font-ft-pt)] text-[15px] font-semibold text-[var(--ft-ink)]"
                  >
                    {chip}
                  </span>
                  {selected ? (
                    <span className="mt-1 block font-[family-name:var(--font-ft-ar)] text-[12px] text-[var(--ft-sage)]">
                      قولها دلوقتي · جاهز للاستماع إليك
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {mode === 'voice' ? (
        recording ? (
          <div className="rounded-[24px] bg-[var(--ft-surface)] p-4 shadow-[var(--ft-shadow-soft)] ring-1 ring-[var(--ft-border)]">
            {onSurvival ? (
              <p className="mb-2 text-center font-[family-name:var(--font-ft-ar)] text-[11px] text-[var(--ft-text-secondary)]">
                عبارات إنقاذ سريعة (معلّقة أثناء التسجيل)
              </p>
            ) : null}
            {onSurvival ? survival : null}

            <div className="mb-3 flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-[var(--ft-radius-control)] bg-[var(--ft-error-soft)] px-2.5 py-1 font-[family-name:var(--font-ft-ui)] text-[12px] font-medium text-[var(--ft-error)]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--ft-error)] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--ft-error)]" />
                </span>
                {formatRec(recSeconds)}
              </span>
            </div>

            <div className="mb-3 flex h-10 items-center justify-center gap-1 rounded-full bg-[var(--ft-ivory)] px-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <span
                  key={i}
                  className="ft-wave-bar"
                  style={{
                    animationDelay: `${i * 0.08}s`,
                    height: `${12 + (i % 4) * 5}px`,
                    background:
                      i % 3 === 0
                        ? 'var(--ft-sage)'
                        : i % 3 === 1
                          ? 'var(--ft-moss)'
                          : 'var(--ft-sage-dark)',
                  }}
                />
              ))}
            </div>

            <p className="mb-3 text-center font-[family-name:var(--font-ft-ar)] text-[13px] text-[var(--ft-ink)]">
              {arMic.recording
                ? 'بتسجّل بالعربي… اضغط مجدداً للإرسال'
                : 'بتسجّل… اضغط مجدداً للإرسال'}
            </p>

            <div className="flex items-end justify-center gap-4">
              <button
                type="button"
                onClick={() => {
                  ptMic.cancel();
                  arMic.cancel();
                  setModePersist('text');
                }}
                className="flex flex-col items-center gap-1"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ft-ivory)] text-[var(--ft-ink)] shadow-[var(--ft-shadow-soft)]">
                  <span className="material-symbols-rounded text-[22px]">
                    keyboard
                  </span>
                </span>
                <span className="font-[family-name:var(--font-ft-ar)] text-[10px] text-[var(--ft-text-secondary)]">
                  لوحة المفاتيح
                </span>
              </button>

              <button
                type="button"
                disabled={busy || disabled || ptMic.transcribing}
                onClick={() =>
                  void (arMic.recording ? handleArMic() : handlePtMic())
                }
                className="ft-mic-halo relative flex h-20 w-20 items-center justify-center rounded-full bg-[var(--ft-sage)] text-white shadow-[var(--ft-shadow-mic)] disabled:opacity-50"
                aria-label="وقّف وابعت"
              >
                <span className="material-symbols-rounded text-[32px]">stop</span>
              </button>

              <button
                type="button"
                disabled={busy || disabled || arMic.transcribing}
                onClick={() => void handleArMic()}
                className="flex flex-col items-center gap-1"
              >
                <span
                  className={[
                    'flex h-12 w-12 items-center justify-center rounded-full shadow-[var(--ft-shadow-soft)]',
                    arMic.recording
                      ? 'bg-[var(--ft-sand)] text-[var(--ft-ink)]'
                      : 'bg-[var(--ft-ivory)] text-[var(--ft-ink)]',
                  ].join(' ')}
                >
                  <span className="material-symbols-rounded text-[22px]">
                    chat_bubble
                  </span>
                </span>
                <span className="font-[family-name:var(--font-ft-ar)] text-[10px] text-[var(--ft-text-secondary)]">
                  اسأل بالعربي
                </span>
              </button>
            </div>

            <p className="mt-3 text-center font-[family-name:var(--font-ft-ar)] text-[10px] text-[var(--ft-text-secondary)]">
              محادثة آمنة للتعلم في بيئة مريحة وداعمة
            </p>
          </div>
        ) : (
          <div className="flex items-end justify-center gap-5 pt-1">
            <button
              type="button"
              onClick={() => {
                ptMic.cancel();
                arMic.cancel();
                setModePersist('text');
              }}
              className="flex flex-col items-center gap-1"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ft-surface)] text-[var(--ft-ink)] shadow-[var(--ft-shadow-soft)] ring-1 ring-[var(--ft-border)]">
                <span className="material-symbols-rounded text-[22px]">
                  keyboard
                </span>
              </span>
              <span className="sr-only">لوحة المفاتيح</span>
            </button>

            <button
              type="button"
              disabled={busy || disabled || ptMic.transcribing}
              onClick={() => void handlePtMic()}
              className="ft-mic-halo relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--ft-sage)] text-white shadow-[var(--ft-shadow-mic)] disabled:opacity-50"
              aria-label={ptMic.transcribing ? 'جارٍ التحويل' : 'اتكلم'}
            >
              <span className="material-symbols-rounded text-[30px]">
                {ptMic.transcribing ? 'hourglass_empty' : 'mic'}
              </span>
            </button>

            <button
              type="button"
              disabled={busy || disabled || arMic.transcribing}
              onClick={() => void handleArMic()}
              className={[
                'flex flex-col items-center gap-1',
                arMic.recording ? 'opacity-100' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-12 w-12 items-center justify-center rounded-full shadow-[var(--ft-shadow-soft)] ring-1',
                  'bg-[var(--ft-surface)] text-[var(--ft-ink)] ring-[var(--ft-border)]',
                ].join(' ')}
              >
                <span className="material-symbols-rounded text-[22px]">
                  chat_bubble
                </span>
              </span>
              <span className="max-w-[4.5rem] text-center font-[family-name:var(--font-ft-ar)] text-[10px] font-medium text-[var(--ft-text-secondary)]">
                اسأل بالعربي
              </span>
            </button>
          </div>
        )
      ) : (
        <div className="rounded-t-[24px] bg-[color-mix(in_srgb,var(--ft-surface)_95%,transparent)] p-3 shadow-[var(--ft-shadow-soft)] ring-1 ring-[var(--ft-border)]">
          {onSurvival ? survival : null}

          {frame && onToggleHelp ? (
            <button
              type="button"
              onClick={onToggleHelp}
              className="mb-2 w-full text-center font-[family-name:var(--font-ft-ar)] text-[13px] font-semibold text-[var(--ft-sage)] underline decoration-[var(--ft-sand)] underline-offset-4"
            >
              {helpOpen ? 'إخفاء المساعدة' : 'ساعدني أرد'}
            </button>
          ) : null}

          {accentsOpen ? (
            <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="flex h-9 min-w-8 shrink-0 items-center justify-center rounded-md bg-white px-1.5 font-[family-name:var(--font-ft-pt)] text-sm text-[var(--ft-ink)] ring-1 ring-[var(--ft-border)]"
                  onClick={() => setText((t) => t + a)}
                >
                  {a}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModePersist('voice')}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[var(--ft-ink)] shadow-[var(--ft-shadow-soft)] ring-1 ring-[var(--ft-border)]"
              aria-label="مايك"
            >
              <span className="material-symbols-rounded text-[22px]">mic</span>
            </button>
            <button
              type="button"
              onClick={() => setAccentsOpen((v) => !v)}
              className={`flex h-12 w-10 shrink-0 items-center justify-center rounded-[var(--ft-radius-control)] font-[family-name:var(--font-ft-pt)] text-base ring-1 ${
                accentsOpen
                  ? 'bg-[var(--ft-sage)] text-white ring-[var(--ft-sage)]'
                  : 'bg-white text-[var(--ft-ink)] ring-[var(--ft-border)]'
              }`}
              aria-label="حروف بنبرات"
              aria-pressed={accentsOpen}
            >
              á
            </button>
            <input
              className="h-12 min-w-0 flex-1 rounded-[var(--ft-radius-control)] border-0 bg-white px-4 font-[family-name:var(--font-ft-pt)] text-[var(--ft-ink)] shadow-[var(--ft-shadow-soft)] outline-none ring-1 ring-[var(--ft-border)] placeholder:text-[var(--ft-text-secondary)]"
              dir="ltr"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendText();
              }}
              placeholder="Escreve em português…"
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={sendText}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--ft-sage)] text-white shadow-[var(--ft-shadow-soft)] disabled:opacity-40"
              aria-label="ابعت"
            >
              <span className="material-symbols-rounded rotate-180 text-[22px]">
                send
              </span>
            </button>
          </div>

          <p className="mt-2 text-center font-[family-name:var(--font-ft-ar)] text-[10px] text-[var(--ft-text-secondary)]">
            دوس المايك ترجع للصوت
          </p>
        </div>
      )}

      {micError ? (
        <p className="mt-1 font-[family-name:var(--font-ft-ar)] text-[12px] text-[var(--ft-ink)]">
          {micError}
        </p>
      ) : null}
    </section>
  );
}
