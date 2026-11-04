/** Deterministic TTS cache key for a pack question line. */
export function convoQuestionAudioKey(
  packId: string,
  questionId: string,
): string {
  return `convo:${packId}:${questionId}`;
}
