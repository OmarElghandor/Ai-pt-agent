/** Session debug sink — dual-write ingest + same-origin file API. */
export function debugAgentLog(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}): void {
  const body = JSON.stringify({
    sessionId: '7ecc67',
    runId: payload.runId ?? 'pre-fix',
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data ?? {},
    timestamp: Date.now(),
  });
  // #region agent log
  fetch('http://127.0.0.1:7906/ingest/f38676d3-3391-47ba-91c5-7bfb45d8c103', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '7ecc67',
    },
    body,
  }).catch(() => {});
  if (typeof window !== 'undefined') {
    fetch('/api/v2/dev/debug-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {});
  }
  // #endregion
}
