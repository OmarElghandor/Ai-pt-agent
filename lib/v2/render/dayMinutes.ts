export const PRACTICE_MINUTES = 3;

/** "Dia 6" from the lesson day number. Portuguese, no accent. */
export function formatDayLabel(day: number): string {
  return `Dia ${day}`;
}

/** Display-only. Pages don't carry a minutes field yet. */
export function minutesForMode(mode: string): number {
  if (mode === 'guided') return 5;
  if (mode === 'explore') return 4;
  return 3;
}
