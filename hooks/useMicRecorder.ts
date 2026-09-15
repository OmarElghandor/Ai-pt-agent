'use client';

import { useCallback, useRef, useState } from 'react';

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useMicRecorder() {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRef.current = null;
    chunksRef.current = [];
  }, []);

  const cancel = useCallback(() => {
    const rec = mediaRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.stop();
      } catch {
        // ignore
      }
    }
    cleanupStream();
    setRecording(false);
    setTranscribing(false);
    setError(null);
  }, [cleanupStream]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch (err) {
      console.error('[mic]', err);
      setError('مفيش إذن للمايك. افتح الإعدادات وفعّل المايكروفون.');
      cleanupStream();
      setRecording(false);
    }
  }, [cleanupStream]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    const recorder = mediaRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setRecording(false);
      return null;
    }

    setRecording(false);
    setTranscribing(true);
    setError(null);

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const data = new Blob(chunksRef.current, { type });
        cleanupStream();
        resolve(data.size > 0 ? data : null);
      };
      try {
        recorder.stop();
      } catch {
        cleanupStream();
        resolve(null);
      }
    });

    if (!blob) {
      setTranscribing(false);
      setError('التسجيل فاضي. جرب تاني.');
      return null;
    }

    try {
      const form = new FormData();
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      form.append('file', blob, `speech.${ext}`);

      const res = await fetch('/api/stt', { method: 'POST', body: form });
      const data = (await res.json()) as { text?: string; error?: string };

      if (!res.ok) {
        setError(data.error || 'فشل تحويل الصوت لنص.');
        setTranscribing(false);
        return null;
      }

      const text = data.text?.trim() ?? '';
      if (!text) {
        setError('مسمعتش كلام واضح. جرب تاني.');
        setTranscribing(false);
        return null;
      }

      setTranscribing(false);
      return text;
    } catch (err) {
      console.error('[stt]', err);
      setError('حصل خطأ في التحويل. حاول تاني.');
      setTranscribing(false);
      return null;
    }
  }, [cleanupStream]);

  const toggle = useCallback(async (): Promise<string | null> => {
    if (recording) {
      return stopAndTranscribe();
    }
    if (transcribing) return null;
    await start();
    return null;
  }, [recording, transcribing, start, stopAndTranscribe]);

  return {
    recording,
    transcribing,
    error,
    setError,
    start,
    stopAndTranscribe,
    toggle,
    cancel,
  };
}
