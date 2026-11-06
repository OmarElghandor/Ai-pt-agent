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
  visibleFreeStreamText,
} from '@/lib/v2/convo/output';
import type { ConvoSession, ConvoSessionStore } from '@/lib/v2/convo/session';
import {
  mirrorConvoProgress,
  type ConvoProgressWriter,
} from '@/lib/v2/convo/progress';
import { deriveWrongWay } from '@/lib/v2/convo/visual';
import {
  appendConvoCorrectionError,
  awaitAndEmitCorrection,
  shouldFireFreeTextCorrection,
  startFreeTextCorrection,
} from '@/lib/v2/convo/correction';
import type { FreeTextCorrection, FreeTextGrader } from '@/lib/v2/grader';
import {
  classifySideChannel,
  handleArabicAnswer,
  handleLanguageQuestionCoachCall,
  handleLanguageQuestionFromPack,
  type ConvoCoachCaller,
} from '@/lib/v2/convo/sideChannel';
import { requirePersona } from '@/lib/v2/convo/topics';
import { isLearnModelReactionsEnabled } from '@/lib/v2/flags';
import { convoQuestionAudioKey } from './audioKey';
import { contentWord } from '@/lib/v2/answers/match';
import { pickPackReaction } from './packReaction';
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

function taughtSurfaces(
  session: ConvoSession,
  surfaces: ConvoItemSurface[],
): string[] {
  const out: string[] = [];
  for (const [id, rung] of Object.entries(session.rungs)) {
    if (rung === 'taught') continue;
    const tl = surfaceTlFor(surfaces, id);
    if (tl) out.push(tl);
  }
  return out;
}

function reactionLeaksAnswer(
  reaction: string,
  forbidTl: string | undefined,
  untaught: string[],
): boolean {
  const lower = reaction.toLowerCase();
  if (forbidTl) {
    const needle = forbidTl.toLowerCase().replace(/^(o|a|os|as|à|ao)\s+/i, '');
    if (needle && lower.includes(needle)) return true;
  }
  for (const tl of untaught) {
    const needle = tl.toLowerCase().replace(/^(o|a|os|as|à|ao)\s+/i, '');
    if (needle.length >= 3 && lower.includes(needle)) return true;
  }
  return false;
}

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
  /** True when the learner text came from STT (M5 voice-only coach lines). */
  viaVoice?: boolean;
  /** Client learner bubble id — echoed on correction events (K2/K4). */
  learnerTurnId?: string;
  /** Injected free-text grader (tests). */
  freeTextGrader?: FreeTextGrader;
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
  regenerateReason?: string;
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
    if (consumed.complete) {
      // Hide AR: and beyond while streaming (M2).
      const visible = visibleFreeStreamText(consumed.rest);
      if (visible.length > lastEmittedReaction.length) {
        const delta = visible.slice(lastEmittedReaction.length);
        lastEmittedReaction = visible;
        if (delta) emit({ type: 'reaction_delta', text: delta });
      } else if (visible.length < lastEmittedReaction.length) {
        lastEmittedReaction = visible;
        emit({ type: 'reaction_reset', text: visible });
      }
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

  let lastRegenReason: string | undefined;
  let parsed = parseConvoReaction(result.text, candidateIds);
  if (parsed.decision === 'regenerate' && parsed.regenerateReason) {
    lastRegenReason = parsed.regenerateReason;
    buffer = '';
    tagDone = false;
    lastEmittedReaction = '';
    emit({ type: 'reaction_reset', text: '' });
    result = await streamFn({
      system,
      prompt,
      maxTokens: 48,
      regenerateReason: parsed.regenerateReason,
      onChunk,
    });
    parsed = parseConvoReaction(result.text, candidateIds);
    if (parsed.decision === 'regenerate') {
      lastRegenReason = parsed.regenerateReason ?? lastRegenReason;
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
    regenerateReason: lastRegenReason,
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
          itemId: session.pending_question?.item_id,
          toolId: 'convo_learn',
        });
      }
    }
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
      ...(metrics.regenerate_reason
        ? { regenerate_reason: metrics.regenerate_reason }
        : {}),
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
    session.learner_lines = [
      ...(session.learner_lines ?? []),
      learnerText.trim(),
    ]
      .filter(Boolean)
      .slice(-8);
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

    // K4: open answer accepted (correct / near_miss) → free-text sentence correction.
    const openKind =
      pendingBefore.kind === 'open' || pendingBefore.kind === 'help';
    if (
      openKind &&
      (event.verdict === 'correct' || event.near_miss) &&
      shouldFireFreeTextCorrection({
        learnerText,
        survival: Boolean(input.survival),
      })
    ) {
      const lastChar = session.last_exchanges
        .filter((e) => e.role === 'character')
        .at(-1)?.tl;
      correctionJob = {
        promise: startFreeTextCorrection(
          {
            answer: learnerText.trim(),
            character_tl: lastChar,
          },
          input.freeTextGrader,
        ),
        learner_turn_id:
          input.learnerTurnId?.trim() || `lt_${Date.now().toString(36)}`,
        original: learnerText.trim(),
      };
    }

    if (applied.group_advance) {
      emit({
        type: 'group_advance',
        group: applied.group_advance.group,
        ...(applied.group_advance.intro_eg
          ? { intro_eg: applied.group_advance.intro_eg }
          : {}),
        card_ids: applied.group_advance.card_ids,
        coach_intros: applied.group_advance.coach_intros,
      });
    }
    const qMetaVis = findPackQuestion(pack, pendingBefore.id);
    const mapStep = qMetaVis?.map_step;
    const mapNode = qMetaVis?.map_node;
    const wrongWay = deriveWrongWay({
      pack,
      mapStepId: mapStep,
      mistakeId: event.mistake_id,
    });
    if (wrongWay || mapStep || mapNode) {
      emit({
        type: 'visual',
        ...(mapStep ? { map_step: mapStep } : {}),
        ...(mapNode ? { map_node: mapNode } : {}),
        ...(wrongWay ? { wrong_way: wrongWay } : {}),
      });
    }
  }

  const taught = taughtSurfaces(session, surfaces);
  event.taught_tls = taught;
  if (event.item_id) {
    event.forbid_answer_tl = surfaceTlFor(surfaces, event.item_id);
  }

  // --- Coach: listed mistake note wins; else bank ---
  if (event.coach_note_eg) {
    emit({
      type: 'coach',
      id: `mistake_${event.mistake_id ?? 'note'}`,
      eg: event.coach_note_eg,
      moment: moments[0] ?? 'miss_1',
    });
  } else if (event.near_miss && event.item_id) {
    // M5: spelling near_miss coach (exact wording from batch).
    const lemma =
      contentWord(surfaceTlFor(surfaces, event.item_id) || event.item_id) ||
      event.item_id;
    emit({
      type: 'coach',
      id: 'spelling_near_miss',
      eg: `مظبوط 👏 بتتكتب ${lemma}`,
      moment: 'near_miss_repeat',
    });
  } else if (
    event.verdict === 'unclear' &&
    !input.viaVoice &&
    (event.help_step ?? 0) >= 2 &&
    event.item_id
  ) {
    // M5: typed unclear after help step 2 → show the word (never مش واصلاني).
    const lemma =
      contentWord(surfaceTlFor(surfaces, event.item_id) || event.item_id) ||
      event.item_id;
    emit({
      type: 'coach',
      id: 'typed_unclear_reveal',
      eg: `قربت! الكلمة هي ${lemma}`,
      moment: 'unclear',
    });
  } else if (event.verdict === 'unclear' && !input.viaVoice) {
    emit({
      type: 'coach',
      id: 'typed_unclear',
      eg: 'مش واضح — حاول تكتبها تاني',
      moment: 'unclear',
    });
  } else {
    for (const moment of moments) {
      if (moment === 'near_miss_repeat') continue;
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
        // M5: مش واصلاني only for voice; rewrite bank line if typed slipped through.
        let eg = picked.eg;
        if (
          moment === 'unclear' &&
          !input.viaVoice &&
          /مش واصلاني/.test(eg)
        ) {
          eg = 'مش واضح — حاول تكتبها تاني';
        }
        emit({
          type: 'coach',
          id: picked.id,
          eg,
          moment,
        });
      } catch {
        // Missing bank moment — skip quietly.
      }
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

  const usePackReactions =
    session.module === 'lesson' && !isLearnModelReactionsEnabled();

  let reactionTl = '';
  let reactionAr: string | undefined;
  let resolved: ResolvedConvoQuestion;
  let unknownWords: string[] = [];

  if (usePackReactions) {
    // M1: no model — pick authored reaction; first flow/ranked candidate wins.
    const chosenCandidate = candidates[0]!;
    if (helpResolved && helpResolved.id === chosenCandidate.id) {
      resolved = helpResolved;
    } else {
      resolved = resolveCandidateQuestion(pack, chosenCandidate);
    }
    if (pendingBefore) {
      const picked = pickPackReaction({
        pack,
        event,
        surfaces,
        lastCorrectTl: session.last_pack_reaction_tl,
      });
      reactionTl = picked.tl;
      reactionAr = picked.ar;
      if (event.verdict === 'correct' && picked.tl) {
        session.last_pack_reaction_tl = picked.tl;
      }
      if (reactionTl) {
        emit({ type: 'reaction_delta', text: reactionTl });
      }
    }
  } else {
    let personaJson: string | undefined;
    try {
      const persona = requirePersona(pack.scene.character_id);
      personaJson = JSON.stringify(persona);
    } catch {
      personaJson = undefined;
    }

    const untaughtTls = surfaces
      .filter((s) => (session.rungs[s.id] ?? 'taught') === 'taught')
      .map((s) => s.tl);

    const promptBuilt = buildConvoPrompt({
      pack,
      event,
      eventLine,
      candidates,
      lastExchanges: session.last_exchanges,
      learnerAnswer: pendingBefore ? learnerText : '(ready)',
      ...(personaJson ? { personaJson } : {}),
      taughtTls: taught,
    });
    const { system, prompt } = promptPartsToMessages(promptBuilt);
    const candidateIds = candidates.map((c) => c.id);

    let modelOut = await callModel({
      model,
      system,
      prompt,
      candidateIds,
      emit,
    });
    metrics = {
      ...metrics,
      ...modelOut.metricsPartial,
      ...(modelOut.regenerateReason
        ? { regenerate_reason: modelOut.regenerateReason }
        : {}),
    };

    const chosenId = modelOut.candidateId;
    const chosenCandidate =
      candidates.find((c) => c.id === chosenId) ?? candidates[0]!;

    if (helpResolved && helpResolved.id === chosenCandidate.id) {
      resolved = helpResolved;
    } else {
      resolved = resolveCandidateQuestion(pack, chosenCandidate);
    }

    if (
      modelOut.reaction &&
      reactionLeaksAnswer(
        modelOut.reaction,
        event.forbid_answer_tl,
        untaughtTls,
      )
    ) {
      modelOut = await callModel({
        model,
        system,
        prompt,
        candidateIds,
        emit,
        regenerateReason: 'leaked answer or untaught item',
      });
      if (
        modelOut.reaction &&
        reactionLeaksAnswer(
          modelOut.reaction,
          event.forbid_answer_tl,
          untaughtTls,
        )
      ) {
        emit({ type: 'reaction_delta', text: '' });
        modelOut = { ...modelOut, reaction: '' };
      }
    }
    reactionTl = modelOut.reaction;
    unknownWords = modelOut.unknownWords;
  }

  // Character reaction + question into exchanges (one character turn)
  const combinedTl = [reactionTl, resolved.tl]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  if (combinedTl) {
    pushExchange(session, 'character', combinedTl);
  }

  const bubbleAr = [reactionAr?.trim(), resolved.ar?.trim()]
    .filter(Boolean)
    .join(' ');

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
    ...(bubbleAr ? { ar: bubbleAr } : {}),
    ...(resolved.map_step ? { map_step: resolved.map_step } : {}),
    ...(resolved.map_node ? { map_node: resolved.map_node } : {}),
    audio_key,
    ...(unknownWords.length > 0 ? { unknown_words: unknownWords } : {}),
  });
  if (resolved.map_step || resolved.map_node) {
    emit({
      type: 'visual',
      ...(resolved.map_step ? { map_step: resolved.map_step } : {}),
      ...(resolved.map_node ? { map_node: resolved.map_node } : {}),
    });
  }

  // For help step 2, also surface the hint as a coach line if not already.
  if (selected.help?.step === 2 && selected.help.hint_eg && !event.coach_note_eg) {
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
