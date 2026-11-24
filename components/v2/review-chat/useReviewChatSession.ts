'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postProgressEvent } from '@/lib/v2/progress/clientEvent';
import {
  isClosedQuestionType,
  isOpenWriteType,
  isSpeakingType,
} from '@/lib/v2/generation/lesson/questionTypes';
import { coachFooter, coachNext, coachSelfRateNote, coachTyping } from '@/lib/v2/review-chat/coach';
import {
  composerForType,
  deriveThread,
  headerSubtitle,
  isLlmGradedType,
} from '@/lib/v2/review-chat/deriveThread';
import type {
  ComposerKind,
  FeedbackVerdict,
  LocalAnswerState,
  ReviewQuestion,
  ReviewSession,
  ReviewStepDisplay,
} from '@/lib/v2/review-chat/types';

function newAnswerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[?!.,]/g, '')
    .trim()
    .toLowerCase();
}

function optionsFromQuestion(q: ReviewQuestion): Array<{ id: string; label: string; ar?: boolean }> {
  const raw = q.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((o, i) => {
    if (o && typeof o === 'object') {
      const row = o as { ar?: string; tl?: string };
      return {
        id: String(i),
        label: row.ar ?? row.tl ?? '',
        ar: Boolean(row.ar),
      };
    }
    return { id: String(i), label: String(o) };
  });
}

function gradeClosed(q: ReviewQuestion, optionIndex: number): {
  correct: boolean;
  verdict: FeedbackVerdict;
  display: ReviewStepDisplay;
  learnerText: string;
} {
  const answer =
    typeof q.answer === 'number' ? q.answer : 0;
  const correct = optionIndex === answer;
  const opts = optionsFromQuestion(q);
  const learnerText = opts[optionIndex]?.label ?? '';
  const correct_tl = Array.isArray(q.accepted) ? q.accepted[0] : opts[answer]?.label;
  return {
    correct,
    verdict: correct ? 'correct' : 'wrong',
    learnerText,
    display: {
      verdict: correct ? 'correct' : 'wrong',
      learner_text: learnerText,
      correct_tl,
      meaning_eg: opts[answer]?.ar ? opts[answer]?.label : undefined,
      grammar_note: !correct ? q.grammar_note : undefined,
      why_eg:
        !correct && q.grammar_note
          ? q.grammar_note.rule_eg
          : undefined,
      logged_weak: !correct,
    },
  };
}

function gradeOpenLocal(
  q: ReviewQuestion,
  text: string,
): { correct: boolean; verdict: FeedbackVerdict; display: ReviewStepDisplay } {
  const accepted = Array.isArray(q.accepted) ? q.accepted.map(String) : [];
  const ok = accepted.some((a) => normalize(a) === normalize(text));
  const model = accepted[0] ?? '';
  const nm = Array.isArray(q.near_miss) ? q.near_miss[0] : undefined;
  if (ok) {
    return {
      correct: true,
      verdict: 'correct',
      display: {
        verdict: 'correct',
        learner_text: text,
        correct_tl: model,
      },
    };
  }
  if (nm && normalize(nm.tl) === normalize(text)) {
    return {
      correct: false,
      verdict: 'near_miss',
      display: {
        verdict: 'near_miss',
        learner_text: text,
        corrected_tl: model,
        why_eg: nm.feedback_eg,
        logged_weak: true,
      },
    };
  }
  return {
    correct: false,
    verdict: 'wrong',
    display: {
      verdict: 'wrong',
      learner_text: text,
      correct_tl: model,
      logged_weak: true,
    },
  };
}

type UseOpts = {
  session: ReviewSession;
  fixtureMode?: boolean;
  learnerName: string;
  onSessionChange?: (patch: Partial<ReviewSession>) => void;
};

export function useReviewChatSession({
  session,
  fixtureMode,
  learnerName,
  onSessionChange,
}: UseOpts) {
  const [currentStep, setCurrentStep] = useState(session.resume?.step ?? 0);
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const [localByStep, setLocalByStep] = useState<Map<number, LocalAnswerState>>(
    () => new Map(),
  );
  const [awaitingNext, setAwaitingNext] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [tileOrder, setTileOrder] = useState<number[]>([]);
  const [showRoundEnd, setShowRoundEnd] = useState(false);
  const [showSessionEnd, setShowSessionEnd] = useState(
    session.status === 'done',
  );
  const [writingFallback, setWritingFallback] = useState(false);
  const [needSelfRate, setNeedSelfRate] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCurrentStep(session.resume?.step ?? 0);
  }, [session.resume?.step, session.local_date]);

  const step = session.steps[currentStep];
  const question = step?.question;
  const qType = String(question?.type ?? '');

  const { messages, headerRound, headerStepInRound, stepsInRound } = useMemo(
    () =>
      deriveThread({
        session,
        currentStep,
        expandedRounds,
        localByStep,
        learnerName,
        showTypingStep: null,
        showRoundEnd,
        showSessionEnd,
      }),
    [
      session,
      currentStep,
      expandedRounds,
      localByStep,
      learnerName,
      showRoundEnd,
      showSessionEnd,
    ],
  );

  const composerKind: ComposerKind = useMemo(() => {
    if (showSessionEnd) return 'session_end';
    if (showRoundEnd) return 'round_end';
    if (awaitingNext) return 'next';
    if (needSelfRate) return 'self_rate';
    const local = localByStep.get(currentStep);
    if (local?.verdict && !local.pending) return 'next';
    if (!question) return 'none';
    if (writingFallback && isSpeakingType(qType)) return 'text';
    return composerForType(qType);
  }, [
    awaitingNext,
    needSelfRate,
    localByStep,
    currentStep,
    question,
    qType,
    showRoundEnd,
    showSessionEnd,
    writingFallback,
  ]);

  const persistAnswer = useCallback(
    async (
      body: Record<string, unknown>,
      stepIndex: number,
      correct: boolean,
    ) => {
      const answer_id = newAnswerId();
      const event_id = answer_id;
      const hint_used = Boolean(localByStep.get(stepIndex)?.hintUsed);
      if (!fixtureMode) {
        void fetch('/api/v2/answers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-timezone':
              typeof Intl !== 'undefined'
                ? Intl.DateTimeFormat().resolvedOptions().timeZone
                : 'UTC',
          },
          body: JSON.stringify({ ...body, answer_id, hint_used }),
        }).catch(() => {});
        const st = session.steps[stepIndex];
        if (st) {
          postProgressEvent({
            kind: 'review_step_answered',
            event_id,
            step_index: stepIndex,
            lesson_day: st.lesson_day,
            item_id: st.pairs[0]?.item_id ?? 'unknown',
            skill: st.pairs[0]?.skill ?? 'reading',
            question_type: String(st.question?.type ?? ''),
            correct: hint_used ? false : correct,
            answer_id,
            local_date: session.local_date,
          });
        }
      }
      return answer_id;
    },
    [fixtureMode, session, localByStep],
  );

  const applyAnswer = useCallback(
    (
      stepIndex: number,
      learnerText: string,
      display: ReviewStepDisplay,
      pending = false,
    ) => {
      setLocalByStep((prev) => {
        const next = new Map(prev);
        next.set(stepIndex, {
          stepIndex,
          learnerText,
          verdict: display.verdict,
          feedback: display,
          pending,
          firstTryPosted: true,
        });
        return next;
      });
      if (!pending) {
        setAwaitingNext(true);
      }
    },
    [],
  );

  const finishTyping = useCallback(
    (stepIndex: number, text: string, q: ReviewQuestion) => {
      const graded = gradeOpenLocal(q, text);
      applyAnswer(stepIndex, text, graded.display);
    },
    [applyAnswer],
  );

  const submitText = useCallback(
    async (text: string) => {
      if (!question || !step) return;
      applyAnswer(currentStep, text, {
        verdict: 'unclear',
        learner_text: text,
      }, true);
      if (isLlmGradedType(qType) && !fixtureMode) {
        typingTimer.current = setTimeout(() => {
          finishTyping(currentStep, text, question);
        }, 8000);
        try {
          const res = await fetch('/api/v2/answers', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-timezone':
                typeof Intl !== 'undefined'
                  ? Intl.DateTimeFormat().resolvedOptions().timeZone
                  : 'UTC',
            },
            body: JSON.stringify({
              kind: 'open',
              answer_id: newAnswerId(),
              day: step.lesson_day,
              skill: String(question.skill ?? 'writing'),
              text,
              question_id: String(question.id ?? ''),
              question_type: qType,
              accepted: question.accepted,
              near_miss: question.near_miss,
            }),
          });
          const data = await res.json();
          if (typingTimer.current) clearTimeout(typingTimer.current);
          const verdict = (data.verdict ?? 'unclear') as FeedbackVerdict;
          const display: ReviewStepDisplay = {
            verdict:
              verdict === 'near_miss' || verdict === 'wrong' || verdict === 'correct'
                ? verdict
                : 'unclear',
            learner_text: text,
            correct_tl: question.accepted?.[0],
            model_tl: question.accepted?.[0],
            why_eg: data.feedback_eg,
          };
          applyAnswer(currentStep, text, display);
        } catch {
          if (typingTimer.current) clearTimeout(typingTimer.current);
          finishTyping(currentStep, text, question);
        }
      } else {
        const graded = gradeOpenLocal(question, text);
        applyAnswer(currentStep, text, graded.display);
        void persistAnswer(
          {
            kind: 'open',
            day: step.lesson_day,
            skill: String(question.skill ?? 'writing'),
            text,
            question_id: String(question.id ?? ''),
            question_type: qType,
            accepted: question.accepted,
          },
          currentStep,
          graded.correct,
        );
      }
      setComposerText('');
    },
    [
      question,
      step,
      applyAnswer,
      currentStep,
      qType,
      fixtureMode,
      finishTyping,
      persistAnswer,
    ],
  );

  const submitOption = useCallback(
    async (optionIndex: number) => {
      if (!question || !step) return;
      const graded = gradeClosed(question, optionIndex);
      applyAnswer(currentStep, graded.learnerText, graded.display);
      void persistAnswer(
        {
          kind: 'closed',
          day: step.lesson_day,
          skill: String(question.skill ?? 'reading'),
          option_index: optionIndex,
          correct_index:
            typeof question.answer === 'number' ? question.answer : 0,
          question_id: String(question.id ?? ''),
          question_type: qType,
        },
        currentStep,
        graded.correct,
      );
      setSelectedOption(null);
    },
    [question, step, applyAnswer, currentStep, persistAnswer, qType],
  );

  const advance = useCallback(() => {
    setAwaitingNext(false);
    setNeedSelfRate(false);
    setWritingFallback(false);
    const next = currentStep + 1;
    const roundSteps = session.steps.filter(
      (s) => s.round === (step?.round ?? 1),
    );
    const idxInRound = roundSteps.findIndex(
      (_, i) =>
        session.steps.indexOf(roundSteps[i]!) === currentStep,
    );
    if (idxInRound === roundSteps.length - 1) {
      setShowRoundEnd(true);
      return;
    }
    if (next >= session.steps.length) {
      setShowSessionEnd(true);
      onSessionChange?.({ status: 'done' });
      if (!fixtureMode) {
        postProgressEvent({
          kind: 'review_round_done',
          round: step?.round ?? 1,
          local_date: session.local_date,
        });
      }
      return;
    }
    setCurrentStep(next);
  }, [currentStep, session, step, fixtureMode, onSessionChange]);

  const continueRound = useCallback(() => {
    setShowRoundEnd(false);
    setAwaitingNext(false);
    const next = currentStep + 1;
    if (next >= session.steps.length) {
      setShowSessionEnd(true);
      onSessionChange?.({ status: 'done' });
      return;
    }
    setCurrentStep(next);
  }, [currentStep, session.steps.length, onSessionChange]);

  const stopSession = useCallback(() => {
    setShowRoundEnd(false);
    setShowSessionEnd(true);
    onSessionChange?.({ status: 'done' });
  }, [onSessionChange]);

  const toggleRound = useCallback((round: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  }, []);

  const sessionLessons = useMemo(
    () =>
      session.window.map((w) => ({
        title: `درس ${w.day}`,
        subtitle: `Dia ${w.day}`,
        status: 'اتراجع كله ✓',
      })),
    [session.window],
  );

  return {
    messages,
    headerSubtitle: headerSubtitle(
      headerRound,
      session.rounds_total,
      headerStepInRound,
      stepsInRound,
    ),
    progressSegments: stepsInRound,
    progressFilled: headerStepInRound,
    composerKind,
    question,
    qType,
    composerText,
    setComposerText,
    selectedOption,
    setSelectedOption,
    tileOrder,
    setTileOrder,
    submitText,
    submitOption,
    submitTiles: () => {
      if (!question) return;
      const answerOrder = Array.isArray(question.answer)
        ? (question.answer as number[])
        : [];
      const ok =
        tileOrder.length === answerOrder.length &&
        tileOrder.every((v, i) => v === answerOrder[i]);
      const text = tileOrder
        .map((i) => (question.tiles ?? [])[i])
        .filter(Boolean)
        .join(' ');
      const display: ReviewStepDisplay = {
        verdict: ok ? 'correct' : 'wrong',
        learner_text: text,
        correct_tl: question.accepted?.[0],
        logged_weak: !ok,
      };
      applyAnswer(currentStep, text, display);
      void persistAnswer(
        {
          kind: 'closed',
          day: step?.lesson_day ?? 1,
          skill: 'grammar',
          option_index: ok ? 1 : 0,
          correct_index: 1,
          question_id: String(question.id ?? ''),
          question_type: 'build_sentence',
        },
        currentStep,
        ok,
      );
    },
    advance,
    continueRound,
    stopSession,
    toggleRound,
    expandedRounds,
    sessionLessons,
    footer: coachFooter(currentStep),
    nextLabel: coachNext(currentStep),
    typingLabel: coachTyping(currentStep),
    selfRateNote: coachSelfRateNote(currentStep),
    onMicRecorded: () => setNeedSelfRate(true),
    onSelfRate: (rating: 'said_correct' | 'near' | 'still') => {
      const model = question?.accepted?.[0] ?? '';
      applyAnswer(currentStep, '…', {
        verdict: 'self_rated',
        learner_text: 'تسجيل صوتي',
        model_tl: model,
        self_rating: rating,
      });
      setNeedSelfRate(false);
      setAwaitingNext(true);
    },
    onCantSpeak: () => setWritingFallback(true),
    options: question ? optionsFromQuestion(question) : [],
    chips: question ? optionsFromQuestion(question) : [],
    imageCells: question
      ? optionsFromQuestion(question).map((o, i) => ({
          id: o.id,
          label: o.label,
          url: Array.isArray(question.image_refs)
            ? null
            : null,
          state: undefined as 'idle' | 'correct' | 'wrong' | undefined,
          _i: i,
        }))
      : [],
    tiles: Array.isArray(question?.tiles) ? question.tiles.map(String) : [],
    requestHint: () => {
      if (!question) return;
      const hint =
        typeof question.hint === 'string'
          ? question.hint
          : question.rule_chip
            ? String(question.rule_chip)
            : '';
      if (!hint) return;
      setLocalByStep((prev) => {
        const next = new Map(prev);
        const cur = next.get(currentStep);
        next.set(currentStep, {
          stepIndex: currentStep,
          learnerText: cur?.learnerText ?? '',
          verdict: cur?.verdict,
          feedback: cur?.feedback,
          pending: false,
          firstTryPosted: cur?.firstTryPosted ?? false,
          hintUsed: true,
        });
        return next;
      });
    },
    isClosed: isClosedQuestionType(qType) || qType === 'build_sentence',
    isOpen: isOpenWriteType(qType),
    isSpeaking: isSpeakingType(qType),
    awaitingNext,
    showRoundEnd,
    closedChipsImmediate: qType === 'pick_meaning' || qType === 'read_meaning',
    onChipPick: (id: string) => {
      if (!question) return;
      const idx = Number(id);
      if (composerKind === 'chips') {
        void submitOption(idx);
      }
    },
  };
}