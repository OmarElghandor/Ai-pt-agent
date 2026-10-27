const TTS_CAP_MS = 6000;

/** Plays one line through /api/tts. Resolves on end, cancel, or a 6s cap. */
export async function playSpeech(
  text: string,
  lang: 'pt' | 'ar',
  signal: AbortSignal,
  playbackRate = 1,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || signal.aborted) return;
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed, lang }),
      signal,
    });
    if (!res.ok || signal.aborted) return;
    const blob = await res.blob();
    if (signal.aborted) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = playbackRate > 0 ? playbackRate : 1;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        resolve();
      };
      const cap = window.setTimeout(() => {
        audio.pause();
        finish();
      }, TTS_CAP_MS);
      const onAbort = () => {
        window.clearTimeout(cap);
        audio.pause();
        finish();
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      audio.onended = () => {
        window.clearTimeout(cap);
        signal.removeEventListener('abort', onAbort);
        finish();
      };
      audio.onerror = () => {
        window.clearTimeout(cap);
        finish();
      };
      void audio.play().catch(() => {
        window.clearTimeout(cap);
        finish();
      });
    });
  } catch {
    // Fetch abort or TTS unavailable. The read timer still advances the step.
  }
}
