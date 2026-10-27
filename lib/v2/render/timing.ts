export const PLAYBACK_SPEEDS = [1, 0.8] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export const ASK_CORRECT_HOLD_MS = 900;
export const ENDING_STAGGER_MS = 120;

/** Caption read time before a reveal. Prototype: max(1400, chars × 55) / speed. */
export function readMs(plainLength: number, speed: number): number {
  const safe = speed > 0 ? speed : 1;
  return Math.max(1400, plainLength * 55) / safe;
}

export function readMsForTip(
  tip: readonly { text: string }[] | undefined,
  speed: number,
): number {
  const length = (tip ?? []).reduce((sum, seg) => sum + seg.text.length, 0);
  return readMs(length, speed);
}

/** Gap after the target line's audio, before the next step. */
export function afterRevealGapMs(speed: number): number {
  const safe = speed > 0 ? speed : 1;
  return 500 / safe;
}

export function nextSpeed(current: number): PlaybackSpeed {
  const idx = PLAYBACK_SPEEDS.indexOf(current as PlaybackSpeed);
  const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length] ?? 1;
  return next;
}

export type PlaybackToken = { current: number };

export function bumpToken(token: PlaybackToken): number {
  token.current += 1;
  return token.current;
}

export function isTokenCurrent(token: PlaybackToken, snapshot: number): boolean {
  return token.current === snapshot;
}
