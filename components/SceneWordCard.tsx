'use client';

import { prefetchSegmentTexts } from '@/hooks/useSegmentAudio';

/** Prefetch PT TTS for scene words (cache-only warm). Overlay UI removed — card lives in chat. */
export function warmSceneWordAudio(pts: string[]): void {
  if (!pts.length) return;
  void prefetchSegmentTexts(pts.map((text) => ({ lang: 'pt' as const, text })));
}
