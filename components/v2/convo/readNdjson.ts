import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn';

/** Consume a text/x-ndjson body, yielding parsed events as lines complete. */
export async function* readConvoNdjson(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ConvoTurnStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      yield JSON.parse(line) as ConvoTurnStreamEvent;
    }
  }
  const tail = buffer.trim();
  if (tail) {
    yield JSON.parse(tail) as ConvoTurnStreamEvent;
  }
}
