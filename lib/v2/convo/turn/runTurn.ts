import type { ConvoItemSurface, ConvoPackData } from '@/lib/v2/convo/pack';
import { surfaceTlFor } from '@/lib/v2/convo/pack';
import { gradeConvoAnswer } from '@/lib/v2/convo/grade';
import {
  applyConvoGrade,
  formatConvoEventLine,
  type CoachMoment,
  type ConvoEventFacts,
} from '@/lib/v2/convo/ladder';
import { pickCoachLine } from '@/lib/v2/convo/encouragement';
import { selectConvoCandidates } from '@/lib/v2/convo/select';
import { buildConvoPrompt, estimateConvoPromptTokens } from '@/lib/v2/convo/prompt';
import {
  consumeConvoTag,
  dropConvoReaction,
  parseConvoReaction,
} from '@/lib/v2/convo/output';
import type { ConvoSession, ConvoSessionStore } from '@/lib/v2/convo/session';
import {
  mirrorConvoProgress,
  type ConvoProgressWriter,
} from '@/lib/v2/convo/progress';
import { deriveWrongWay } from '@/lib/v2/convo/visual';
import {
  classifySideChannel,
  handleArabicAnswer,
  handleLanguageQuestionCoachCall,
  handleLanguageQuestionFromPack,
  type ConvoCoachCaller,
} from '@/lib/v2/convo/sideChannel';
import { convoQuestionAudioKey } from './audioKey';
import {
  findPackQuestion,
  resolveCandidateQuestion,
  resolveHelpQuestion,
} from './resolveQuestion';
import type {
  ConvoStreamModel,
  ConvoTurnMetrics,
  ConvoTurnStreamEvent,
  ResolvedConvoQuestion,
} from './types';

export type ConvoSurvivalAction = 'repeat' | 'slow' | 'nao_percebi';

export type RunConvoTurnInput = {
  session: ConvoSession;
  pack: ConvoPackData;
  surfaces: ConvoItemSurface[];
  learnerText: string;
  store: ConvoSessionStore;
  model: ConvoStreamModel;
  /** Emit NDJSON events as they become ready. */
  emit: (event: ConvoTurnStreamEvent) => void;
  /** Optional progress mirror (T1.12). */
  progressWriter?: ConvoProgressWriter;
  /**
   * Survival buttons (09 §10): replay / slower / simpler re-ask.
   * No model call; counts as used on the session.
   */
  survival?: ConvoSurvivalAction;
  /** Injectable Arabic coach caller (T3.3); defaults to live model. */
  coachCaller?: ConvoCoachCaller;
};

function findOpenHelpReask(
  pack: ConvoPackData,
  questionId: string,
  itemId: string,
): string | null {
  const bank = pack.items[itemId];
  const open = bank?.open_questions.find((q) => q.id === questionId);
  return open?.help_ladder?.step1_reask_tl ?? null;
}

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

function promptPartsToMessages(assembledParts: {
  parts: Array<{ index: number; text: string; cache: boolean }>;
}): { system: string; prompt: string } {
  const cached = assembledParts.parts
    .filter((p) => p.cache)
    .map((p) => p.text)
    .join('\n\n');
  const dynamic = assembledParts.parts
    .filter((p) => !p.cache)
    .map((p) => `### ${p.index}\n${p.text}`)
    .join('\n\n');
  return { system: cached, prompt: dynamic };
}

async function callModel(opts: {
  model: ConvoStreamModel;
  system: string;
  prompt: string;
  candidateIds: string[];
  emit: (event: ConvoTurnStreamEvent) => void;
  regenerateReason?: string;
}): Promise<{
  reaction: string;
  candidateId: string;
  unknownWords: string[];
  metricsPartial: Pick<
    ConvoTurnMetrics,
    'ttft_ms' | 'input_tokens' | 'cached_input_tokens' | 'output_tokens'
  >;
  dropped: boolean;
}> {
  const { model, system, prompt, candidateIds, emit } = opts;
  let buffer = '';
  let tagDone = false;
  let lastEmittedReaction = '';
  let chosenId = candidateIds[0] ?? '';

  const onChunk = (chunk: string) => {
    buffer += chunk;
    const consumed = consumeConvoTag(buffer, candidateIds);
    if (consumed.complete && !tagDone) {
      tagDone = true;
      if (consumed.tag) chosenId = consumed.tag;
    }
    if (consumed.complete && consumed.rest.length > lastEmittedReaction.length) {
      const delta = consumed.rest.slice(lastEmittedReaction.length);
      lastEmittedReaction = consumed.rest;
      if (delta) emit({ type: 'reaction_delta', text: delta });
    }
  };

  const streamFn = model.stream?.bind(model) ?? model.complete.bind(model);
  let result = await streamFn({
    system,
    prompt,
    maxTokens: 48,
    regenerateReason: opts.regenerateReason,
    onChunk,
  });

  let parsed = parseConvoReaction(result.text, candidateIds);
  if (parsed.decision === 'regenerate' && parsed.regenerateReason) {
    buffer = '';
    tagDone = false;
    lastEmittedReaction = '';
    result = await streamFn({
      system,
      prompt,
      maxTokens: 48,
      regenerateReason: parsed.regenerateReason,
      onChunk,
    });
    parsed = parseConvoReaction(result.text, candidateIds);
    if (parsed.decision === 'regenerate') {
      parsed = dropConvoReaction(parsed);
    }
  }

  // If streaming already emitted partial reaction that was later stripped/dropped,
  // emit a final correction delta when dropped (empty) — client replaces on question.
  if (parsed.decision === 'drop' && lastEmittedReaction) {
    emit({ type: 'reaction_delta', text: '' });
  } else if (
    parsed.reaction &&
    parsed.reaction !== lastEmittedReaction &&
    !lastEmittedReaction
  ) {
    emit({ type: 'reaction_delta', text: parsed.reaction });
  }

  const inputTokens =
    result.usage?.inputTokens ??
    estimateConvoPromptTokens(`${system}\n${prompt}`);
  const cachedInputTokens =
    result.usage?.cachedInputTokens ?? estimateConvoPromptTokens(system);
  const outputTokens =
    result.usage?.outputTokens ?? estimateConvoPromptTokens(result.text);

  return {
    reaction: parsed.decision === 'drop' ? '' : parsed.reaction,
    candidateId: parsed.candidateId || chosenId,
    unknownWords: parsed.unknownWords,
    dropped: parsed.decision === 'drop',
    metricsPartial: {
      ttft_ms: result.ttftMs,
      input_tokens: inputTokens,
      cached_input_tokens: cachedInputTokens,
      output_tokens: outputTokens,
    },
  };
}

/**
 * Run one conversation turn (09 §4.2).
 * Side channel (Arabic) runs before grading; Arabic never enters exchanges.
 * Emits NDJSON events via `emit` in order: coach → reaction → question → session → done.
 */
export async function runConvoTurn(
  input: RunConvoTurnInput,
): Promise<{ session: ConvoSession; metrics: ConvoTurnMetrics }> {
  const started = Date.now();
  const { pack, surfaces, store, model, emit, progressWriter } = input;
  let session = structuredClone(input.session);
  if (session.survival_used == null) session.survival_used = 0;
  const beforeRungs = { ...session.rungs };
  const learnerText = input.learnerText ?? '';

  let metrics: ConvoTurnMetrics = {
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    ttft_ms: 0,
    total_ms: 0,
  };

  const finish = async (ok: boolean, error?: string) => {
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
        survival_used: session.survival_used ?? 0,
      },
    });
    await store.save(session);
    if (ok && progressWriter) {
      try {
        await mirrorConvoProgress({
          session,
          day: pack.day,
          beforeRungs,
          afterRungs: session.rungs,
          write: progressWriter,
        });
      } catch (err) {
        // Progress failures must not break the turn stream.
        console.error('[convo] progress mirror failed', err);
      }
    }
    emit({
      type: 'metrics',
      input_tokens: metrics.input_tokens,
      cached_input_tokens: metrics.cached_input_tokens,
      output_tokens: metrics.output_tokens,
      ttft_ms: metrics.ttft_ms,
      total_ms: metrics.total_ms,
    });
    emit({ type: 'done', ok, ...(error ? { error } : {}) });
    return { session, metrics };
  };

  // --- Survival (no model) ---
  if (input.survival) {
    const pending = session.pending_question;
    if (!pending) {
      return finish(false, 'no pending question for survival');
    }
    session.survival_used = (session.survival_used ?? 0) + 1;
    session.updated_at = new Date().toISOString();

    let tl = '';
    let say: string | undefined;
    const audio_key = convoQuestionAudioKey(pack.pack_id, pending.id);
    const playback: 'normal' | 'slow' =
      input.survival === 'slow' ? 'slow' : 'normal';

    if (input.survival === 'nao_percebi') {
      tl =
        findOpenHelpReask(pack, pending.id, pending.item_id) ??
        // Fall back to last character exchange or the pending id's pack line
        session.last_exchanges.filter((e) => e.role === 'character').at(-1)
          ?.tl ??
        '';
      if (!tl) {
        const resolved = findPackQuestion(pack, pending.id);
        if (resolved?.kind === 'open') {
          const open = pack.items[pending.item_id]?.open_questions.find(
            (q) => q.id === pending.id,
          );
          tl = open?.tl ?? '';
        } else if (resolved?.kind === 'choice') {
          const choice = pack.items[pending.item_id]?.choice_questions.find(
            (q) => q.id === pending.id,
          );
          tl = choice?.tl ?? '';
        }
      }
    } else {
      // repeat / slow: re-emit the current pending character line
      const lastChar = session.last_exchanges
        .filter((e) => e.role === 'character')
        .at(-1);
      tl = lastChar?.tl ?? '';
      if (!tl) {
        const meta = findPackQuestion(pack, pending.id);
        if (meta?.kind === 'choice') {
          tl =
            pack.items[pending.item_id]?.choice_questions.find(
              (q) => q.id === pending.id,
            )?.tl ?? '';
        } else if (meta?.kind === 'open') {
          tl =
            pack.items[pending.item_id]?.open_questions.find(
              (q) => q.id === pending.id,
            )?.tl ?? '';
        } else if (meta?.kind === 'recap') {
          tl =
            pack.recap.questions.find((q) => q.id === pending.id)?.tl ?? '';
        }
      }
    }

    if (tl) {
      emit({
        type: 'question',
        id: pending.id,
        tl,
        kind: pending.kind,
        item_id: pending.item_id,
        audio_key,
        playback,
        ...(say ? { say } : {}),
      });
    }
    return finish(true);
  }

  // --- Arabic side channel (09 §6) before grading ---
  const sideKind = classifySideChannel(learnerText);
  if (sideKind === 'arabic_answer' || sideKind === 'other') {
    session = handleArabicAnswer({ session, pack, surfaces, emit });
    return finish(true);
  }
  if (sideKind === 'language_question') {
    const packHit = handleLanguageQuestionFromPack({
      session,
      pack,
      surfaces,
      learnerText,
      emit,
    });
    if (packHit.handled) {
      session = packHit.session;
      return finish(true);
    }
    session = await handleLanguageQuestionCoachCall({
      session,
      pack,
      surfaces,
      learnerText,
      emit,
      ...(input.coachCaller ? { coachCaller: input.coachCaller } : {}),
    });
    return finish(true);
  }

  // --- Grade / event ---
  let event: ConvoEventFacts;
  let eventLine: string | undefined;
  let moments: CoachMoment[] = [];
  const pendingBefore = session.pending_question;

  if (!pendingBefore) {
    // Bootstrap: first question after opening (or after a cleared pending mid-flow).
    event = {
      verdict: 'correct',
      item_id: '',
      question_id: '',
      question_kind: 'open',
      phase: session.phase,
    };
    eventLine = 'conversation started; ask the first question';
  } else {
    pushExchange(session, 'learner', learnerText);
    const qMeta =
      findPackQuestion(pack, pendingBefore.id) ??
      ({
        item_id: pendingBefore.item_id,
        kind: pendingBefore.kind === 'help' ? 'open' : pendingBefore.kind,
        mistakes: pack.items[pendingBefore.item_id]?.common_mistakes.map(
          (m) => ({ id: m.id, trigger: m.trigger }),
        ),
      } as const);

    const itemTl = surfaceTlFor(surfaces, pendingBefore.item_id);
    const otherItems = surfaces.filter((s) => s.id !== pendingBefore.item_id);
    const grade = gradeConvoAnswer({
      learnerText,
      question: {
        id: pendingBefore.id,
        item_id: pendingBefore.item_id,
        mistakes: qMeta.mistakes,
      },
      itemTl,
      otherItems,
    });
    const applied = applyConvoGrade({
      session,
      pack,
      grade,
      pending: pendingBefore,
    });
    session = applied.session;
    moments = applied.moments;
    event = applied.event;
    if (applied.group_advance) {
      emit({
        type: 'group_advance',
        group: applied.group_advance.group,
        card_ids: applied.group_advance.card_ids,
        coach_intros: applied.group_advance.coach_intros,
      });
    }
    const openMeta = findPackQuestion(pack, pendingBefore.id);
    const mapStep =
      openMeta?.kind === 'open'
        ? pack.items[pendingBefore.item_id]?.open_questions.find(
            (q) => q.id === pendingBefore.id,
          )?.map_step
        : undefined;
    const wrongWay = deriveWrongWay({
      pack,
      mapStepId: mapStep,
      mistakeId: event.mistake_id,
    });
    if (wrongWay || mapStep) {
      emit({
        type: 'visual',
        ...(mapStep ? { map_step: mapStep } : {}),
        ...(wrongWay ? { wrong_way: wrongWay } : {}),
      });
    }
  }

  // --- Coach bank first ---
  for (const moment of moments) {
    try {
      const itemId = event.item_id;
      const picked = pickCoachLine({
        moment,
        itemTl: itemId ? surfaceTlFor(surfaces, itemId) : undefined,
        memoryTrickEg: itemId
          ? pack.items[itemId]?.memory_trick_eg
          : undefined,
        recentIds: session.coach_recent_ids,
      });
      session.coach_recent_ids = picked.recentIds;
      emit({
        type: 'coach',
        id: picked.id,
        eg: picked.eg,
        moment,
      });
    } catch {
      // Missing bank moment — skip quietly.
    }
  }

  // --- Candidates / help ---
  const selected = selectConvoCandidates({ session, pack });

  if (selected.kind === 'closing' || session.status === 'done') {
    return finish(true);
  }

  if (selected.kind === 'help' && selected.help) {
    emit({ type: 'help', help: selected.help });
  }

  let candidates = selected.candidates;
  let helpResolved: ResolvedConvoQuestion | null = null;

  if (selected.kind === 'help' && selected.help) {
    helpResolved = resolveHelpQuestion(selected.help);
    candidates = [helpResolved.candidate];
  }

  if (candidates.length === 0) {
    return finish(true);
  }

  const promptBuilt = buildConvoPrompt({
    pack,
    event,
    eventLine,
    candidates,
    lastExchanges: session.last_exchanges,
    learnerAnswer: pendingBefore ? learnerText : '(ready)',
  });
  const { system, prompt } = promptPartsToMessages(promptBuilt);
  const candidateIds = candidates.map((c) => c.id);

  const modelOut = await callModel({
    model,
    system,
    prompt,
    candidateIds,
    emit,
  });
  metrics = {
    ...metrics,
    ...modelOut.metricsPartial,
  };

  const chosenId = modelOut.candidateId;
  const chosenCandidate =
    candidates.find((c) => c.id === chosenId) ?? candidates[0];

  let resolved: ResolvedConvoQuestion;
  if (helpResolved && helpResolved.id === chosenCandidate.id) {
    resolved = helpResolved;
  } else {
    resolved = resolveCandidateQuestion(pack, chosenCandidate);
  }

  // Character reaction + question into exchanges
  if (modelOut.reaction) {
    pushExchange(session, 'character', modelOut.reaction);
  }
  if (resolved.tl) {
    pushExchange(session, 'character', resolved.tl);
  }

  session.pending_question = {
    id: resolved.id,
    kind: resolved.kind,
    item_id: resolved.item_id,
  };
  // Character used the item in a choice line → 🔈 heard (09 §3).
  if (
    resolved.kind === 'choice' &&
    (session.rungs[resolved.item_id] ?? 'taught') === 'taught'
  ) {
    session.rungs[resolved.item_id] = 'heard';
  }
  session.candidate_history = [
    ...session.candidate_history,
    resolved.id,
  ].slice(-20);
  session.updated_at = new Date().toISOString();

  const audio_key = convoQuestionAudioKey(pack.pack_id, resolved.id);
  const options = resolved.option_ids?.map((id) => ({
    id,
    tl: surfaceTlFor(surfaces, id),
  }));
  emit({
    type: 'question',
    id: resolved.id,
    tl: resolved.tl,
    kind: resolved.kind,
    item_id: resolved.item_id,
    ...(resolved.option_ids ? { option_ids: resolved.option_ids } : {}),
    ...(options ? { options } : {}),
    ...(resolved.say ? { say: resolved.say } : {}),
    ...(resolved.map_step ? { map_step: resolved.map_step } : {}),
    audio_key,
    ...(modelOut.unknownWords.length > 0
      ? { unknown_words: modelOut.unknownWords }
      : {}),
  });
  if (resolved.map_step) {
    emit({ type: 'visual', map_step: resolved.map_step });
  }

  // For help step 2, also surface the hint as a coach line if not already.
  if (selected.help?.step === 2 && selected.help.hint_eg) {
    emit({
      type: 'coach',
      id: `help_hint_${selected.help.question_id}`,
      eg: selected.help.hint_eg,
      moment: 'miss_2',
    });
  }

  return finish(true);
}

/** Encode one NDJSON line. */
export function encodeConvoTurnEvent(event: ConvoTurnStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}
