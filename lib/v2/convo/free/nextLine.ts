import type { FreeTopic, ThreadAsk, ThreadTopicFile } from '@/lib/v2/convo/topics';
import { freeTopicById, loadThreadTopic } from '@/lib/v2/convo/topics';

/** Session cursor into a topic's threads (or open mode after threads / أي حاجة). */
export type FreeThreadStep =
  | { kind: 'ask' }
  | { kind: 'follow_up'; n: number }
  | { kind: 'bridge'; relatedIndex: number }
  | { kind: 'open' };

export type FreeNextLine = {
  /** Stable id for pending_question / audio. */
  line_id: string;
  tl: string;
  ar: string;
  /** Optional share spoken before the ask (new thread). */
  share_tl?: string;
  share_ar?: string;
  frame?: ThreadAsk['frame'];
  ask_kind?: ThreadAsk['kind'];
  is_bridge?: boolean;
  /** Combined character bubble text (share + ask, or follow-up alone). */
  bubble_tl: string;
  bubble_ar: string;
};

export function parseFreeThreadStep(raw: unknown): FreeThreadStep {
  if (!raw || typeof raw !== 'object') return { kind: 'ask' };
  const o = raw as Record<string, unknown>;
  if (o.kind === 'follow_up' && typeof o.n === 'number') {
    return { kind: 'follow_up', n: o.n };
  }
  if (o.kind === 'bridge' && typeof o.relatedIndex === 'number') {
    return { kind: 'bridge', relatedIndex: o.relatedIndex };
  }
  if (o.kind === 'open') return { kind: 'open' };
  return { kind: 'ask' };
}

export function isNegativeAnswer(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .normalize('NFC');
  return /^(não|nao|nunca|ainda\s+não|ainda\s+nao)\b/i.test(t);
}

/** Bridge accept: yes / quero / vamos… */
export function isBridgeYes(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(sim|quero|vamos|claro|ok|okay|yes)\b/i.test(t);
}

function askLine(
  topicId: string,
  threadId: string,
  ask: ThreadAsk,
  share?: { tl: string; ar: string },
): FreeNextLine {
  const line_id = `${threadId}.ask`;
  const bubble_tl = share
    ? `${share.tl} ${ask.tl}`.replace(/\s+/g, ' ').trim()
    : ask.tl;
  const bubble_ar = share
    ? `${share.ar} ${ask.ar}`.replace(/\s+/g, ' ').trim()
    : ask.ar;
  return {
    line_id,
    tl: ask.tl,
    ar: ask.ar,
    ...(share
      ? { share_tl: share.tl, share_ar: share.ar }
      : {}),
    frame: ask.frame,
    ask_kind: ask.kind,
    bubble_tl,
    bubble_ar,
  };
}

function followUpLine(
  threadId: string,
  n: number,
  fu: ThreadAsk,
): FreeNextLine {
  return {
    line_id: `${threadId}.fu${n}`,
    tl: fu.tl,
    ar: fu.ar,
    frame: fu.frame,
    ask_kind: fu.kind,
    bubble_tl: fu.tl,
    bubble_ar: fu.ar,
  };
}

export function bridgeLine(
  current: FreeTopic,
  related: FreeTopic,
  relatedIndex: number,
): FreeNextLine {
  const tl = `Queres falar ${related.title_in_sentence_tl}?`;
  const ar = `هل تريد التحدث ${related.title_ar}؟`;
  return {
    line_id: `${current.id}.bridge.${relatedIndex}`,
    tl,
    ar,
    is_bridge: true,
    bubble_tl: tl,
    bubble_ar: ar,
  };
}

/** Current authored line for the session cursor (does not advance). */
export function currentNextLine(
  doc: ThreadTopicFile,
  threadIndex: number,
  step: FreeThreadStep,
  topic: FreeTopic,
): FreeNextLine {
  if (step.kind === 'bridge') {
    const relatedId =
      topic.related_topic_ids[step.relatedIndex] ??
      topic.related_topic_ids[0]!;
    const related = freeTopicById(relatedId) ?? topic;
    return bridgeLine(topic, related, step.relatedIndex);
  }

  const thread = doc.threads[threadIndex] ?? doc.threads[0]!;
  if (step.kind === 'follow_up') {
    const fu = thread.follow_ups[step.n] ?? thread.follow_ups[0]!;
    return followUpLine(thread.id, step.n, fu);
  }
  return askLine(doc.topic.id, thread.id, thread.ask, thread.share);
}

export type AdvanceFreeCursorResult = {
  thread_index: number;
  step: FreeThreadStep;
  threads_done: string[];
  last_line_id: string;
  next: FreeNextLine;
  /** When bridge yes: switch to this topic id. */
  switch_topic_id?: string;
};

/**
 * Advance after a learner Portuguese answer.
 * Never dead-ends: always returns a next line (ask, follow-up, or bridge).
 */
export function advanceAfterAnswer(opts: {
  doc: ThreadTopicFile;
  topic: FreeTopic;
  thread_index: number;
  step: FreeThreadStep;
  threads_done: string[];
  learnerText: string;
}): AdvanceFreeCursorResult {
  const { doc, topic, learnerText } = opts;
  let thread_index = opts.thread_index;
  let step = opts.step;
  let threads_done = [...opts.threads_done];

  if (step.kind === 'bridge') {
    if (isBridgeYes(learnerText)) {
      const relatedId =
        topic.related_topic_ids[step.relatedIndex] ??
        topic.related_topic_ids[0]!;
      const relatedDoc = loadThreadTopic(relatedId);
      const relatedTopic = freeTopicById(relatedId)!;
      const next = askLine(
        relatedDoc.topic.id,
        relatedDoc.threads[0]!.id,
        relatedDoc.threads[0]!.ask,
        relatedDoc.threads[0]!.share,
      );
      return {
        thread_index: 0,
        step: { kind: 'ask' },
        threads_done: [],
        last_line_id: next.line_id,
        next,
        switch_topic_id: relatedTopic.id,
      };
    }
    const nextIndex =
      (step.relatedIndex + 1) % Math.max(topic.related_topic_ids.length, 1);
    const relatedId =
      topic.related_topic_ids[nextIndex] ?? topic.related_topic_ids[0]!;
    const related = freeTopicById(relatedId) ?? topic;
    const next = bridgeLine(topic, related, nextIndex);
    return {
      thread_index,
      step: { kind: 'bridge', relatedIndex: nextIndex },
      threads_done,
      last_line_id: next.line_id,
      next,
    };
  }

  const thread = doc.threads[thread_index]!;

  if (step.kind === 'ask') {
    if (!threads_done.includes(thread.id)) {
      threads_done = [...threads_done, thread.id];
    }
    // Prefer first follow-up unless skip_if_negative
    for (let n = 0; n < thread.follow_ups.length; n++) {
      const fu = thread.follow_ups[n]!;
      if (fu.skip_if_negative && isNegativeAnswer(learnerText)) {
        continue;
      }
      const next = followUpLine(thread.id, n, fu);
      return {
        thread_index,
        step: { kind: 'follow_up', n },
        threads_done,
        last_line_id: next.line_id,
        next,
      };
    }
    // No follow-up to take → next thread or bridge
    return goNextThreadOrBridge({
      doc,
      topic,
      thread_index,
      threads_done,
    });
  }

  // follow_up n answered → later follow-ups or next thread
  const nextFu = step.n + 1;
  for (let n = nextFu; n < thread.follow_ups.length; n++) {
    const fu = thread.follow_ups[n]!;
    if (fu.skip_if_negative && isNegativeAnswer(learnerText)) {
      continue;
    }
    const next = followUpLine(thread.id, n, fu);
    return {
      thread_index,
      step: { kind: 'follow_up', n },
      threads_done,
      last_line_id: next.line_id,
      next,
    };
  }

  return goNextThreadOrBridge({
    doc,
    topic,
    thread_index,
    threads_done,
  });
}

function goNextThreadOrBridge(opts: {
  doc: ThreadTopicFile;
  topic: FreeTopic;
  thread_index: number;
  threads_done: string[];
}): AdvanceFreeCursorResult {
  const { doc, topic, threads_done } = opts;
  const nextIndex = opts.thread_index + 1;
  if (nextIndex < doc.threads.length) {
    const thread = doc.threads[nextIndex]!;
    const next = askLine(doc.topic.id, thread.id, thread.ask, thread.share);
    return {
      thread_index: nextIndex,
      step: { kind: 'ask' },
      threads_done,
      last_line_id: next.line_id,
      next,
    };
  }
  const relatedId = topic.related_topic_ids[0] ?? topic.id;
  const related = freeTopicById(relatedId) ?? topic;
  const next = bridgeLine(topic, related, 0);
  return {
    thread_index: opts.thread_index,
    step: { kind: 'bridge', relatedIndex: 0 },
    threads_done,
    last_line_id: next.line_id,
    next,
  };
}

/** Opening: thread 0 share + ask (no model). */
export function openingNextLine(doc: ThreadTopicFile): FreeNextLine {
  const thread = doc.threads[0]!;
  return askLine(doc.topic.id, thread.id, thread.ask, thread.share);
}
