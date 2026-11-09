import { getLangifyUserFirstName } from '@/lib/langifyRead';
import { fillNameSlot } from '@/lib/v2/convo/free';
import {
  buildGoalFreePrompt,
  estimateConvoPromptTokens,
  formatCurrentGoalLine,
  freePromptPartsToMessages,
  pickGoalAskLines,
} from '@/lib/v2/convo/prompt';
import {
  emitVisibleStreamDelta,
} from '@/lib/v2/convo/output/parseOpen';
import {
  parseGoalConvoTurn,
  visibleGoalStreamText,
} from '@/lib/v2/convo/output/parseGoal';
import {
  freeTopicById,
  isOpenTopicId,
  requirePersona,
  type FreeTopic,
} from '@/lib/v2/convo/topics';
import type { ConvoSession, ConvoSessionStore } from '@/lib/v2/convo/session';
import { resolveFreeGoalBank } from '@/lib/v2/convo/session/freeInit';
import { sessionHasGoals } from '@/lib/v2/convo/turn/freeMode';
import {
  applyRouterLock,
  isExplicitTopicRequest,
  isGreetingOrSmallTalk,
  routeTopic,
} from '@/lib/v2/convo/router';
import { loadAuthoredTopicBank } from '@/lib/v2/convo/goals/loadTopicBank';
import { oneChatOpeningFrame } from '@/lib/v2/convo/topics/openingChips';
import { isLearnerExitRequest } from '@/lib/v2/convo/exit/detect';
import { buildExitSummary } from '@/lib/v2/convo/exit/summary';
import {
  acceptModelReportedGoals,
  applyCompletedGoals,
  checkGoals,
  firstOpenGoalId,
  GOALS_DONE_COACH_EG,
  goalStatesFromBank,
  isStuckHelpRequest,
  loadGoalsForDay,
  loadGoalsForTopic,
  messageCompletesGoal,
  openGoalsFromSession,
  pendingFrameFromGoal,
  recastFromExample,
  refillSessionGoals,
  steerActionForTurns,
  stuckHelpForGoal,
  type ConvoGoal,
  type ConvoGoalBank,
} from '@/lib/v2/convo/goals';
import {
  CORE_DONE_COACH_EG,
  allTierDone,
} from '@/lib/v2/convo/goals/tiers';
import {
  emitAuthoredAsk,
  emitTeachSequence,
  shouldShowTeachForGoal,
} from '@/lib/v2/convo/goals/teach';
import { checkReplyLevel } from '@/lib/v2/convo/guard/levelGuard';
import { loadSuggestedSurfacesForUser } from '@/lib/v2/convo/session/suggestedWords';
import { getCharacter } from '@/lib/v2/characters/registry';
import {
  appendConvoCorrectionError,
  awaitAndEmitCorrection,
  matchesAcceptedForm,
  shouldFireFreeTextCorrection,
  startFreeTextCorrection,
} from '@/lib/v2/convo/correction';
import {
  FREE_TEXT_TIMEOUT_MS,
  type FreeTextCorrection,
  type FreeTextGrader,
} from '@/lib/v2/grader';
import {
  classifySideChannel,
  collectFreeContextCandidates,
  isTopicRequestText,
} from '@/lib/v2/convo/sideChannel';
import {
  consumeCoachPhraseOnLearnerTurn,
  extractFreeFact,
  handleFreeArabicSide,
  isLearnerQuestionToCharacter,
  isNonLearningRequest,
  NON_LEARNING_COACH_EG,
  pushFreeFact,
  setCoachPhrase,
} from '@/lib/v2/convo/free';
import {
  maybeRecastPair,
  pushLearnerLine,
} from '@/lib/v2/convo/result/summary';
import type { ConvoCoachCaller } from '@/lib/v2/convo/sideChannel/coachCall';
import type {
  ConvoStreamModel,
  ConvoTurnMetrics,
  ConvoTurnStreamEvent,
} from './types';

const OPEN_PARTNER_IDS = new Set(['ines', 'tiago', 'nour']);

export type RunFreeConvoTurnInput = {
  session: ConvoSession;
  learnerText: string;
  store: ConvoSessionStore;
  model: ConvoStreamModel;
  emit: (event: ConvoTurnStreamEvent) => void;
  topic?: FreeTopic;
  /** When true, learner used ساعدني أرد chips this turn. */
  assisted?: boolean;
  coachCaller?: ConvoCoachCaller;
  /** Optional partner switch (أي حاجة header). */
  characterId?: string;
  /** Client learner bubble id — echoed on correction events (K2). */
  learnerTurnId?: string;
  /** Injected free-text grader (tests). */
  freeTextGrader?: FreeTextGrader;
};

function pushExchange(
  session: ConvoSession,
  role: 'character' | 'learner',
  tl: string,
): void {
  if (!tl.trim()) return;
  session.last_exchanges = [
    ...session.last_exchanges,
    { role, tl: tl.trim() },
  ].slice(-3);
}

async function callGoalModel(opts: {
  model: ConvoStreamModel;
  system: string;
  prompt: string;
  emit: (event: ConvoTurnStreamEvent) => void;
  knownWords?: string[];
  allowFormal?: boolean;
  /** Verbatim ask line after two failed model checks (F4). */
  fallbackAsk?: { tl: string; ar: string } | null;
}): Promise<{
  pt: string;
  ar: string;
  reported_goal_ids: string[];
  unknownWords: string[];
  metricsPartial: Pick<
    ConvoTurnMetrics,
    'ttft_ms' | 'input_tokens' | 'cached_input_tokens' | 'output_tokens'
  >;
  usedAskFallback?: boolean;
}> {
  const { model, system, prompt, emit } = opts;
  const parseOpts = {
    knownWords: opts.knownWords,
    allowFormal: opts.allowFormal,
  };
  let rawAcc = '';
  let visibleAcc = '';
  const onChunk = (chunk: string) => {
    rawAcc += chunk;
    const nextVisible = visibleGoalStreamText(rawAcc);
    visibleAcc = emitVisibleStreamDelta({
      nextVisible,
      visibleAcc,
      emit,
    });
  };

  const streamFn = model.stream?.bind(model) ?? model.complete.bind(model);
  let result = await streamFn({
    system,
    prompt,
    maxTokens: 180,
    onChunk,
  });

  let parsed = parseGoalConvoTurn(result.text, parseOpts);
  if (parsed.decision === 'regenerate' && parsed.regenerateReason) {
    emit({ type: 'reaction_reset', text: '' });
    rawAcc = '';
    visibleAcc = '';
    result = await streamFn({
      system,
      prompt,
      maxTokens: 180,
      regenerateReason: parsed.regenerateReason,
      onChunk,
    });
    parsed = parseGoalConvoTurn(result.text, parseOpts);
    if (parsed.decision === 'regenerate') {
      emit({ type: 'reaction_reset', text: '' });
      const ask = opts.fallbackAsk;
      if (ask?.tl) {
        const pt = `Hmm… ${ask.tl}`.trim();
        emit({ type: 'reaction_reset', text: pt });
        const inputTokens =
          result.usage?.inputTokens ??
          estimateConvoPromptTokens(`${system}\n${prompt}`);
        const cachedInputTokens =
          typeof result.usage?.cachedInputTokens === 'number'
            ? result.usage.cachedInputTokens
            : null;
        const outputTokens =
          result.usage?.outputTokens ?? estimateConvoPromptTokens(result.text);
        return {
          pt,
          ar: ask.ar || '',
          reported_goal_ids: [],
          unknownWords: [],
          usedAskFallback: true,
          metricsPartial: {
            ttft_ms: result.ttftMs,
            input_tokens: inputTokens,
            cached_input_tokens: cachedInputTokens,
            output_tokens: outputTokens,
          },
        };
      }
      parsed = { ...parsed, pt: '', ar: '', decision: 'drop' };
    }
  }

  const inputTokens =
    result.usage?.inputTokens ??
    estimateConvoPromptTokens(`${system}\n${prompt}`);
  const cachedInputTokens =
    typeof result.usage?.cachedInputTokens === 'number'
      ? result.usage.cachedInputTokens
      : null;
  const outputTokens =
    result.usage?.outputTokens ?? estimateConvoPromptTokens(result.text);

  const dropped = parsed.decision === 'drop';
  return {
    pt: dropped ? '' : parsed.pt,
    ar: dropped ? '' : parsed.ar,
    reported_goal_ids: dropped ? [] : parsed.reported_goal_ids,
    unknownWords: parsed.unknownWords,
    metricsPartial: {
      ttft_ms: result.ttftMs,
      input_tokens: inputTokens,
      cached_input_tokens: cachedInputTokens,
      output_tokens: outputTokens,
    },
  };
}

/**
 * One Module C free-chat turn (v4: opening → router → lock → goals → exit).
 */
export async function runFreeConvoTurn(
  input: RunFreeConvoTurnInput,
): Promise<{ session: ConvoSession; metrics: ConvoTurnMetrics }> {
  const started = Date.now();
  let session = structuredClone(input.session);
  const topicId = session.topic_id;
  if (!topicId) throw new Error('free session missing topic_id');

  // Catalog ids (day-1, direcoes, …) resolve via freeTopicById (threads ∪ banks).
  const topic = input.topic ?? freeTopicById(topicId);
  if (!topic) throw new Error(`Unknown free topic: ${topicId}`);

  if (
    input.characterId &&
    OPEN_PARTNER_IDS.has(input.characterId) &&
    (isOpenTopicId(topic.id) || session.free_step.kind === 'open')
  ) {
    session.character_id = input.characterId;
  }

  const hasGoals = sessionHasGoals(session);

  const emit = input.emit;
  let metrics: ConvoTurnMetrics = {
    input_tokens: 0,
    cached_input_tokens: null,
    output_tokens: 0,
    ttft_ms: 0,
    total_ms: 0,
  };

  /** K2: async free-text correction — started after PT accept, emitted before done. */
  let correctionJob: {
    promise: Promise<FreeTextCorrection>;
    learner_turn_id: string;
    original: string;
  } | null = null;

  const flushCorrection = async (waitMs?: number) => {
    if (!correctionJob) return;
    const job = correctionJob;
    correctionJob = null;
    const corr = await awaitAndEmitCorrection({
      promise: job.promise,
      learner_turn_id: job.learner_turn_id,
      original: job.original,
      emit,
      ...(waitMs != null ? { waitMs } : {}),
    });
    if (corr.has_error && corr.severity === 'error' && corr.corrected_tl) {
      session.recasts = [
        ...(session.recasts ?? []),
        {
          original: job.original,
          corrected: corr.corrected_tl,
          ...(corr.ar ? { ar: corr.ar } : {}),
        },
      ].slice(-8);
      void appendConvoCorrectionError({
        userId: session.user_id,
        correction: corr,
        toolId: 'convo_free',
      });
    }
  };

  /** Authored teach turns finish fast — give the grader the full timeout. */
  const flushCorrectionAuthored = () =>
    flushCorrection(FREE_TEXT_TIMEOUT_MS + 500);

  const emitFrameIfAny = () => {
    if (!session.pending_frame) return;
    emit({
      type: 'free_frame',
      tl: session.pending_frame.tl,
      eg: session.pending_frame.eg,
      chips: session.pending_frame.chips,
    });
  };

  /** After a teaching goal closes: code recast + next teach, or free-flow refill. */
  const advanceTeachingAfterGoal = async (
    bank: ConvoGoalBank,
    completedGoal: ConvoGoal | undefined,
  ): Promise<boolean> => {
    const recastTl = recastFromExample(completedGoal?.examples_tl[0]);
    const nextDef = bank.goals.find((g) => g.id === session.current_goal);

    if (session.goal_tier === 'core' && allTierDone(session.goals, bank.goals, 'core')) {
      const coachId = 'core_goals_done';
      if (session.coach_recent_ids.at(-1) !== coachId) {
        session.coach_recent_ids = [...session.coach_recent_ids, coachId].slice(-8);
        emit({
          type: 'coach',
          id: coachId,
          eg: CORE_DONE_COACH_EG,
          moment: 'summary',
        });
      }
      session.goal_tier = 'extended';
      const nextExt = bank.goals.find(
        (g) =>
          g.tier === 'extended' &&
          session.goals.some((s) => s.id === g.id && s.status === 'open'),
      );
      if (nextExt) {
        session.current_goal = nextExt.id;
        session.turns_on_goal = 0;
      } else {
        session.goal_tier = 'free';
      }
    }

    const next =
      bank.goals.find((g) => g.id === session.current_goal) ?? nextDef;

    if (shouldShowTeachForGoal(session, next) && next) {
      await flushCorrectionAuthored();
      session.pending_frame = pendingFrameFromGoal(next);
      emitTeachSequence({
        goal: next,
        session,
        emit,
        recastTl,
      });
      emitFrameIfAny();
      return true;
    }
    if (next && next.id !== completedGoal?.id) {
      await flushCorrectionAuthored();
      if (recastTl) {
        emit({ type: 'bubble_ar', ar: '', pt: recastTl });
      }
      session.pending_frame = pendingFrameFromGoal(next);
      emitAuthoredAsk({ goal: next, session, emit });
      emitFrameIfAny();
      return true;
    }

    // All authored goals done → free flow (weak items); no closing.
    await flushCorrectionAuthored();
    if (recastTl) {
      emit({ type: 'bubble_ar', ar: '', pt: recastTl });
    }
    session.goal_tier = 'free';
    const weak =
      session.suggested_words.length > 0
        ? session.suggested_words
        : await loadSuggestedSurfacesForUser(session.user_id, 8);
    const defaults = ['esquerda', 'ao lado de', 'em frente'];
    const refill = refillSessionGoals({
      existingStates: session.goals,
      existingDefs: bank.goals,
      weakSurfaces: weak.length ? weak : defaults,
      topicSlug: session.topic_id ?? 'direcoes',
    });
    if (refill.newGoals.length) {
      session.goals = refill.states;
      session.current_goal = refill.current_goal;
      session.turns_on_goal = 0;
      bank.goals.push(...refill.newGoals);
      const askGoal = refill.newGoals.find((g) => g.id === refill.current_goal);
      if (askGoal) {
        session.pending_frame = pendingFrameFromGoal(askGoal);
        emitAuthoredAsk({ goal: askGoal, session, emit });
        emitFrameIfAny();
      }
    }
    return true;
  };

  const finish = async (ok: boolean, error?: string) => {
    await flushCorrection();
    session.updated_at = new Date().toISOString();
    session = await input.store.save(session);
    metrics.total_ms = Date.now() - started;
    emit({
      type: 'session',
      session: {
        id: session.id,
        rungs: session.rungs,
        phase: session.phase,
        status: session.status,
        help_ladder: session.help_ladder,
        current_group: session.current_group,
        pending_question: session.pending_question,
        correct_streak: session.correct_streak,
        struggled: session.struggled,
        said_once: session.said_once,
        survival_used: session.survival_used,
      },
    });
    emit({ type: 'metrics', ...metrics });
    emit({ type: 'done', ok, ...(error ? { error } : {}) });
    return { session, metrics };
  };

  // —— v4 exit: خلّص / كفاية (before Arabic side-channel) ——
  {
    const exitText = input.learnerText.trim();
    if (
      (hasGoals || session.topic_locked) &&
      exitText &&
      isLearnerExitRequest(exitText)
    ) {
      const bank =
        resolveFreeGoalBank({
          topic,
          lessonDay: session.lesson_day,
          timeOfDay: session.scene?.time_of_day,
        }) ??
        loadAuthoredTopicBank(session.topic_id ?? '') ??
        (session.topic_id === 'day-1' ? loadGoalsForDay(1) : null);
      const summary = buildExitSummary({
        goals: session.goals,
        defs: bank?.goals ?? [],
        suggestedWords: session.suggested_words,
      });
      const closingTl =
        bank?.closing?.tl?.trim() || 'Ok! Foi um prazer falar contigo. Até logo!';
      const closingAr =
        bank?.closing?.ar?.trim() || 'حسناً! سررت بالحديث معك. إلى اللقاء!';
      emit({ type: 'bubble_ar', ar: closingAr, pt: closingTl });
      emit({
        type: 'question',
        id: 'exit.closing',
        tl: closingTl,
        kind: 'open',
        item_id: 'exit',
        audio_key: `free:${session.id}:exit`,
      });
      emit({
        type: 'coach',
        id: 'exit_summary',
        eg: summary.coach_eg,
        moment: 'summary',
      });
      session.status = 'done';
      session.phase = 'closing';
      session.topic_locked = false;
      return finish(true);
    }
  }

  // V5: stuck help for goal sessions before Arabic side-channel handling.
  // Empty opening turn (no exchanges yet) is not "stuck" — the model must ask.
  const silenceIsStuck =
    input.learnerText.trim().length === 0 &&
    (session.turns_on_goal > 0 || session.last_exchanges.length > 0);
  if (
    hasGoals &&
    (silenceIsStuck ||
      (input.learnerText.trim().length > 0 &&
        isStuckHelpRequest(input.learnerText.trim())))
  ) {
    const bank = resolveFreeGoalBank({
      topic,
      lessonDay: session.lesson_day,
      timeOfDay: session.scene?.time_of_day,
    });
    const currentDefEarly = bank?.goals.find(
      (g) => g.id === session.current_goal,
    );
    if (currentDefEarly) {
      const help = stuckHelpForGoal(currentDefEarly);
      session.pending_frame = {
        tl: help.frame_tl,
        eg: help.eg,
        chips: help.chips,
      };
      const coachId = `goal_help:${currentDefEarly.id}`;
      if (session.coach_recent_ids.at(-1) !== coachId) {
        session.coach_recent_ids = [
          ...session.coach_recent_ids,
          coachId,
        ].slice(-8);
        emit({
          type: 'coach',
          id: coachId,
          eg: help.eg,
          moment: 'help',
        });
      }
      emit({
        type: 'free_frame',
        tl: help.frame_tl,
        eg: help.eg,
        chips: help.chips,
      });
      return finish(true);
    }
  }

  const learnerText = input.learnerText.trim();
  if (input.assisted) {
    session.assisted = true;
  }

  const emitTopicReask = (opts: {
    kind: 'greeting' | 'chips';
    level: number;
  }) => {
    const frame = oneChatOpeningFrame(opts.level);
    const replyTl =
      opts.kind === 'greeting'
        ? 'Olá! 😊 Sobre o que queres falar hoje?'
        : 'Sobre o que queres falar? Escolhe um tema.';
    const replyAr =
      opts.kind === 'greeting'
        ? 'مرحباً! عن ماذا تريد أن تتحدث اليوم؟'
        : 'عن ماذا تريد أن تتحدث؟ اختر موضوعاً.';
    emit({ type: 'bubble_ar', ar: replyAr, pt: replyTl });
    emit({
      type: 'question',
      id: 'open.topic',
      tl: replyTl,
      kind: 'open',
      item_id: 'open.topic',
      audio_key: `free:${session.id}:open.topic`,
    });
    emit({
      type: 'free_frame',
      tl: frame.tl,
      eg: frame.eg,
      chips: frame.chips,
    });
    if (opts.kind === 'greeting') {
      emit({
        type: 'coach',
        id: 'topic_reask',
        eg: 'قول عايز تتكلم عن إيه — أو دوس موضوع من تحت',
        moment: 'nudge',
      });
    }
    session.pending_frame = frame;
    if (learnerText) {
      session.last_exchanges = [
        ...session.last_exchanges,
        { role: 'learner', tl: learnerText },
        { role: 'character', tl: replyTl },
      ].slice(-6);
    }
  };

  const applyTopicLockFromRouter = async (
    decision: Extract<
      Awaited<ReturnType<typeof routeTopic>>,
      { kind: 'lock' }
    >,
    level: number,
  ): Promise<{ session: ConvoSession; metrics: ConvoTurnMetrics }> => {
    applyRouterLock(session, decision, { learnerLevel: level });
    const bank =
      decision.topic_id === 'day-1'
        ? loadGoalsForDay(1)
        : (loadAuthoredTopicBank(decision.topic_id) ??
          (() => {
            try {
              return loadGoalsForTopic(decision.topic_id);
            } catch {
              return null;
            }
          })());
    if (!bank && decision.is_new) {
      const frame = oneChatOpeningFrame(level);
      const replyTl = 'Boa ideia! Sobre o que queres falar exactamente?';
      emit({
        type: 'bubble_ar',
        ar: 'فكرة جيدة! عن ماذا تريد أن تتحدث بالضبط؟',
        pt: replyTl,
      });
      emit({
        type: 'question',
        id: 'open.topic',
        tl: replyTl,
        kind: 'open',
        item_id: 'open.topic',
        audio_key: `free:${session.id}:open.topic`,
      });
      emit({
        type: 'free_frame',
        tl: frame.tl,
        eg: frame.eg,
        chips: frame.chips,
      });
      session.topic_locked = false;
      session.teaching_mode = false;
      session.pending_frame = frame;
      return finish(true);
    }
    if (!bank) {
      return finish(false, `goal bank missing for ${decision.topic_id}`);
    }
    session.topic_id = decision.topic_id;
    if (decision.topic_id === 'day-1') {
      session.lesson_day = 1;
    }
    session.goals = goalStatesFromBank(bank);
    session.current_goal = firstOpenGoalId(session.goals);
    session.turns_on_goal = 0;
    session.teach_shown_for = null;
    session.scene = bank.scene ?? session.scene;
    session.suggested_words = bank.suggested_words?.length
      ? bank.suggested_words
      : session.suggested_words;
    const lockedTopic = freeTopicById(decision.topic_id);
    const titleTl =
      bank.title_tl?.trim() || lockedTopic?.title_tl || decision.topic_id;
    const titleAr =
      bank.title_ar?.trim() || lockedTopic?.title_ar || decision.topic_id;
    emit({
      type: 'topic_lock',
      topic_id: decision.topic_id,
      title_tl: titleTl,
      title_ar: titleAr,
      teaching_mode: session.teaching_mode,
    });
    const currentDef = bank.goals.find((g) => g.id === session.current_goal);
    if (currentDef) {
      session.pending_frame = pendingFrameFromGoal(currentDef);
    }
    pushExchange(session, 'learner', learnerText);
    session.learner_lines = pushLearnerLine(
      session.learner_lines ?? [],
      learnerText,
    );
    const introEg = bank.intro_eg?.trim() || lockedTopic?.intro_eg || null;
    if (currentDef && session.teaching_mode) {
      if (
        emitTeachSequence({
          goal: currentDef,
          session,
          emit,
          introEg,
        })
      ) {
        if (session.pending_frame) {
          emit({
            type: 'free_frame',
            tl: session.pending_frame.tl,
            eg: session.pending_frame.eg,
            chips: session.pending_frame.chips,
          });
        }
        return finish(true);
      }
    }
    if (currentDef) {
      emitAuthoredAsk({
        goal: currentDef,
        session,
        emit,
        introEg,
      });
      if (session.pending_frame) {
        emit({
          type: 'free_frame',
          tl: session.pending_frame.tl,
          eg: session.pending_frame.eg,
          chips: session.pending_frame.chips,
        });
      }
      return finish(true);
    }
    return finish(false, 'no current goal after lock');
  };

  // Topic requests go to the v4 router before the Arabic side channel
  // (and re-run when already locked = switch topic).
  if (
    learnerText &&
    (isExplicitTopicRequest(learnerText) || isTopicRequestText(learnerText))
  ) {
    const level = session.learner_level ?? 1;
    const decision = await routeTopic({
      message: learnerText,
      level,
    });
    if (decision.kind === 'greeting' || decision.kind === 'chips') {
      emitTopicReask({ kind: decision.kind, level });
      return finish(true);
    }
    if (decision.kind === 'lock') {
      return applyTopicLockFromRouter(decision, level);
    }
  }

  if (learnerText && isNonLearningRequest(learnerText)) {
    emit({
      type: 'coach',
      id: 'free_non_learning',
      eg: NON_LEARNING_COACH_EG,
      moment: 'non_learning',
    });
    return finish(true);
  }

  const sideKind = classifySideChannel(input.learnerText);
  const pendingLine = {
    line_id: session.current_goal ?? `${topic.id}.open`,
    tl: '',
    ar: '',
    bubble_tl: '',
    bubble_ar: '',
    frame: session.pending_frame ?? undefined,
  };

  if (
    sideKind === 'arabic_answer' ||
    sideKind === 'other' ||
    sideKind === 'language_question'
  ) {
    const frame = session.pending_frame ?? pendingLine.frame;
    const recentCharacterTls = session.last_exchanges
      .filter((e) => e.role === 'character')
      .slice(-3)
      .map((e) => e.tl);
    const candidates = collectFreeContextCandidates({
      share: null,
      ask: null,
      followUps: [],
      frame: frame ?? null,
      recentCharacterTls,
      arByTl: new Map(),
    });
    const characterId = session.character_id ?? topic.character_id;
    const characterName =
      getCharacter(characterId)?.name ??
      (characterId
        ? characterId.charAt(0).toUpperCase() + characterId.slice(1)
        : null);

    const side = await handleFreeArabicSide({
      kind: sideKind,
      learnerText: input.learnerText.trim(),
      frame,
      emit,
      context: { candidates, characterName },
      ...(input.coachCaller ? { coachCaller: input.coachCaller } : {}),
    });
    if (side.coachPhrase) {
      session.coach_phrase = setCoachPhrase(side.coachPhrase);
    }
    return finish(true);
  }

  // K2: start free-text correction in parallel with the character reply.
  {
    const frame = session.pending_frame ?? pendingLine.frame;
    const chips = frame?.chips ?? [];
    const exactAccepted = matchesAcceptedForm(learnerText, chips);
    if (
      shouldFireFreeTextCorrection({
        learnerText,
        assisted: input.assisted || session.assisted,
        exactAccepted,
      })
    ) {
      const lastChar = session.last_exchanges
        .filter((e) => e.role === 'character')
        .at(-1)?.tl;
      correctionJob = {
        promise: startFreeTextCorrection(
          {
            answer: learnerText,
            character_tl: lastChar,
            frame_tl: frame?.tl,
            frame_chips: chips,
          },
          input.freeTextGrader,
        ),
        learner_turn_id:
          input.learnerTurnId?.trim() ||
          `lt_${Date.now().toString(36)}`,
        original: learnerText,
      };
    }
  }

  // —— v4 router: unlocked greeting / small talk → reask ——
  if (
    !session.topic_locked &&
    !hasGoals &&
    learnerText &&
    isGreetingOrSmallTalk(learnerText)
  ) {
    const level = session.learner_level ?? 1;
    emitTopicReask({ kind: 'greeting', level });
    return finish(true);
  }

  // After a same-turn lock, resolve goals against the locked bank id.
  const lockedTopicForBank =
    session.topic_locked && session.topic_id
      ? ({ id: session.topic_id } as FreeTopic)
      : topic;

  const hasGoalsNow = sessionHasGoals(session);

  // —— v3 goal-directed free talk ——
  if (hasGoalsNow) {
    const bank =
      resolveFreeGoalBank({
        topic: lockedTopicForBank,
        lessonDay: session.lesson_day,
        timeOfDay: session.scene?.time_of_day,
      }) ??
      (session.topic_id === 'day-1'
        ? loadGoalsForDay(1)
        : loadAuthoredTopicBank(session.topic_id ?? '') ??
          (() => {
            try {
              return session.topic_id
                ? loadGoalsForTopic(session.topic_id)
                : null;
            } catch {
              return null;
            }
          })());
    if (!bank) {
      return finish(false, 'goal bank missing');
    }

    const currentDefEarly = bank.goals.find(
      (g) => g.id === session.current_goal,
    );

    let eventLine = learnerText
      ? 'learner replied; continue toward the current goal'
      : 'conversation started; steer toward the current goal';
    if (learnerText && isLearnerQuestionToCharacter(learnerText)) {
      eventLine =
        'learner asked you a question; answer briefly then steer toward the current goal';
    } else if (session.assisted) {
      eventLine = 'learner used the help chips';
    }

    const openDefs = openGoalsFromSession(session, bank);
    // Teaching mode: only the current goal may complete (bank order, no skips).
    const codeCompleted = learnerText
      ? session.teaching_mode && currentDefEarly
        ? messageCompletesGoal(learnerText, currentDefEarly)
          ? [currentDefEarly.id]
          : []
        : checkGoals(learnerText, openDefs).completedIds
      : [];
    const acceptedFromModel: string[] = [];

    // v4 teaching mode: authored teach → coach → ask (once per goal via teach_shown_for).
    if (shouldShowTeachForGoal(session, currentDefEarly)) {
      if (
        currentDefEarly &&
        emitTeachSequence({
          goal: currentDefEarly,
          session,
          emit,
        })
      ) {
        session.pending_frame = pendingFrameFromGoal(currentDefEarly);
        emitFrameIfAny();
        return finish(true);
      }
    }

    // Teaching: wrong / incomplete → 1st miss: frame + model; 2nd miss: assisted + next.
    if (
      session.teaching_mode &&
      learnerText &&
      currentDefEarly &&
      session.teach_shown_for === currentDefEarly.id &&
      !codeCompleted.includes(currentDefEarly.id)
    ) {
      const turnsBeforeWrong = session.turns_on_goal ?? 0;

      if (turnsBeforeWrong >= 1) {
        // 2nd miss → assisted, then code recast + next teach.
        session.turns_on_goal = turnsBeforeWrong + 1;
        pushExchange(session, 'learner', learnerText);
        session.learner_lines = pushLearnerLine(
          session.learner_lines ?? [],
          learnerText,
        );
        const help = stuckHelpForGoal(currentDefEarly);
        emit({
          type: 'coach',
          id: `goal_steer_give:${currentDefEarly.id}`,
          eg: `قولها كده: ${help.chips[0] ?? help.frame_tl}`,
          moment: 'help',
        });
        applyCompletedGoals(session, bank, [currentDefEarly.id], {
          assisted: true,
        });
        await advanceTeachingAfterGoal(bank, currentDefEarly);
        return finish(true);
      }

      // 1st miss → frame chip, then fall through for one model reply.
      // turns_on_goal bumps later via applyCompletedGoals (empty completedIds).
      const help = stuckHelpForGoal(currentDefEarly);
      emit({
        type: 'coach',
        id: `goal_steer_frame:${currentDefEarly.id}`,
        eg: help.eg,
        moment: 'help',
      });
      session.pending_frame = {
        tl: help.frame_tl,
        eg: help.eg,
        chips: help.chips,
      };
      emitFrameIfAny();
      // Fall through to model (reaction + recast + ask_tl).
    } else if (
      // Teaching: correct answer → code recast + next teach; no model.
      session.teaching_mode &&
      learnerText &&
      currentDefEarly &&
      session.teach_shown_for === currentDefEarly.id &&
      codeCompleted.includes(currentDefEarly.id)
    ) {
      pushExchange(session, 'learner', learnerText);
      session.learner_lines = pushLearnerLine(
        session.learner_lines ?? [],
        learnerText,
      );
      applyCompletedGoals(session, bank, codeCompleted);
      await advanceTeachingAfterGoal(bank, currentDefEarly);
      return finish(true);
    }

    // V5 escalation before the model call (based on prior stuck turns).
    const turnsBefore = session.turns_on_goal ?? 0;
    const steer = steerActionForTurns(turnsBefore, currentDefEarly);
    if (steer.kind === 'coach_frame') {
      const coachId = `goal_steer_frame:${currentDefEarly?.id ?? ''}`;
      if (session.coach_recent_ids.at(-1) !== coachId) {
        session.coach_recent_ids = [
          ...session.coach_recent_ids,
          coachId,
        ].slice(-8);
        emit({
          type: 'coach',
          id: coachId,
          eg: steer.eg,
          moment: 'help',
        });
      }
      session.pending_frame = {
        tl: steer.frame_tl,
        eg: steer.eg,
        chips: steer.chips,
      };
    } else if (steer.kind === 'coach_give_answer' && currentDefEarly) {
      const coachId = `goal_steer_give:${currentDefEarly.id}`;
      if (session.coach_recent_ids.at(-1) !== coachId) {
        session.coach_recent_ids = [
          ...session.coach_recent_ids,
          coachId,
        ].slice(-8);
        emit({
          type: 'coach',
          id: coachId,
          eg: steer.eg,
          moment: 'help',
        });
      }
      applyCompletedGoals(session, bank, [currentDefEarly.id], {
        assisted: true,
      });
      session.coach_phrase = setCoachPhrase(steer.sentence_tl);
      emit({
        type: 'free_frame',
        tl: steer.sentence_tl,
        eg: steer.eg,
        chips: [steer.sentence_tl],
      });
      // Character still replies so the chat continues toward the next goal.
    }

    if (learnerText) {
      const practised = consumeCoachPhraseOnLearnerTurn(
        session.coach_phrase,
        learnerText,
      );
      session.coach_phrase = practised.next;
      if (practised.eventLine) eventLine = practised.eventLine;
      session.off_topic_streak = 0;
      pushExchange(session, 'learner', learnerText);
      session.learner_lines = pushLearnerLine(
        session.learner_lines ?? [],
        learnerText,
      );
      const fact = extractFreeFact({
        learnerText,
        hints: [
          ...(session.pending_frame?.chips ?? []),
          ...session.suggested_words.slice(0, 8),
        ],
      });
      session.facts = pushFreeFact(session.facts, fact);
    }

    const currentDef = bank.goals.find((g) => g.id === session.current_goal);
    const askLines = currentDef
      ? pickGoalAskLines(currentDef)
      : null;
    const currentGoalLine = currentDef
      ? formatCurrentGoalLine({
          intentEn:
            currentDef.intent_en ??
            `get the learner to say: ${currentDef.examples_tl[0] ?? ''}`,
          seedTl: currentDef.seed_tl,
          askTl: askLines?.tl,
          goalId: currentDef.id,
          turnsOnGoal: session.turns_on_goal ?? 0,
          openGoalIds: openGoalsFromSession(session, bank).map((g) => g.id),
        })
      : '(no open goal — keep chatting naturally)';

    const characterId = session.character_id ?? topic.character_id;
    const persona = requirePersona(characterId);
    const topicTitle =
      bank.title_tl?.trim() || topic.title_tl;
    const promptBuilt = buildGoalFreePrompt({
      module: 'free',
      pack: null,
      freeTopicTitle: topicTitle,
      freeTopicPlace: session.scene?.place,
      sceneTimeOfDay: session.scene?.time_of_day,
      sceneAddress: session.scene?.address ?? bank.scene?.address,
      facts: session.facts,
      event: {
        verdict: 'correct',
        item_id: '',
        question_id: session.pending_question?.id ?? '',
        question_kind: 'open',
        phase: session.phase,
      },
      eventLine,
      candidates: [],
      lastExchanges: session.last_exchanges,
      learnerAnswer: learnerText || '(ready)',
      personaJson: JSON.stringify(persona),
      currentGoalLine,
    });
    const { system, prompt } = freePromptPartsToMessages(promptBuilt);
    const allowFormal =
      (session.scene?.address ?? bank.scene?.address) === 'formal';
    const modelOut = await callGoalModel({
      model: input.model,
      system,
      prompt,
      emit,
      knownWords: session.suggested_words,
      allowFormal,
      fallbackAsk: askLines,
    });
    metrics = { ...metrics, ...modelOut.metricsPartial };
    let replyPt = modelOut.pt;
    let replyAr = modelOut.ar;

    // v4 V6 level guard on model replies only — authored ask/teach/closing skip it.
    {
      const authoredAskTl = askLines?.tl?.trim() || '';
      const authoredClosingTl = bank.closing?.tl?.trim() || '';
      const isAuthoredLine =
        (authoredAskTl &&
          (replyPt.trim() === authoredAskTl ||
            replyPt.trim().endsWith(authoredAskTl))) ||
        (authoredClosingTl && replyPt.includes(authoredClosingTl));
      if (!isAuthoredLine) {
        const level = session.learner_level ?? 1;
        const extraAllowed = [
          ...(bank.required_items ?? []),
          ...(bank.new_items_tl ?? []),
          ...bank.goals.flatMap((g) => [
            ...(g.examples_tl ?? []),
            ...(g.keywords ?? []),
            g.ask_tl ?? '',
            g.ask_tl_f ?? '',
            g.teach?.tl ?? '',
            g.teach?.tl_f ?? '',
          ]),
          ...session.suggested_words,
        ];
        let guard = checkReplyLevel({
          text: replyPt,
          level,
          extraAllowed,
        });
        if (!guard.ok && replyPt.trim()) {
          const regenSystem = `${system}\n\nLEVEL GUARD: do not use these words: ${guard.offLevel.join(', ')}. Stay within the learner's level.`;
          const regen = await callGoalModel({
            model: input.model,
            system: regenSystem,
            prompt,
            emit,
            knownWords: session.suggested_words,
            allowFormal,
            fallbackAsk: askLines,
          });
          metrics = { ...metrics, ...regen.metricsPartial };
          replyPt = regen.pt;
          replyAr = regen.ar;
          guard = checkReplyLevel({
            text: replyPt,
            level,
            extraAllowed,
          });
          if (!guard.ok) {
            // Authored ask fallback — skip further level-guard checks.
            const fb = askLines?.tl?.trim() || currentDefEarly?.ask_tl || '';
            if (fb) {
              replyPt = `Ah, ok! ${fb}`;
              replyAr = askLines?.ar || currentDefEarly?.ask_ar || replyAr;
              emit({ type: 'reaction_reset', text: replyPt });
            }
          }
        }
      }
    }

    if (learnerText) {
      acceptedFromModel.push(
        ...acceptModelReportedGoals(
          learnerText,
          modelOut.reported_goal_ids,
          openDefs,
        ),
      );
    }
    let completedIds = [
      ...new Set([...codeCompleted, ...acceptedFromModel]),
    ];
    // Teaching: never complete a non-current goal out of bank order.
    if (session.teaching_mode && session.current_goal) {
      completedIds = completedIds.filter((id) => id === session.current_goal);
    }
    applyCompletedGoals(session, bank, completedIds);

    // v4: core goals done → note + move to extended (no auto next-topic).
    if (
      session.goal_tier === 'core' &&
      allTierDone(session.goals, bank.goals, 'core')
    ) {
      const coachId = 'core_goals_done';
      if (session.coach_recent_ids.at(-1) !== coachId) {
        session.coach_recent_ids = [
          ...session.coach_recent_ids,
          coachId,
        ].slice(-8);
        emit({
          type: 'coach',
          id: coachId,
          eg: CORE_DONE_COACH_EG,
          moment: 'summary',
        });
      }
      session.goal_tier = 'extended';
      const nextExt = bank.goals.find(
        (g) =>
          (g.tier === 'extended') &&
          session.goals.some((s) => s.id === g.id && s.status === 'open'),
      );
      if (nextExt) {
        session.current_goal = nextExt.id;
        session.turns_on_goal = 0;
      } else {
        session.goal_tier = 'free';
      }
    }

    // All goals done → coach note + weak refill; no authored closing (only on خلّص/كفاية).
    if (
      session.goals.length > 0 &&
      session.goals.every((g) => g.status !== 'open')
    ) {
      const coachId = 'goals_done';
      if (session.coach_recent_ids.at(-1) !== coachId) {
        session.coach_recent_ids = [
          ...session.coach_recent_ids,
          coachId,
        ].slice(-8);
        emit({
          type: 'coach',
          id: coachId,
          eg: GOALS_DONE_COACH_EG,
          moment: 'summary',
        });
      }
      session.goal_tier = 'free';
      const weak =
        session.suggested_words.length > 0
          ? session.suggested_words
          : await loadSuggestedSurfacesForUser(session.user_id, 8);
      const refill = refillSessionGoals({
        existingStates: session.goals,
        existingDefs: bank.goals,
        weakSurfaces: weak.length
          ? weak
          : ['esquerda', 'ao lado de', 'em frente'],
        topicSlug: topic.id,
      });
      if (refill.newGoals.length) {
        session.goals = refill.states;
        session.current_goal = refill.current_goal;
        session.turns_on_goal = 0;
        bank.goals.push(...refill.newGoals);
        const next = refill.newGoals.find((g) => g.id === refill.current_goal);
        if (next) {
          session.pending_frame = {
            tl: next.help.frame_tl,
            eg: next.help.eg,
            chips: [...next.help.chips],
          };
          session.pending_question = {
            id: next.id,
            kind: 'open',
            item_id: next.id,
          };
        }
      }
    }

    if (replyPt) {
      pushExchange(session, 'character', replyPt);
      if (learnerText) {
        const pair = maybeRecastPair(learnerText, replyPt);
        if (pair) {
          session.recasts = [...(session.recasts ?? []), pair].slice(-8);
        }
      }
    }

    const lineId = session.current_goal ?? `${topic.id}.goal`;
    emit({
      type: 'bubble_ar',
      ar: replyAr || '',
      pt: replyPt,
    });
    emit({
      type: 'question',
      id: lineId,
      tl: replyPt,
      kind: 'open',
      item_id: lineId,
      audio_key: `free:${topic.id}:${lineId}`,
      ...(modelOut.unknownWords.length
        ? { unknown_words: modelOut.unknownWords }
        : {}),
    });
    if (session.pending_frame) {
      emit({
        type: 'free_frame',
        tl: session.pending_frame.tl,
        eg: session.pending_frame.eg,
        chips: session.pending_frame.chips,
      });
    }
    return finish(true);
  }

  // —— Unlocked fallback: ask for a topic (no open-mode / thread path) ——
  {
    const level = session.learner_level ?? 1;
    emitTopicReask({ kind: 'chips', level });
    return finish(true);
  }
}
