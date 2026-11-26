import { toArDigits } from '@/lib/v2/formatAr';
import { coachCollapsedRound, coachOpening, coachRoundName } from './coach';
import type {
  LocalAnswerState,
  ReviewSession,
  ReviewStep,
  ReviewStepDisplay,
  ThreadMessage,
} from './types';

function lessonLabel(window: ReviewSession['window'], day: number): string {
  const hit = window.find((w) => w.day === day);
  return hit ? `Dia ${day}` : `Dia ${day}`;
}

function lessonsList(window: ReviewSession['window']): string {
  return window.map((w) => `Dia ${w.day}`).join(' و ');
}

function stepDisplay(
  step: ReviewStep,
  local?: LocalAnswerState,
): ReviewStepDisplay | undefined {
  if (local?.feedback) return local.feedback;
  if (step.display) return step.display;
  if (local?.verdict && local.learnerText) {
    return {
      verdict: local.verdict,
      learner_text: local.learnerText,
    };
  }
  if (step.result?.correct === true) {
    return { verdict: 'correct', learner_text: '…' };
  }
  if (step.result?.correct === false) {
    return { verdict: 'wrong', learner_text: '…' };
  }
  return undefined;
}

function isAnswered(
  stepIndex: number,
  _step: ReviewStep,
  currentStep: number,
  local?: LocalAnswerState,
): boolean {
  if (stepIndex < currentStep) return true;
  if (local?.verdict && !local.pending) return true;
  return false;
}

function audioFromQuestion(q: ReviewStep['question']): string | undefined {
  if (!q || typeof q !== 'object') return undefined;
  const accepted = q.accepted;
  if (Array.isArray(accepted) && typeof accepted[0] === 'string') {
    return accepted[0];
  }
  const prompt = q.prompt as { tl?: string } | undefined;
  if (prompt && typeof prompt.tl === 'string') return prompt.tl;
  if (typeof q.prompt_tl === 'string') return q.prompt_tl;
  return undefined;
}

export type DerivedThread = {
  messages: ThreadMessage[];
  currentRound: number;
  stepInRound: number;
  stepsInRound: number;
  headerRound: number;
  headerStepInRound: number;
};

export function deriveThread(opts: {
  session: ReviewSession;
  currentStep: number;
  expandedRounds: Set<number>;
  localByStep: Map<number, LocalAnswerState>;
  learnerName: string;
  showTypingStep?: number | null;
  showRoundEnd?: boolean;
  showSessionEnd?: boolean;
}): DerivedThread {
  const { session, currentStep, expandedRounds, localByStep, learnerName } =
    opts;
  const messages: ThreadMessage[] = [];
  const rounds = session.rounds_total || 1;
  const opening = coachOpening(
    learnerName,
    lessonsList(session.window),
    rounds,
    0,
  );
  messages.push({ id: 'opening', kind: 'opening', text: opening });

  const stepsByRound = new Map<number, ReviewStep[]>();
  for (const s of session.steps) {
    const r = s.round;
  const list = stepsByRound.get(r) ?? [];
    list.push(s);
    stepsByRound.set(r, list);
  }

  let globalIndex = 0;
  let headerRound = 1;
  let headerStepInRound = 1;
  let stepsInRound = 1;
  let stepInRound = 1;

  for (let round = 1; round <= rounds; round += 1) {
    const roundSteps = stepsByRound.get(round) ?? [];
    stepsInRound = roundSteps.length || 1;
    const firstGlobal = globalIndex;
    const lastGlobal = globalIndex + roundSteps.length - 1;
    const roundActive = currentStep >= firstGlobal && currentStep <= lastGlobal;

    // Future rounds: don't preview their divider until continueRound advances.
    if (firstGlobal > currentStep) {
      globalIndex += roundSteps.length;
      continue;
    }

    if (
      round < getCurrentRound(session, currentStep) &&
      !expandedRounds.has(round)
    ) {
      messages.push({
        id: `collapsed-${round}`,
        kind: 'round_collapsed',
        round,
        answeredCount: roundSteps.length,
        text: coachCollapsedRound(round, roundSteps.length, round),
      });
      globalIndex += roundSteps.length;
      continue;
    }

    messages.push({
      id: `divider-${round}`,
      kind: 'round_divider',
      round,
      text: coachRoundName(round, round),
    });

    roundSteps.forEach((step, idxInRound) => {
      const stepIndex = globalIndex;
      const local = localByStep.get(stepIndex);
      const answered = isAnswered(stepIndex, step, currentStep, local);
      const q = step.question;
      const qType = String(q?.type ?? 'read_meaning');

      if (roundActive || currentStep >= stepIndex) {
        if (currentStep === stepIndex) {
          headerRound = round;
          headerStepInRound = idxInRound + 1;
          stepInRound = idxInRound + 1;
        }
      }

      if (stepIndex > currentStep && !answered) {
        globalIndex += 1;
        return;
      }

      if (qType === 'reply_speak' && stepIndex <= currentStep) {
        messages.push({
          id: `char-${stepIndex}`,
          kind: 'character',
          stepIndex,
          characterName: String(
            (q?.character as { name?: string })?.name ?? 'صديق',
          ),
          characterTl: String(
            (q?.character as { tl?: string })?.tl ?? audioFromQuestion(q) ?? '',
          ),
          characterHidden: !answered,
          round,
        });
      }

      const display = answered ? stepDisplay(step, local) : undefined;
      const learnerText =
        local?.learnerText ??
        display?.learner_text ??
        display?.correct_tl ??
        undefined;

      if (stepIndex <= currentStep || answered) {
        messages.push({
          id: `q-${stepIndex}`,
          kind: 'question',
          stepIndex,
          round,
          question: q ?? undefined,
          lessonDay: step.lesson_day,
          stepInRound: idxInRound + 1,
          stepsInRound: roundSteps.length,
          compact: answered || stepIndex < currentStep,
          audioText: audioFromQuestion(q),
          learnerText: answered ? learnerText : undefined,
        });
      }

      if (local?.hintUsed && stepIndex === currentStep && !answered) {
        const hintText =
          (typeof q?.hint === 'string' && q.hint) ||
          (q?.rule_chip ? String(q.rule_chip) : '') ||
          '';
        if (hintText) {
          messages.push({
            id: `hint-${stepIndex}`,
            kind: 'hint',
            stepIndex,
            text: hintText,
          });
        }
      }

      if (display) {
        if (local?.pending) {
          messages.push({
            id: `typing-${stepIndex}`,
            kind: 'typing',
            stepIndex,
          });
        } else {
          messages.push({
            id: `learner-${stepIndex}`,
            kind: 'learner',
            stepIndex,
            text: learnerText ?? '',
          });
          messages.push({
            id: `fb-${stepIndex}`,
            kind: 'feedback',
            stepIndex,
            display,
          });
        }
      }

      globalIndex += 1;
    });

    // advance() parks on the last step and sets showRoundEnd — don't require past-the-round.
    const roundDone =
      roundSteps.length > 0 &&
      Boolean(opts.showRoundEnd) &&
      currentStep === lastGlobal;
    if (roundDone) {
      messages.push({
        id: `round-end-${round}`,
        kind: 'round_end',
        round,
        answeredCount: roundSteps.length,
      });
    }
  }

  if (opts.showSessionEnd || session.status === 'done') {
    messages.push({ id: 'session-end', kind: 'session_end' });
  }

  return {
    messages,
    currentRound: headerRound,
    stepInRound,
    stepsInRound,
    headerRound,
    headerStepInRound,
  };
}

function getCurrentRound(session: ReviewSession, currentStep: number): number {
  let i = 0;
  for (const s of session.steps) {
    if (i === currentStep) return s.round;
    i += 1;
  }
  const last = session.steps[session.steps.length - 1];
  return last?.round ?? session.resume.round ?? 1;
}

export function headerSubtitle(
  round: number,
  roundsTotal: number,
  x: number,
  y: number,
): string {
  return `جولة ${toArDigits(round)} من ${toArDigits(roundsTotal)} · ${toArDigits(x)} من ${toArDigits(y)}`;
}

export function composerForType(type: string): import('./types').ComposerKind {
  switch (type) {
    case 'listen_meaning':
    case 'listen_pick_tl':
    case 'situation_choice':
    case 'pick_tl':
    case 'image_pick_tl':
      return 'choice';
    case 'pick_meaning':
    case 'read_meaning':
    case 'choose_article':
    case 'complete_phrase':
    case 'fill_blank_choice':
      return 'chips';
    case 'listen_pick_image':
      return 'image_grid';
    case 'build_sentence':
      return 'tiles';
    case 'dictation':
    case 'translate_write':
    case 'fill_blank_write':
    case 'describe_image_write':
    case 'image_write':
    case 'reply_write':
      return 'text';
    case 'say_it':
    case 'reply_speak':
    case 'describe_image_speak':
    case 'image_say':
    case 'read_aloud':
      return 'mic';
    default:
      return 'chips';
  }
}

export function isLlmGradedType(type: string): boolean {
  return (
    type === 'reply_write' ||
    type === 'describe_image_write' ||
    type === 'reply_speak' ||
    type === 'describe_image_speak' ||
    type === 'say_it'
  );
}