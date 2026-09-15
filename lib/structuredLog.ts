/**
 * Fire-and-forget stub for future spaced-repetition logging.
 * Must never block the chat stream — call without await.
 */
export function structuredLog(payload: {
  sessionId: string;
  userText: string;
  assistantText: string;
  level: string;
}): void {
  // TODO: cheap async call to classify whether the user's last PT sentence
  // was correct, for spaced repetition — separate model, non-blocking.
  console.log('[structuredLog]', {
    sessionId: payload.sessionId,
    level: payload.level,
    userText: payload.userText,
    assistantText: payload.assistantText,
  });
}
