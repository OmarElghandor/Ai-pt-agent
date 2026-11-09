import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ConvoPackData, ConvoItemSurface } from '@/lib/v2/convo/pack';
import { gradeConvoAnswer } from '@/lib/v2/convo/grade';
import {
  applyConvoGrade,
  type ApplyConvoGradeResult,
  type CoachMoment,
} from '@/lib/v2/convo/ladder';
import {
  createConvoSessionDoc,
  type ConvoPendingQuestion,
  type ConvoSession,
} from '@/lib/v2/convo/session';

export const DAY18_PACK = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'tests/fixtures/convo/pt-PT.day-18.json'),
    'utf8',
  ),
) as ConvoPackData;

export const DAY18_SURFACES = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'tests/fixtures/convo/item-surfaces.json'),
    'utf8',
  ),
) as ConvoItemSurface[];

export function surfaceTl(itemId: string): string {
  return DAY18_SURFACES.find((s) => s.id === itemId)?.tl ?? itemId;
}

export function otherSurfaces(itemId: string): ConvoItemSurface[] {
  return DAY18_SURFACES.filter((s) => s.id !== itemId);
}

export function choicePending(
  itemId: string,
): NonNullable<ConvoPendingQuestion> {
  const q = DAY18_PACK.items[itemId]?.choice_questions[0];
  if (!q) throw new Error(`no choice question for ${itemId}`);
  return { id: q.id, kind: 'choice', item_id: itemId };
}

export function openPending(
  itemId: string,
): NonNullable<ConvoPendingQuestion> {
  const q = DAY18_PACK.items[itemId]?.open_questions[0];
  if (!q) throw new Error(`no open question for ${itemId}`);
  return { id: q.id, kind: 'open', item_id: itemId };
}

export function recapPending(
  recapId: string,
): NonNullable<ConvoPendingQuestion> {
  const q = DAY18_PACK.recap.questions.find((x) => x.id === recapId);
  if (!q) throw new Error(`no recap question ${recapId}`);
  return { id: q.id, kind: 'recap', item_id: q.item_id };
}

export function gradeAndApply(
  session: ConvoSession,
  pending: NonNullable<ConvoPendingQuestion>,
  learnerText: string,
): ApplyConvoGradeResult {
  const bank = DAY18_PACK.items[pending.item_id];
  const grade = gradeConvoAnswer({
    learnerText,
    question: {
      id: pending.id,
      item_id: pending.item_id,
      mistakes: bank?.common_mistakes.map((m) => ({
        id: m.id,
        trigger: m.trigger,
      })),
    },
    itemTl: surfaceTl(pending.item_id),
    otherItems: otherSurfaces(pending.item_id),
  });
  return applyConvoGrade({
    session,
    pack: DAY18_PACK,
    grade,
    pending,
  });
}

export type ScriptStep =
  | {
      kind: 'answer';
      pending: NonNullable<ConvoPendingQuestion>;
      text: string;
      expectRung?: string;
      expectMoments?: CoachMoment[];
      expectHelpStep?: number;
      expectPhase?: ConvoSession['phase'];
      expectGroup?: number;
    }
  | { kind: 'assert'; check: (s: ConvoSession) => void };

/**
 * Drive a full day-18 walk: group 1 (with one wrong + four-miss assist),
 * group 2, recap, closing.
 */
export function day18ScriptSteps(): ScriptStep[] {
  const g1 = DAY18_PACK.groups[0].item_ids;
  const g2 = DAY18_PACK.groups[1].item_ids;
  const steps: ScriptStep[] = [];

  // Group 1 item 0: choice + open correct
  steps.push({
    kind: 'answer',
    pending: choicePending(g1[0]),
    text: surfaceTl(g1[0]),
    expectRung: 'understood',
  });
  steps.push({
    kind: 'answer',
    pending: openPending(g1[0]),
    text: surfaceTl(g1[0]),
    expectRung: 'said',
    expectMoments: ['first_said'],
  });

  // Group 1 item 1: choice correct, then wrong, then four misses on open → assisted
  steps.push({
    kind: 'answer',
    pending: choicePending(g1[1]),
    text: surfaceTl(g1[1]),
    expectRung: 'understood',
  });
  // Misses must grade as `wrong` (other taught item), not `unclear`.
  const wrongStreet = surfaceTl(g1[0]); // estação when expecting rua
  steps.push({
    kind: 'answer',
    pending: openPending(g1[1]),
    text: wrongStreet,
    expectHelpStep: 1,
    expectMoments: ['miss_1'],
  });
  steps.push({
    kind: 'answer',
    pending: { ...openPending(g1[1]), kind: 'help' },
    text: wrongStreet,
    expectHelpStep: 2,
    expectMoments: ['miss_2'],
  });
  steps.push({
    kind: 'answer',
    pending: { ...openPending(g1[1]), kind: 'help' },
    text: wrongStreet,
    expectHelpStep: 3,
    expectMoments: ['miss_3'],
  });
  steps.push({
    kind: 'answer',
    pending: { ...openPending(g1[1]), kind: 'help' },
    text: wrongStreet,
    expectHelpStep: 4,
    expectMoments: ['miss_4'],
  });
  // correct after struggle → assisted
  steps.push({
    kind: 'answer',
    pending: { ...openPending(g1[1]), kind: 'help' },
    text: surfaceTl(g1[1]),
    expectRung: 'assisted',
    expectMoments: ['success_after_struggle'],
  });

  // Group 1 item 2: choice → all 👆 → group_done + advance; open still recycles
  steps.push({
    kind: 'answer',
    pending: choicePending(g1[2]),
    text: surfaceTl(g1[2]),
    expectRung: 'understood',
    expectGroup: 2,
    expectMoments: ['group_done'],
  });
  steps.push({
    kind: 'answer',
    pending: openPending(g1[2]),
    text: surfaceTl(g1[2]),
    expectRung: 'said',
    expectMoments: ['first_said'],
  });

  // Group 2: all three choice+open correct
  for (let i = 0; i < g2.length; i++) {
    const id = g2[i];
    const isLast = i === g2.length - 1;
    steps.push({
      kind: 'answer',
      pending: choicePending(id),
      text: surfaceTl(id),
      expectRung: 'understood',
      // Last g2 choice: group complete (no further group to advance)
      ...(isLast ? { expectMoments: ['group_done'] as CoachMoment[] } : {}),
    });
    steps.push({
      kind: 'answer',
      pending: openPending(id),
      text: surfaceTl(id),
      expectRung: 'said',
      ...(isLast
        ? { expectPhase: 'recap' as const, expectMoments: ['first_said'] }
        : { expectMoments: ['first_said'] as CoachMoment[] }),
    });
  }

  // Recap all
  for (const q of DAY18_PACK.recap.questions) {
    const isLast =
      q.id ===
      DAY18_PACK.recap.questions[DAY18_PACK.recap.questions.length - 1].id;
    steps.push({
      kind: 'answer',
      pending: recapPending(q.id),
      text: surfaceTl(q.item_id),
      ...(isLast
        ? {
            expectPhase: 'closing' as const,
            expectMoments: ['conversation_finished'] as CoachMoment[],
          }
        : {}),
    });
  }

  return steps;
}

export function runDay18Script(opts?: {
  onStep?: (stepIndex: number, result: ApplyConvoGradeResult) => void;
}): { session: ConvoSession; turns: ApplyConvoGradeResult[] } {
  let session = createConvoSessionDoc({
    id: 'script-day18',
    userId: 'script-user',
    pack: DAY18_PACK,
  });
  const turns: ApplyConvoGradeResult[] = [];
  const steps = day18ScriptSteps();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.kind === 'assert') {
      step.check(session);
      continue;
    }
    const result = gradeAndApply(session, step.pending, step.text);
    session = result.session;
    turns.push(result);
    opts?.onStep?.(i, result);

    if (step.expectRung) {
      const rung = session.rungs[step.pending.item_id];
      if (rung !== step.expectRung) {
        throw new Error(
          `step ${i}: expected rung ${step.expectRung} for ${step.pending.item_id}, got ${rung}`,
        );
      }
    }
    if (step.expectHelpStep !== undefined) {
      if (session.help_ladder.step !== step.expectHelpStep) {
        throw new Error(
          `step ${i}: expected help step ${step.expectHelpStep}, got ${session.help_ladder.step}`,
        );
      }
    }
    if (step.expectPhase && session.phase !== step.expectPhase) {
      throw new Error(
        `step ${i}: expected phase ${step.expectPhase}, got ${session.phase}`,
      );
    }
    if (step.expectGroup !== undefined && session.current_group !== step.expectGroup) {
      throw new Error(
        `step ${i}: expected group ${step.expectGroup}, got ${session.current_group}`,
      );
    }
    if (step.expectMoments) {
      for (const m of step.expectMoments) {
        if (!result.moments.includes(m)) {
          throw new Error(
            `step ${i}: expected moment ${m}, got [${result.moments.join(', ')}]`,
          );
        }
      }
    }
  }

  return { session, turns };
}
