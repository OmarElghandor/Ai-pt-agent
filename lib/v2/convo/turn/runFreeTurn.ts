import { getLangifyUserFirstName } from '@/lib/langifyRead';
import { fillNameSlot } from '@/lib/v2/convo/free';
import {
  buildFreeReactionPrompt,
  buildGoalFreePrompt,
  buildOpenConvoPrompt,
  estimateConvoPromptTokens,
  formatCurrentGoalLine,
  freePromptPartsToMessages,
  pickGoalAskLines,
} from '@/lib/v2/convo/prompt';
import {
  dropFreeConvoReaction,
  parseFreeConvoReaction,
  visibleFreeStreamText,
} from '@/lib/v2/convo/output/parseFree';
import {
  emitVisibleStreamDelta,
  parseOpenConvoTurn,
  visibleOpenStreamText,
} from '@/lib/v2/convo/output/parseOpen';
import {
  parseGoalConvoTurn,
  visibleGoalStreamText,
} from '@/lib/v2/convo/output/parseGoal';
import {
  freeTopicById,
  isOpenTopicId,
  loadThreadTopic,
  requirePersona,
  type FreeTopic,
} from '@/lib/v2/convo/topics';
import type { ConvoSession, ConvoSessionStore } from '@/lib/v2/convo/session';
import { resolveFreeGoalBank } from '@/lib/v2/convo/session/freeInit';
import {
  sessionHasGoals,
  sessionInOpenMode,
} from '@/lib/v2/convo/turn/freeMode';
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
  ensureGeneratedGoalBankMemory,
  extractTopicLabel,
  firstOpenGoalId,
  GOALS_DONE_COACH_EG,
  goalStatesFromBank,
  isStuckHelpRequest,
  loadGoalsForDay,
  loadGoalsForTopic,
  openGoalsFromSession,
  pendingFrameFromGoal,
  refillSessionGoals,
  steerActionForTurns,
  stuckHelpForGoal,
} from '@/lib/v2/convo/goals';
import {
  CORE_DONE_COACH_EG,
  allTierDone,
} from '@/lib/v2/convo/goals/tiers';
import { teachBeatForGoal } from '@/lib/v2/convo/goals/teach';
import { loadSuggestedSurfacesForUser } from '@/lib/v2/convo/session/suggestedWords';
import { getCharacter } from '@/lib/v2/characters/registry';
import {
  appendConvoCorrectionError,
  awaitAndEmitCorrection,
  matchesAcceptedForm,
  shouldFireFreeTextCorrection,
  startFreeTextCorrection,
} from '@/lib/v2/convo/correction';
import type { FreeTextCorrection, FreeTextGrader } from '@/lib/v2/grader';
import {
  classifySideChannel,
  collectFreeContextCandidates,
  logUnmatchedTopicRequestSync,
  matchTopicRequest,
  topicRequestCoachEg,
} from '@/lib/v2/convo/sideChannel';
import {
  advanceAfterAnswer,
  consumeCoachPhraseOnLearnerTurn,
  currentNextLine,
  extractFreeFact,
  handleFreeArabicSide,
  isLearnerQuestionToCharacter,
  isNonLearningRequest,
  NON_LEARNING_COACH_EG,
  pickOpenFallback,
  pushFreeFact,
  setCoachPhrase,
  THREADS_DONE_COACH_EG,
  type FreeNextLine,
} from '@/lib/v2/convo/free';
import { classifyCtaReply } from '@/lib/v2/convo/free/ctaReply';
import {
  maybeRecastPair,
  pushLearnerLine,
} from '@/lib/v2/convo/result/summary';
import {
  learnSuggestCoachEg,
  matchLearnSuggest,
} from '@/lib/v2/convo/free/learnSuggest';
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
  /** Dismiss pending Learn CTA without a transcript line (G4). */
  dismissCta?: boolean;
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

function applyNextLine(session: ConvoSession, next: FreeNextLine): void {
  session.last_line_id = next.line_id;
  session.pending_question = {
    id: next.line_id,
    kind: 'open',
    item_id: next.line_id,
  };
  session.assisted = false;
}

function closeWithFact(
  session: ConvoSession,
  line: FreeNextLine,
  learnerText: string,
): void {
  const hints = [
    ...(line.frame?.chips ?? []),
    ...session.suggested_words.slice(0, 8),
  ];
  const fact = extractFreeFact({ learnerText, hints });
  session.facts = pushFreeFact(session.facts, fact);
}

function learnerAskedQuestion(text: string): boolean {
  const t = text.trim();
  return /\?\s*$/.test(t) || /^e\s+tu\b/i.test(t);
}

async function callFreeModel(opts: {
  model: ConvoStreamModel;
  system: string;
  prompt: string;
  emit: (event: ConvoTurnStreamEvent) => void;
  knownWords?: string[];
  learnerText?: string;
}): Promise<{
  reaction: string;
  reaction_ar: string;
  unknownWords: string[];
  metricsPartial: Pick<
    ConvoTurnMetrics,
    'ttft_ms' | 'input_tokens' | 'cached_input_tokens' | 'output_tokens'
  >;
}> {
  const { model, system, prompt, emit } = opts;
  const asked = learnerAskedQuestion(opts.learnerText ?? '');
  let rawAcc = '';
  let visibleAcc = '';
  const onChunk = (chunk: string) => {
    rawAcc += chunk;
    const nextVisible = visibleFreeStreamText(rawAcc);
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
    maxTokens: 96,
    onChunk,
  });

  let parsed = parseFreeConvoReaction(result.text, {
    knownWords: opts.knownWords,
    learnerAsked: asked,
  });
  if (parsed.decision === 'regenerate' && parsed.regenerateReason) {
    emit({ type: 'reaction_reset', text: '' });
    rawAcc = '';
    visibleAcc = '';
    result = await streamFn({
      system,
      prompt,
      maxTokens: 96,
      regenerateReason: parsed.regenerateReason,
      onChunk,
    });
    parsed = parseFreeConvoReaction(result.text, {
      knownWords: opts.knownWords,
      learnerAsked: asked,
    });
    if (parsed.decision === 'regenerate') {
      emit({ type: 'reaction_reset', text: '' });
      parsed = dropFreeConvoReaction(parsed);
    }
  }

  const inputTokens =
    result.usage?.inputTokens ??
    estimateConvoPromptTokens(`${system}\n${prompt}`);
  // Cached tokens only from the provider; otherwise n/a (null).
  const cachedInputTokens =
    typeof result.usage?.cachedInputTokens === 'number'
      ? result.usage.cachedInputTokens
      : null;
  const outputTokens =
    result.usage?.outputTokens ?? estimateConvoPromptTokens(result.text);

  return {
    reaction: parsed.decision === 'drop' ? '' : parsed.reaction,
    reaction_ar: parsed.decision === 'drop' ? '' : parsed.reaction_ar,
    unknownWords: parsed.unknownWords,
    metricsPartial: {
      ttft_ms: result.ttftMs,
      input_tokens: inputTokens,
      cached_input_tokens: cachedInputTokens,
      output_tokens: outputTokens,
    },
  };
}

async function callOpenModel(opts: {
  model: ConvoStreamModel;
  system: string;
  prompt: string;
  emit: (event: ConvoTurnStreamEvent) => void;
  knownWords?: string[];
  fallbackIndex?: number;
}): Promise<{
  pt: string;
  ar: string;
  frame_tl: string;
  hint_eg: string;
  chips: string[];
  unknownWords: string[];
  usedFallback: boolean;
  metricsPartial: Pick<
    ConvoTurnMetrics,
    'ttft_ms' | 'input_tokens' | 'cached_input_tokens' | 'output_tokens'
  >;
}> {
  const { model, system, prompt, emit } = opts;
  let rawAcc = '';
  let visibleAcc = '';
  const onChunk = (chunk: string) => {
    rawAcc += chunk;
    const nextVisible = visibleOpenStreamText(rawAcc);
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
    maxTokens: 220,
    onChunk,
  });

  let parsed = parseOpenConvoTurn(result.text, {
    knownWords: opts.knownWords,
  });
  if (parsed.decision === 'regenerate' && parsed.regenerateReason) {
    emit({ type: 'reaction_reset', text: '' });
    rawAcc = '';
    visibleAcc = '';
    result = await streamFn({
      system,
      prompt,
      maxTokens: 220,
      regenerateReason: parsed.regenerateReason,
      onChunk,
    });
    parsed = parseOpenConvoTurn(result.text, {
      knownWords: opts.knownWords,
    });
  }

  let usedFallback = false;
  if (parsed.decision !== 'ok') {
    emit({ type: 'reaction_reset', text: '' });
    usedFallback = true;
    const fb = pickOpenFallback(opts.fallbackIndex ?? 0);
    const stem = parsed.ptWithoutQuestion || parsed.pt || 'Hmm.';
    parsed = {
      ...parsed,
      pt: `${stem} ${fb.tl}`.replace(/\s+/g, ' ').trim(),
      ar: parsed.ar || fb.ar,
      frame_tl: fb.frame.tl,
      hint_eg: fb.frame.eg,
      chips: fb.frame.chips,
      decision: 'ok',
      issues: [],
    };
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

  return {
    pt: parsed.pt,
    ar: parsed.ar,
    frame_tl: parsed.frame_tl,
    hint_eg: parsed.hint_eg,
    chips: parsed.chips,
    unknownWords: parsed.unknownWords,
    usedFallback,
    metricsPartial: {
      ttft_ms: result.ttftMs,
      input_tokens: inputTokens,
      cached_input_tokens: cachedInputTokens,
      output_tokens: outputTokens,
    },
  };
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
 * One Module C free-chat turn (v3 goals, or legacy threads / open mode).
 */
export async function runFreeConvoTurn(
  input: RunFreeConvoTurnInput,
): Promise<{ session: ConvoSession; metrics: ConvoTurnMetrics }> {
  const started = Date.now();
  let session = structuredClone(input.session);
  const topicId = session.topic_id;
  if (!topicId) throw new Error('free session missing topic_id');

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
  const inOpenMode = sessionInOpenMode(session, topic);
  const threadDoc =
    inOpenMode || hasGoals ? null : loadThreadTopic(topic.id);

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

  const finish = async (ok: boolean, error?: string) => {
    if (correctionJob) {
      const job = correctionJob;
      correctionJob = null;
      const corr = await awaitAndEmitCorrection({
        promise: job.promise,
        learner_turn_id: job.learner_turn_id,
        original: job.original,
        emit,
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
    }
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

  // G4: dedicated dismiss — no transcript line.
  if (input.dismissCta) {
    session.pending_cta = null;
    session.learn_suggest_done = true;
    emit({ type: 'cta_dismissed' });
    return finish(true);
  }

  // G4: pending CTA expires after this message, whatever it is.
  if (session.pending_cta) {
    const cta = session.pending_cta;
    session.pending_cta = null;
    const kind = classifyCtaReply(input.learnerText);
    if (kind === 'yes') {
      emit({ type: 'cta_navigate', href: cta.href });
      return finish(true);
    }
    if (kind === 'no') {
      emit({ type: 'cta_dismissed' });
      return finish(true);
    }
    // Any other message: CTA consumed; continue normal path below.
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

  const sideKind = classifySideChannel(input.learnerText);
  if (sideKind === 'topic_request') {
    // Batch 10 D8: practice stays free — soft Learn CTA only, no forced pack jump.
    const matched = matchTopicRequest(input.learnerText);
    const coach = topicRequestCoachEg(matched);
    if (matched) {
      const href =
        coach.href ?? `/talk/${encodeURIComponent(matched.pack_id)}`;
      emit({
        type: 'coach',
        id: 'free_topic_request',
        eg: learnSuggestCoachEg(matched.title_ar),
        moment: 'learn_suggest',
      });
      emit({
        type: 'cta',
        id: `learn_cta:${matched.pack_id}`,
        label_eg: 'يلا نتعلّم',
        href,
        dismiss_eg: 'لأ، نكمّل',
      });
      session.pending_cta = { href, pack_id: matched.pack_id };
      session.learn_suggest_done = true;
    } else {
      logUnmatchedTopicRequestSync({
        userId: session.user_id,
        queryEg: input.learnerText.trim(),
      });
      emit({
        type: 'coach',
        id: 'free_topic_request_unmatched',
        eg: coach.eg,
        moment: 'topic_request',
      });
    }
    return finish(true);
  }
  const pendingLine =
    inOpenMode || hasGoals
      ? {
          line_id: session.current_goal ?? `${topic.id}.open`,
          tl: '',
          ar: '',
          bubble_tl: '',
          bubble_ar: '',
          frame: session.pending_frame ?? undefined,
        }
      : currentNextLine(
          threadDoc!,
          session.thread_index,
          session.free_step,
          topic,
        );

  if (
    sideKind === 'arabic_answer' ||
    sideKind === 'other' ||
    sideKind === 'language_question'
  ) {
    const frame = session.pending_frame ?? pendingLine.frame;
    const thread =
      threadDoc && session.thread_index != null
        ? threadDoc.threads[session.thread_index]
        : null;
    const arByTl = new Map<string, string>();
    if (threadDoc) {
      for (const th of threadDoc.threads) {
        arByTl.set(th.share.tl.replace(/\s+/g, ' ').trim(), th.share.ar);
        arByTl.set(th.ask.tl.replace(/\s+/g, ' ').trim(), th.ask.ar);
        for (const fu of th.follow_ups) {
          arByTl.set(fu.tl.replace(/\s+/g, ' ').trim(), fu.ar);
        }
      }
    }
    const recentCharacterTls = session.last_exchanges
      .filter((e) => e.role === 'character')
      .slice(-3)
      .map((e) => e.tl);
    const candidates = collectFreeContextCandidates({
      share: thread?.share ?? null,
      ask: thread?.ask ?? null,
      followUps: thread?.follow_ups ?? [],
      frame: frame ?? null,
      recentCharacterTls,
      arByTl,
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

    // D8: after 3 language Qs on the same item group → one Learn suggestion.
    if (
      sideKind === 'language_question' &&
      !session.learn_suggest_done
    ) {
      const hit = await matchLearnSuggest(
        input.learnerText.trim(),
        session.topic_id,
      );
      if (hit) {
        if (session.learn_suggest_group === hit.groupKey) {
          session.learn_suggest_count =
            (session.learn_suggest_count ?? 0) + 1;
        } else {
          session.learn_suggest_group = hit.groupKey;
          session.learn_suggest_count = 1;
        }
        if (session.learn_suggest_count >= 3) {
          session.learn_suggest_done = true;
          session.coach_recent_ids = [
            ...session.coach_recent_ids,
            'learn_suggest',
          ].slice(-8);
          emit({
            type: 'coach',
            id: 'learn_suggest',
            eg: learnSuggestCoachEg(hit.topicTitleAr),
            moment: 'learn_suggest',
          });
          emit({
            type: 'cta',
            id: `learn_cta:${hit.packId}`,
            label_eg: 'يلا نتعلّم',
            href: hit.talkHref,
            dismiss_eg: 'لأ، نكمّل',
          });
          session.pending_cta = {
            href: hit.talkHref,
            pack_id: hit.packId,
          };
        }
      }
    }
    return finish(true);
  }

  // Learner dismissed Learn suggestion («لأ») — no more this session.
  if (
    !session.learn_suggest_done &&
    /^(لأ|لا|no|nao|não)\b/i.test(input.learnerText.trim())
  ) {
    if (session.coach_recent_ids.includes('learn_suggest')) {
      session.learn_suggest_done = true;
    }
  }

  const learnerText = input.learnerText.trim();
  if (input.assisted) {
    session.assisted = true;
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

  // —— v4 exit: خلّص / كفاية ——
  if (hasGoals && learnerText && isLearnerExitRequest(learnerText)) {
    const bank = resolveFreeGoalBank({
      topic,
      lessonDay: session.lesson_day,
      timeOfDay: session.scene?.time_of_day,
    });
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

  // —— v4 router: unlocked one-chat (greetings + topic-naming only) ——
  if (
    !session.topic_locked &&
    !hasGoals &&
    (isOpenTopicId(topic.id) || session.free_step.kind === 'open') &&
    learnerText &&
    (isGreetingOrSmallTalk(learnerText) ||
      isExplicitTopicRequest(learnerText))
  ) {
    const level = session.learner_level ?? 1;
    const decision = await routeTopic({
      message: learnerText,
      level,
    });

    if (decision.kind === 'greeting' || decision.kind === 'chips') {
      const frame = oneChatOpeningFrame(level);
      const replyTl =
        decision.kind === 'greeting'
          ? 'Olá! 😊 Sobre o que queres falar hoje?'
          : 'Sobre o que queres falar? Escolhe um tema.';
      const replyAr =
        decision.kind === 'greeting'
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
      if (decision.kind === 'greeting') {
        emit({
          type: 'coach',
          id: 'topic_reask',
          eg: 'قول عايز تتكلم عن إيه — أو دوس موضوع من تحت',
          moment: 'nudge',
        });
      }
      session.pending_frame = frame;
      session.last_exchanges = [
        ...session.last_exchanges,
        { role: 'learner', tl: learnerText },
        { role: 'character', tl: replyTl },
      ].slice(-6);
      return finish(true);
    }

    // Lock topic and load goals, then fall through to goal path.
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
    session.goals = goalStatesFromBank(bank);
    session.current_goal = firstOpenGoalId(session.goals);
    session.turns_on_goal = 0;
    session.scene = bank.scene ?? session.scene;
    session.suggested_words = bank.suggested_words?.length
      ? bank.suggested_words
      : session.suggested_words;
    const currentDef = bank.goals.find((g) => g.id === session.current_goal);
    if (currentDef) {
      session.pending_frame = pendingFrameFromGoal(currentDef);
    }
  }

  const hasGoalsNow = sessionHasGoals(session);

  // —— v3 goal-directed free talk ——
  if (hasGoalsNow) {
    const bank = resolveFreeGoalBank({
      topic,
      lessonDay: session.lesson_day,
      timeOfDay: session.scene?.time_of_day,
    });
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
    const codeCompleted = learnerText
      ? checkGoals(learnerText, openDefs).completedIds
      : [];
    const acceptedFromModel: string[] = [];

    // v4 teaching mode: authored teach → coach → ask (once per goal).
    if (
      session.teaching_mode &&
      currentDefEarly &&
      (session.turns_on_goal ?? 0) === 0 &&
      !learnerText
    ) {
      const beat = teachBeatForGoal(currentDefEarly);
      if (beat) {
        emit({
          type: 'bubble_ar',
          ar: beat.character_ar,
          pt: beat.character_tl,
        });
        emit({
          type: 'coach',
          id: `teach:${currentDefEarly.id}`,
          eg: beat.coach_eg,
          moment: 'intro',
        });
        emit({
          type: 'question',
          id: currentDefEarly.id,
          tl: beat.ask_tl,
          ar: beat.ask_ar || undefined,
          kind: 'open',
          item_id: currentDefEarly.id,
          audio_key: `free:${session.id}:${currentDefEarly.id}`,
        });
        session.pending_frame = pendingFrameFromGoal(currentDefEarly);
        session.pending_question = {
          id: currentDefEarly.id,
          kind: 'open',
          item_id: currentDefEarly.id,
        };
        session.last_exchanges = [
          ...session.last_exchanges,
          { role: 'character', tl: `${beat.character_tl} ${beat.ask_tl}`.trim() },
        ].slice(-6);
        return finish(true);
      }
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

    if (learnerText) {
      acceptedFromModel.push(
        ...acceptModelReportedGoals(
          learnerText,
          modelOut.reported_goal_ids,
          openDefs,
        ),
      );
    }
    const completedIds = [
      ...new Set([...codeCompleted, ...acceptedFromModel]),
    ];
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

    // V6: all goals done → closing line (F4) + coach note + refill; chat continues.
    if (
      session.goals.length > 0 &&
      session.goals.every((g) => g.status !== 'open')
    ) {
      if (bank.closing?.tl?.trim()) {
        const learnerName = await getLangifyUserFirstName(session.user_id);
        replyPt = fillNameSlot(bank.closing.tl, learnerName);
        replyAr = fillNameSlot(bank.closing.ar ?? '', learnerName);
        emit({ type: 'reaction_reset', text: replyPt });
      }
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
          : ['Tudo bem.', 'Obrigado.', 'Até logo.'],
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

  // —— Open mode (أي حاجة / after threads) ——
  if (inOpenMode) {
    session.free_step = { kind: 'open' };

    // V7: «Quero falar de carros» → generate/cache goals, then continue as goal talk.
    if (learnerText && isOpenTopicId(topic.id)) {
      const label = extractTopicLabel(learnerText);
      if (label) {
        const { bank: genBank } = await ensureGeneratedGoalBankMemory({
          topicLabel: label,
        });
        session.goals = goalStatesFromBank(genBank);
        session.current_goal = firstOpenGoalId(session.goals);
        session.turns_on_goal = 0;
        session.scene = genBank.scene ?? session.scene;
        const cur = genBank.goals.find((g) => g.id === session.current_goal);
        session.pending_frame = pendingFrameFromGoal(cur);
        if (session.current_goal) {
          session.pending_question = {
            id: session.current_goal,
            kind: 'open',
            item_id: session.current_goal,
          };
        }
        pushExchange(session, 'learner', learnerText);
        session.learner_lines = pushLearnerLine(
          session.learner_lines ?? [],
          learnerText,
        );
        // Hand off into the goal path on the next turn; this turn: short ack question.
        const characterId = session.character_id ?? topic.character_id;
        const persona = requirePersona(characterId);
        const promptBuilt = buildGoalFreePrompt({
          module: 'free',
          pack: null,
          freeTopicTitle: label,
          facts: session.facts,
          event: {
            verdict: 'correct',
            item_id: '',
            question_id: session.pending_question?.id ?? '',
            question_kind: 'open',
            phase: session.phase,
          },
          eventLine: `learner chose topic: ${label}; start steering toward the first goal`,
          candidates: [],
          lastExchanges: session.last_exchanges,
          learnerAnswer: learnerText,
          personaJson: JSON.stringify(persona),
          currentGoalLine: cur
            ? formatCurrentGoalLine({
                intentEn: cur.intent_en ?? cur.examples_tl[0] ?? label,
                seedTl: cur.seed_tl,
                goalId: cur.id,
                turnsOnGoal: 0,
                openGoalIds: genBank.goals.map((g) => g.id),
              })
            : label,
        });
        const { system, prompt } = freePromptPartsToMessages(promptBuilt);
        const modelOut = await callGoalModel({
          model: input.model,
          system,
          prompt,
          emit,
          knownWords: session.suggested_words,
        });
        metrics = { ...metrics, ...modelOut.metricsPartial };
        if (modelOut.pt) pushExchange(session, 'character', modelOut.pt);
        emit({
          type: 'bubble_ar',
          ar: modelOut.ar || '',
          pt: modelOut.pt,
        });
        emit({
          type: 'question',
          id: session.current_goal ?? 'open.topic',
          tl: modelOut.pt,
          kind: 'open',
          item_id: session.current_goal ?? 'open.topic',
          audio_key: `free:open:${session.current_goal ?? 'topic'}`,
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
    }

    let eventLine = learnerText
      ? 'learner replied; continue the open chat'
      : 'conversation started; ask about anything';
    if (learnerText && isLearnerQuestionToCharacter(learnerText)) {
      eventLine = 'learner asked you a question; answer briefly then ask one open question';
    } else if (session.assisted) {
      eventLine = 'learner used the help chips';
    }
    if (learnerText) {
      const practised = consumeCoachPhraseOnLearnerTurn(
        session.coach_phrase,
        learnerText,
      );
      session.coach_phrase = practised.next;
      if (practised.eventLine) eventLine = practised.eventLine;
      pushExchange(session, 'learner', learnerText);
      session.learner_lines = pushLearnerLine(
        session.learner_lines ?? [],
        learnerText,
      );
      const fact = extractFreeFact({
        learnerText,
        hints: session.suggested_words.slice(0, 8),
      });
      session.facts = pushFreeFact(session.facts, fact);
    }

    const characterId = session.character_id ?? topic.character_id;
    const persona = requirePersona(characterId);
    const topicTitle = isOpenTopicId(topic.id)
      ? 'open chat'
      : topic.title_tl;
    const promptBuilt = buildOpenConvoPrompt({
      module: 'free',
      pack: null,
      freeTopicTitle: topicTitle,
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
      nextLineTl: '',
    });
    const { system, prompt } = freePromptPartsToMessages(promptBuilt);
    const modelOut = await callOpenModel({
      model: input.model,
      system,
      prompt,
      emit,
      knownWords: session.suggested_words,
      fallbackIndex: session.threads_done.length + session.last_exchanges.length,
    });
    session.open_turns = (session.open_turns ?? 0) + 1;
    if (modelOut.usedFallback) {
      session.open_fallbacks = (session.open_fallbacks ?? 0) + 1;
    }
    metrics = {
      ...metrics,
      ...modelOut.metricsPartial,
      open_used_fallback: modelOut.usedFallback,
      open_turns: session.open_turns,
      open_fallbacks: session.open_fallbacks ?? 0,
    };

    if (modelOut.pt) {
      pushExchange(session, 'character', modelOut.pt);
      if (learnerText) {
        const pair = maybeRecastPair(learnerText, modelOut.pt);
        if (pair) {
          session.recasts = [...(session.recasts ?? []), pair].slice(-8);
        }
      }
    }
    const lineId = `${topic.id}.open.${Date.now()}`;
    session.last_line_id = lineId;
    session.pending_question = {
      id: lineId,
      kind: 'open',
      item_id: lineId,
    };
    session.assisted = false;
    // Chips stay on pending_frame only — do not merge into suggested_words (E4).
    session.pending_frame = {
      tl: modelOut.frame_tl,
      eg: modelOut.hint_eg,
      chips: [...modelOut.chips],
    };

    emit({
      type: 'bubble_ar',
      ar: modelOut.ar || '',
      pt: modelOut.pt,
    });
    emit({
      type: 'question',
      id: lineId,
      tl: modelOut.pt,
      kind: 'open',
      item_id: lineId,
      audio_key: `free:${topic.id}:${lineId}`,
      ...(modelOut.unknownWords.length
        ? { unknown_words: modelOut.unknownWords }
        : {}),
    });
    emit({
      type: 'free_frame',
      tl: modelOut.frame_tl,
      eg: modelOut.hint_eg,
      chips: modelOut.chips,
    });
    return finish(true);
  }

  const current = currentNextLine(
    threadDoc!,
    session.thread_index,
    session.free_step,
    topic,
  );

  // If this answer finishes the last thread, hand off to open mode now.
  if (learnerText) {
    const preview = advanceAfterAnswer({
      doc: threadDoc!,
      topic,
      thread_index: session.thread_index,
      step: session.free_step,
      threads_done: session.threads_done,
      learnerText,
    });
    if (preview.step.kind === 'open') {
      closeWithFact(session, current, learnerText);
      session.thread_index = preview.thread_index;
      session.free_step = { kind: 'open' };
      session.threads_done = preview.threads_done;
      applyNextLine(session, preview.next);
      if (!session.coach_recent_ids.includes('threads_done_open')) {
        session.coach_recent_ids = [
          ...session.coach_recent_ids,
          'threads_done_open',
        ].slice(-8);
        emit({
          type: 'coach',
          id: 'threads_done_open',
          eg: THREADS_DONE_COACH_EG,
          moment: 'threads_done_open',
        });
      }
      pushExchange(session, 'learner', learnerText);
      let eventLine = 'learner finished the topic threads; continue in open chat';
      if (isLearnerQuestionToCharacter(learnerText)) {
        eventLine =
          'learner asked you a question; answer briefly then ask one open question';
      }
      const practisedOpen = consumeCoachPhraseOnLearnerTurn(
        session.coach_phrase,
        learnerText,
      );
      session.coach_phrase = practisedOpen.next;
      if (practisedOpen.eventLine) eventLine = practisedOpen.eventLine;
      const characterId = session.character_id ?? topic.character_id;
      const persona = requirePersona(characterId);
      const promptBuilt = buildOpenConvoPrompt({
        module: 'free',
        pack: null,
        freeTopicTitle: topic.title_tl,
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
        learnerAnswer: learnerText,
        personaJson: JSON.stringify(persona),
        nextLineTl: '',
      });
      const { system, prompt } = freePromptPartsToMessages(promptBuilt);
      const modelOut = await callOpenModel({
        model: input.model,
        system,
        prompt,
        emit,
        knownWords: session.suggested_words,
        fallbackIndex: session.threads_done.length,
      });
      session.open_turns = (session.open_turns ?? 0) + 1;
      if (modelOut.usedFallback) {
        session.open_fallbacks = (session.open_fallbacks ?? 0) + 1;
      }
      metrics = {
        ...metrics,
        ...modelOut.metricsPartial,
        open_used_fallback: modelOut.usedFallback,
        open_turns: session.open_turns,
        open_fallbacks: session.open_fallbacks ?? 0,
      };
      if (modelOut.pt) pushExchange(session, 'character', modelOut.pt);
      const lineId = `${topic.id}.open.${Date.now()}`;
      session.last_line_id = lineId;
      session.pending_question = {
        id: lineId,
        kind: 'open',
        item_id: lineId,
      };
      session.assisted = false;
      session.pending_frame = {
        tl: modelOut.frame_tl,
        eg: modelOut.hint_eg,
        chips: [...modelOut.chips],
      };
      emit({
        type: 'bubble_ar',
        ar: modelOut.ar || '',
        pt: modelOut.pt,
      });
      emit({
        type: 'question',
        id: lineId,
        tl: modelOut.pt,
        kind: 'open',
        item_id: lineId,
        audio_key: `free:${topic.id}:${lineId}`,
        ...(modelOut.unknownWords.length
          ? { unknown_words: modelOut.unknownWords }
          : {}),
      });
      emit({
        type: 'free_frame',
        tl: modelOut.frame_tl,
        eg: modelOut.hint_eg,
        chips: modelOut.chips,
      });
      return finish(true);
    }
  }

  let eventLine = learnerText
    ? 'learner replied; continue the free chat'
    : 'conversation started; ask about the topic';

  if (learnerText && isLearnerQuestionToCharacter(learnerText)) {
    eventLine = 'learner asked you a question';
  } else if (session.assisted) {
    eventLine = 'learner used the help chips';
  }

  if (learnerText) {
    const practised = consumeCoachPhraseOnLearnerTurn(
      session.coach_phrase,
      learnerText,
    );
    session.coach_phrase = practised.next;
    if (practised.eventLine) eventLine = practised.eventLine;
    // Batch 10 D3: no topic policing — always continue on the same topic.
    session.off_topic_streak = 0;
    pushExchange(session, 'learner', learnerText);
    session.learner_lines = pushLearnerLine(
      session.learner_lines ?? [],
      learnerText,
    );
  }

  // Preview the authored next line for NEXT LINE (after this answer).
  let nextLinePreview = current.bubble_tl;
  if (learnerText) {
    const preview = advanceAfterAnswer({
      doc: threadDoc!,
      topic,
      thread_index: session.thread_index,
      step: session.free_step,
      threads_done: session.threads_done,
      learnerText,
    });
    nextLinePreview = preview.next.bubble_tl;
  }

  const persona = requirePersona(topic.character_id);
  const promptBuilt = buildFreeReactionPrompt({
    module: 'free',
    pack: null,
    freeTopicTitle: topic.title_tl,
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
    nextLineTl: nextLinePreview,
  });

  const { system, prompt } = freePromptPartsToMessages(promptBuilt);

  const modelOut = await callFreeModel({
    model: input.model,
    system,
    prompt,
    emit,
    knownWords: session.suggested_words,
    learnerText,
  });
  metrics = { ...metrics, ...modelOut.metricsPartial };

  if (modelOut.reaction) {
    pushExchange(session, 'character', modelOut.reaction);
    if (learnerText) {
      const pair = maybeRecastPair(learnerText, modelOut.reaction);
      if (pair) {
        session.recasts = [...(session.recasts ?? []), pair].slice(-8);
      }
    }
  }

  let nextLine: FreeNextLine;
  if (learnerText) {
    closeWithFact(session, current, learnerText);
    const advanced = advanceAfterAnswer({
      doc: threadDoc!,
      topic,
      thread_index: session.thread_index,
      step: session.free_step,
      threads_done: session.threads_done,
      learnerText,
    });
    session.thread_index = advanced.thread_index;
    session.free_step = advanced.step;
    session.threads_done = advanced.threads_done;
    nextLine = advanced.next;
    applyNextLine(session, nextLine);
  } else {
    nextLine = current;
    applyNextLine(session, nextLine);
  }

  const authoredTl = nextLine.bubble_tl || nextLine.tl;
  const authoredAr = nextLine.bubble_ar || nextLine.ar;
  const characterExchange = [modelOut.reaction, authoredTl]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (authoredTl) {
    // One character exchange per turn = reaction + next line
    if (modelOut.reaction) {
      // Replace the reaction-only exchange with the combined line.
      const withoutLast = session.last_exchanges.slice(0, -1);
      session.last_exchanges = [
        ...withoutLast,
        { role: 'character', tl: characterExchange },
      ].slice(-3);
    } else {
      pushExchange(session, 'character', authoredTl);
    }
  }

  if (authoredTl) {
    emit({
      type: 'authored_append',
      tl: authoredTl,
      audio_key: `free:${topic.id}:${nextLine.line_id}`,
    });
  }

  const bubbleAr = [modelOut.reaction_ar, authoredAr]
    .filter(Boolean)
    .join(' ')
    .trim();
  emit({
    type: 'bubble_ar',
    ar: bubbleAr,
    pt: characterExchange || authoredTl,
  });

  // Keep a question event for older clients / tests that look for it.
  emit({
    type: 'question',
    id: nextLine.line_id,
    tl: authoredTl,
    kind: 'open',
    item_id: nextLine.line_id,
    audio_key: `free:${topic.id}:${nextLine.line_id}`,
    ...(modelOut.unknownWords.length
      ? { unknown_words: modelOut.unknownWords }
      : {}),
  });

  if (nextLine.frame) {
    session.pending_frame = {
      tl: nextLine.frame.tl,
      eg: nextLine.frame.eg,
      chips: [...nextLine.frame.chips],
    };
    emit({
      type: 'free_frame',
      tl: nextLine.frame.tl,
      eg: nextLine.frame.eg,
      chips: nextLine.frame.chips,
    });
  }

  return finish(true);
}
