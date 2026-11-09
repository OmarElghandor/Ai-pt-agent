import type { ThreadTopicFile } from '@/lib/v2/convo/topics';

/** Authored lines to warm once per topic (openings, shares, asks, follow-ups). */
export function authoredLinesForWarm(doc: ThreadTopicFile): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  push(doc.topic.opening_tl);
  for (const thread of doc.threads) {
    push(thread.share.tl);
    push(thread.ask.tl);
    push(`${thread.share.tl} ${thread.ask.tl}`);
    for (const fu of thread.follow_ups) push(fu.tl);
  }
  return out;
}
