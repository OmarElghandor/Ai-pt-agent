import { randomUUID } from 'node:crypto';
import type { AnswerVerdict } from '@/lib/v2/answers/evaluate';
import type { ConvoAnswerPayload } from '@/lib/v2/answers/payload';
import type { ConvoRung, ConvoSession } from '@/lib/v2/convo/session';
import {
  convoProgressAnswerId,
  diffConvoRungProgress,
  type ConvoProgressTransition,
  type ConvoRungProgress,
} from './diff';

export type ConvoProgressWriter = (
  payload: ConvoAnswerPayload,
) => Promise<AnswerVerdict | { duplicate?: boolean; item_state?: unknown }>;

export type MirrorConvoProgressInput = {
  session: ConvoSession;
  day: number;
  beforeRungs: Record<string, ConvoRung>;
  afterRungs: Record<string, ConvoRung>;
  write: ConvoProgressWriter;
  answerIdFor?: (t: ConvoProgressTransition) => string;
};

export type MirrorConvoProgressResult = {
  transitions: ConvoProgressTransition[];
  writes: number;
  duplicates: number;
};

/**
 * Mirror rung transitions through the answers writer (sole progress path).
 */
export async function mirrorConvoProgress(
  input: MirrorConvoProgressInput,
): Promise<MirrorConvoProgressResult> {
  const transitions = diffConvoRungProgress(
    input.beforeRungs,
    input.afterRungs,
  );
  let writes = 0;
  let duplicates = 0;

  for (const t of transitions) {
    const answer_id =
      input.answerIdFor?.(t) ??
      convoProgressAnswerId({
        sessionId: input.session.id,
        itemId: t.item_id,
        rung: t.to,
      });
    const payload: ConvoAnswerPayload = {
      kind: 'convo',
      answer_id,
      day: input.day,
      item_id: t.item_id,
      rung: t.to,
      session_id: input.session.id,
    };
    const result = await input.write(payload);
    writes += 1;
    if (result.duplicate) duplicates += 1;
  }

  return { transitions, writes, duplicates };
}

export type { ConvoProgressTransition, ConvoRungProgress };

export function randomConvoAnswerId(): string {
  return randomUUID();
}
