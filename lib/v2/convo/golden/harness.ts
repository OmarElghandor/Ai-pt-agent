import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import { checkReplyLevel } from '@/lib/v2/convo/guard/levelGuard';
import { isGreetingOrSmallTalk } from '@/lib/v2/convo/router';
import { OPEN_TOPIC_ID } from '@/lib/v2/convo/topics/openTopic';

export type GoldenTurnCheck = {
  expectGreetingReask?: boolean;
  expectTopicId?: string;
  expectTeaching?: boolean;
  expectExit?: boolean;
  expectQuestion?: boolean;
  forbidOffLevel?: boolean;
  forbidTopicDrift?: string[];
};

export type GoldenScript = {
  id: string;
  level: number;
  /** Start topic; default open one-chat. */
  topicId?: string;
  turns: Array<{
    learner: string;
    /** Stub model PT/AR/GOALS block for this turn (when the model is called). */
    modelReply?: string;
    check?: GoldenTurnCheck;
  }>;
};

export type GoldenTurnResult = {
  learner: string;
  events: ConvoTurnStreamEvent[];
  topic_id: string | null;
  topic_locked: boolean;
  teaching_mode: boolean;
  current_goal: string | null;
  goals_done: number;
  goals_open: number;
  status: string;
  character_tls: string[];
  ok: boolean;
  failures: string[];
};

function characterTls(events: ConvoTurnStreamEvent[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.type === 'bubble_ar' && e.pt?.trim()) out.push(e.pt.trim());
    if (e.type === 'question' && e.tl?.trim()) out.push(e.tl.trim());
    if (e.type === 'reaction_reset' && e.text?.trim()) out.push(e.text.trim());
  }
  return out;
}

function hasQuestion(events: ConvoTurnStreamEvent[]): boolean {
  return events.some((e) => e.type === 'question' && e.tl.includes('?'));
}

export async function playGolden(
  script: GoldenScript,
): Promise<GoldenTurnResult[]> {
  const store = new MemoryConvoSessionStore();
  const started = await startFreeConvoSession({
    userId: `golden:${script.id}`,
    topicId: script.topicId ?? OPEN_TOPIC_ID,
    store,
    learnerLevel: script.level,
    newId: () => `golden-${script.id}`,
    learnerName: 'Omar',
  });
  let session = started.session;
  const results: GoldenTurnResult[] = [];

  for (let i = 0; i < script.turns.length; i++) {
    const turn = script.turns[i]!;
    const events: ConvoTurnStreamEvent[] = [];
    const model = createStubConvoStreamModel({
      byCandidate: () =>
        turn.modelReply ??
        'Ok! E tu?\nAR: حسناً!\nGOALS: -',
    });
    const out = await runFreeConvoTurn({
      session,
      learnerText: turn.learner,
      store,
      model,
      emit: (e) => events.push(e),
    });
    session = out.session;
    const tls = characterTls(events);
    const failures: string[] = [];
    const check = turn.check ?? {};

    if (check.expectGreetingReask) {
      if (!isGreetingOrSmallTalk(turn.learner) && turn.learner.trim()) {
        /* still allow explicit */
      }
      if (session.topic_locked) {
        failures.push('greeting should not lock topic');
      }
      if (!hasQuestion(events)) {
        failures.push('greeting reask missing question');
      }
    }
    if (check.expectTopicId && session.topic_id !== check.expectTopicId) {
      failures.push(
        `expected topic ${check.expectTopicId}, got ${session.topic_id}`,
      );
    }
    if (check.expectTeaching != null) {
      if (session.teaching_mode !== check.expectTeaching) {
        failures.push(
          `teaching_mode expected ${check.expectTeaching}, got ${session.teaching_mode}`,
        );
      }
    }
    if (check.expectExit) {
      if (session.status !== 'done') {
        failures.push('expected session done after exit');
      }
      const coach = events.find(
        (e) => e.type === 'coach' && e.id === 'exit_summary',
      );
      if (!coach) failures.push('missing exit summary coach');
    }
    if (check.expectQuestion !== false && !check.expectExit) {
      if (!hasQuestion(events) && tls.every((t) => !t.includes('?'))) {
        // teach path may put ? in bubble; allow if any tl has ?
        if (!tls.some((t) => t.includes('?'))) {
          failures.push('missing question');
        }
      }
    }
    if (check.forbidOffLevel) {
      for (const tl of tls) {
        const g = checkReplyLevel({
          text: tl,
          level: script.level,
          extraAllowed: session.suggested_words,
        });
        if (!g.ok) {
          failures.push(`off-level words: ${g.offLevel.join(', ')}`);
        }
      }
    }
    for (const bad of check.forbidTopicDrift ?? []) {
      const joined = tls.join(' ').toLowerCase();
      if (joined.includes(bad.toLowerCase())) {
        failures.push(`topic drift: found «${bad}»`);
      }
    }
    // reaction_reset with empty text is a stream clear, not a rendered bubble.
    // bubble_ar without PT is allowed when AR meaning is present (coach path).

    results.push({
      learner: turn.learner,
      events,
      topic_id: session.topic_id,
      topic_locked: session.topic_locked,
      teaching_mode: session.teaching_mode,
      current_goal: session.current_goal,
      goals_done: session.goals.filter((g) => g.status !== 'open').length,
      goals_open: session.goals.filter((g) => g.status === 'open').length,
      status: session.status,
      character_tls: tls,
      ok: failures.length === 0,
      failures,
    });
  }

  return results;
}
