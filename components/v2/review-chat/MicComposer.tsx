'use client';

import { useEffect, useRef, useState } from 'react';
import { coachCantSpeak } from '@/lib/v2/review-chat/coach';

type Props = {
  onCantSpeak: () => void;
  onRecorded: (blob: Blob) => void;
  disabled?: boolean;
  note?: string;
};

export function MicComposer({ onCantSpeak, onRecorded, disabled, note }: Props) {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);

  useEffect(() => {
    return () => {
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function toggleRecord() {
    if (disabled) return;
    if (recording) {
      mediaRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        const b = new Blob(chunks.current, { type: 'audio/webm' });
        setBlob(b);
        onRecorded(b);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={disabled}
        onClick={toggleRecord}
        className={[
          'flex w-full min-h-12 items-center justify-center gap-2 rounded-2xl font-[family-name:var(--font-v2-arabic)] text-sm font-bold',
          recording
            ? 'bg-v2-warning-panel text-v2-warning-text'
            : 'bg-v2-primary text-v2-on-primary',
        ].join(' ')}
        aria-pressed={recording}
      >
        {recording ? 'إيقاف التسجيل' : 'اضغط للتسجيل'}
      </button>
      {blob ? (
        <audio controls src={URL.createObjectURL(blob)} className="w-full" />
      ) : null}
      {note ? (
        <p className="text-center font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
          {note}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onCantSpeak}
        disabled={disabled}
        className="w-full py-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted underline-offset-2 hover:underline"
      >
        {coachCantSpeak(0)}
      </button>
    </div>
  );
}