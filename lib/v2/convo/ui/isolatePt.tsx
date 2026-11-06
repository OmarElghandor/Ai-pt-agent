import type { ReactNode } from 'react';

/** Latin / Portuguese run (letters + common PT punctuation). */
const PT_RUN =
  /[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9'’\-?!,.;:…]*(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ0-9'’\-?!,.;:…]+)*/g;

/**
 * Wrap Portuguese/Latin spans in an LTR unicode isolate (M8).
 * Keeps "?" with the PT when mixed with Arabic.
 */
export function isolatePtInText(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(PT_RUN)) {
    const start = m.index ?? 0;
    if (start > last) {
      nodes.push(text.slice(last, start));
    }
    nodes.push(
      <span key={`pt-${i++}`} dir="ltr" style={{ unicodeBidi: 'isolate' }}>
        {m[0]}
      </span>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length === 1 ? nodes[0] : nodes;
}
