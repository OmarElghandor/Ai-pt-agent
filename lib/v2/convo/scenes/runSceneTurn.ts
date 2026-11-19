import { getCharacter } from '@/lib/v2/characters/registry';
import {
  applySceneDoneGoals,
  firstOpenGoalId,
  healSceneSessionAgainstBank,
  isStuckHelpRequest,
  openGoalsFromSession,
  type ConvoGoal,
  type ConvoGoalBank,
} from '@/lib/v2/convo/goals';
import {
  classifySideChannel,
  collectFreeContextCandidates,
} from '@/lib/v2/convo/sideChannel';
import {
  handleFreeArabicSide,
  setCoachPhrase,
} from '@/lib/v2/convo/free';
import type { ConvoCoachCaller } from '@/lib/v2/convo/sideChannel/coachCall';
import { pushLearnerLine } from '@/lib/v2/convo/result/summary';
import type { ConvoSession, ConvoSessionStore } from '@/lib/v2/convo/session';
import type {
  ConvoStreamModel,
  ConvoTurnMetrics,
  ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn/types';
import { checkSceneGoals } from './check';
import { collectSceneFacts } from './prompt';
import {
  callSceneQwen,
  sceneQwenCandidatesFromOpen,
  validateSceneQwenResult,
  type SceneQwenResult,
} from './qwenScene';
import {
  goalExamplesIncludeRepeat,
  isSceneRepeatRequest,
} from './repeat';
import { joinLines, pickVariantLine } from './variants';
import { messageHasAnyKeyword } from './weak';
import type { SceneLine } from '@/lib/v2/convo/goals/types';

export type RunSceneTurnInput = {
  session: ConvoSession;
  bank: ConvoGoalBank;
  learnerText: string;
  store: ConvoSessionStore;
  model: ConvoStreamModel;
  emit: (event: ConvoTurnStreamEvent) => void;
  learnerGender?: 'm' | 'f';
  learnerName?: string | null;
  assisted?: boolean;
  learnerTurnId?: string;
  coachCaller?: ConvoCoachCaller;
  /** Stub the Qwen JSON call (tests). May be a delayed Promise (G10). */
  stubQwen?: SceneQwenResult | Promise<SceneQwenResult>;
  /** @deprecated format-2 stub — ignored for format 3. */
  stubReaction?: { pt: string; ar?: string; goal?: string };
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

function suggestForGoal(
  goal: ConvoGoal | undefined,
  gender: 'm' | 'f',
): string[] {
  if (!goal) return [];
  if (gender === 'f' && goal.suggest_f?.length) return [...goal.suggest_f];
  if (goal.suggest?.length) return [...goal.suggest];
  return [];
}

type SceneHintLevel = 0 | 1 | 2 | 3 | 4;

function hintLevel(session: ConvoSession): SceneHintLevel {
  const n = session.scene_hint_level ?? 0;
  if (n <= 0) return 0;
  if (n >= 4) return 4;
  return n as SceneHintLevel;
}

/** Advance the progressive hint ladder by one (cap at 4). */
function advanceHintLevel(session: ConvoSession): SceneHintLevel {
  const next = Math.min(4, hintLevel(session) + 1) as SceneHintLevel;
  session.scene_hint_level = next;
  return next;
}

function hintTextForLevel(
  goal: ConvoGoal,
  level: SceneHintLevel,
): string {
  if (level <= 0) return '';
  if (goal.hints) {
    if (level === 1) return goal.hints.what_eg;
    if (level === 2) return goal.hints.words_eg;
    if (level === 3) return goal.hints.frame_tl;
    return '';
  }
  return goal.hint_eg?.trim() || goal.help.eg || '';
}

/** Suggest chips only when the ladder is at level 4. */
function suggestIfLevel4(
  session: ConvoSession,
  goal: ConvoGoal | undefined,
  gender: 'm' | 'f',
): string[] | undefined {
  if (hintLevel(session) < 4) return undefined;
  const chips = suggestForGoal(goal, gender);
  return chips.length ? chips : undefined;
}

function emitSuggestFrame(
  session: ConvoSession,
  emit: (e: ConvoTurnStreamEvent) => void,
  goal: ConvoGoal | undefined,
  gender: 'm' | 'f',
): void {
  const level = hintLevel(session);
  const chips = level >= 4 ? suggestForGoal(goal, gender) : [];
  const eg =
    level >= 1 && level <= 3
      ? hintTextForLevel(goal!, level)
      : goal?.hints?.what_eg?.trim() ||
        goal?.hint_eg?.trim() ||
        goal?.help.eg ||
        '';
  const frameTl =
    level === 3
      ? goal?.hints?.frame_tl || chips[0] || ''
      : level >= 4
        ? chips[0] ?? ''
        : goal?.hints?.frame_tl || chips[0] || '';
  session.pending_frame = {
    tl: frameTl,
    eg,
    chips,
  };
  emit({
    type: 'free_frame',
    tl: frameTl,
    eg,
    chips,
  });
}

/** Show only the current ladder level on the hint/coach card. */
function emitHintCard(
  session: ConvoSession,
  emit: (e: ConvoTurnStreamEvent) => void,
  goal: ConvoGoal,
  gender: 'm' | 'f',
): void {
  const level = hintLevel(session);
  const chips = level >= 4 ? suggestForGoal(goal, gender) : [];
  const eg = level >= 4 ? '' : hintTextForLevel(goal, level);
  const frameTl =
    level === 3
      ? goal.hints?.frame_tl || ''
      : level >= 4
        ? chips[0] ?? ''
        : goal.hints?.frame_tl || '';
  session.pending_frame = {
    tl: frameTl,
    eg,
    chips,
  };
  if (eg.trim() || level >= 1) {
    emit({
      type: 'coach',
      id: `scene_hint:${goal.id}:L${level}`,
      eg: eg || (level >= 4 ? chips[0] || '' : ''),
      moment: 'help',
    });
  }
  emit({
    type: 'free_frame',
    tl: frameTl,
    eg,
    chips,
  });
}

function assistedFromHintLadder(session: ConvoSession): boolean {
  return hintLevel(session) >= 4;
}

function emitCharacterBubble(opts: {
  session: ConvoSession;
  emit: (e: ConvoTurnStreamEvent) => void;
  line: SceneLine;
  goalId: string | null;
  playback?: 'slow';
  topicId: string;
  suggest?: string[];
}): void {
  const { session, emit, line } = opts;
  if (!line.tl.trim()) return;
  pushExchange(session, 'character', line.tl);
  emit({
    type: 'bubble_ar',
    ar: line.ar || '',
    pt: line.tl,
    ...(opts.playback ? { playback: opts.playback } : {}),
    ...(opts.suggest?.length ? { suggest: opts.suggest } : {}),
  });
  const lineId = opts.goalId ?? 'scene.ask';
  emit({
    type: 'question',
    id: lineId,
    tl: line.tl,
    kind: 'open',
    item_id: lineId,
    audio_key: `free:${opts.topicId}:${lineId}`,
    ...(opts.playback ? { playback: opts.playback } : {}),
  });
}

function emitSceneDone(
  session: ConvoSession,
  bank: ConvoGoalBank,
  emit: (e: ConvoTurnStreamEvent) => void,
  topicId: string,
  gender: 'm' | 'f',
): void {
  const closing =
    pickVariantLine(session, 'closing', bank.closing_lines, gender) ??
    (bank.closing
      ? {
          tl:
            gender === 'f' && bank.closing.tl_f
              ? bank.closing.tl_f
              : bank.closing.tl,
          ar:
            gender === 'f' && bank.closing.ar_f
              ? bank.closing.ar_f
              : bank.closing.ar,
        }
      : { tl: 'Até logo!', ar: 'إلى اللقاء!' });
  pushExchange(session, 'character', closing.tl);
  emit({ type: 'bubble_ar', ar: closing.ar, pt: closing.tl });
  emit({
    type: 'question',
    id: 'scene.closing',
    tl: closing.tl,
    kind: 'open',
    item_id: 'closing',
    audio_key: `free:${topicId}:closing`,
  });
  const said = (session.learner_lines ?? []).slice(0, 8);
  emit({
    type: 'coach',
    id: 'scene_done',
    eg: `خلصت ✓. ${said.length ? `قلت: ${said.join(' · ')}` : 'خلصت المكالمة.'}`,
    moment: 'summary',
  });
  session.status = 'done';
  session.phase = 'closing';
  session.pending_frame = null;
  session.scene_misses = 0;
  session.scene_hint_level = 0;
}

function findOption(goal: ConvoGoal, value: string | null | undefined) {
  if (!value || !goal.options) return null;
  return goal.options.find((o) => o.value === value) ?? null;
}

function pickAsk(
  session: ConvoSession,
  goal: ConvoGoal | undefined,
  gender: 'm' | 'f' = 'm',
): SceneLine | null {
  if (!goal) return null;
  if (goal.ask?.length) {
    return pickVariantLine(session, `ask:${goal.id}`, goal.ask, gender);
  }
  if (goal.ask_tl?.trim()) {
    const tl =
      gender === 'f' && goal.ask_tl_f?.trim()
        ? goal.ask_tl_f
        : goal.ask_tl;
    const ar =
      gender === 'f' && goal.ask_ar_f?.trim()
        ? goal.ask_ar_f
        : (goal.ask_ar ?? '');
    return { tl, ar };
  }
  return null;
}

function pickReact(
  session: ConvoSession,
  goal: ConvoGoal,
  optionValue: string | null,
  gender: 'm' | 'f' = 'm',
): SceneLine | null {
  const opt = findOption(goal, optionValue);
  if (!opt?.react?.length) return null;
  return pickVariantLine(
    session,
    `react:${goal.id}:${opt.value}`,
    opt.react,
    gender,
  );
}

function pickUnclear(
  session: ConvoSession,
  goal: ConvoGoal,
  gender: 'm' | 'f' = 'm',
): SceneLine | null {
  if (goal.unclear?.length) {
    return pickVariantLine(
      session,
      `unclear:${goal.id}`,
      goal.unclear,
      gender,
    );
  }
  const ask = pickAsk(session, goal, gender);
  if (!ask) return null;
  return {
    tl: `Desculpe? ${ask.tl}`,
    ar: ask.ar,
  };
}

function applyDoneAndBuildBubble(opts: {
  session: ConvoSession;
  bank: ConvoGoalBank;
  doneIds: string[];
  skippedIds: string[];
  furthestId: string;
  optionValue: string | null;
  gender: 'm' | 'f';
  assisted?: boolean;
}): { bubble: SceneLine; nextGoal: ConvoGoal | undefined } {
  const furthest = opts.bank.goals.find((g) => g.id === opts.furthestId)!;
  const react = pickReact(
    opts.session,
    furthest,
    opts.optionValue,
    opts.gender,
  );
  applySceneDoneGoals(
    opts.session,
    opts.bank,
    opts.doneIds,
    opts.skippedIds,
    { assisted: opts.assisted, learnerGender: opts.gender },
  );
  const nextId = opts.session.current_goal;
  const nextGoal = opts.bank.goals.find((g) => g.id === nextId);
  const ask = pickAsk(opts.session, nextGoal, opts.gender);
  const bubble = joinLines(react, ask) ?? ask ?? react ?? {
    tl: '',
    ar: '',
  };
  return { bubble, nextGoal };
}

function emitCorrectionFromQwen(
  emit: (e: ConvoTurnStreamEvent) => void,
  qwen: SceneQwenResult | null,
  learnerTurnId: string,
  original: string,
): void {
  if (!qwen?.has_error || !qwen.corrected?.trim()) return;
  emit({
    type: 'correction',
    learner_turn_id: learnerTurnId,
    severity: 'error',
    corrected_tl: qwen.corrected,
    changes: [],
    main_error: null,
    note_eg: qwen.note_eg || '',
    ar: '',
    original,
  });
}

/**
 * batch-rp-3: authored character bubbles; Qwen JSON for match + correction only.
 */
export async function runSceneTurn(
  input: RunSceneTurnInput,
): Promise<{ session: ConvoSession; metrics: ConvoTurnMetrics }> {
  const started = Date.now();
  let session = structuredClone(input.session);
  const bank = input.bank;
  const gender = input.learnerGender ?? 'm';
  const topicId = session.topic_id ?? bank.topic_id ?? 'scene';
  const emit = input.emit;
  const learnerText = input.learnerText.trim();
  const learnerTurnId = input.learnerTurnId ?? `lt-${Date.now()}`;

  let metrics: ConvoTurnMetrics = {
    input_tokens: 0,
    cached_input_tokens: null,
    output_tokens: 0,
    ttft_ms: 0,
    total_ms: 0,
  };

  const finish = async (ok: boolean, error?: string) => {
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
        goals: session.goals,
        current_goal: session.current_goal,
        character_id: session.character_id,
      },
    });
    emit({ type: 'metrics', ...metrics });
    emit({ type: 'done', ok, ...(error ? { error } : {}) });
    return { session, metrics };
  };

  // Format-3 cut-over: old Mongo sessions still carry `cafe.*` goal ids.
  healSceneSessionAgainstBank(session, bank, gender);

  const openGoals = () => openGoalsFromSession(session, bank);
  const current =
    bank.goals.find((g) => g.id === session.current_goal) ?? openGoals()[0];

  // —— Step 1 · message type ——
  if (
    learnerText &&
    classifySideChannel(learnerText) === 'language_question'
  ) {
    const currentAsk = current
      ? pickAsk(session, current, gender) ??
        (current.ask_tl
          ? { tl: current.ask_tl, ar: current.ask_ar ?? '' }
          : null)
      : null;
    const frame = current
      ? {
          tl: currentAsk?.tl ?? current.ask_tl ?? '',
          eg:
            current.hints?.what_eg ??
            current.hint_eg ??
            current.help.eg,
          chips: [
            ...(suggestIfLevel4(session, current, gender) ?? []),
            ...collectSceneFacts(bank),
          ],
        }
      : session.pending_frame;
    const recentCharacterTls = session.last_exchanges
      .filter((e) => e.role === 'character')
      .slice(-3)
      .map((e) => e.tl);
    const candidates = collectFreeContextCandidates({
      share: null,
      ask: currentAsk ? { tl: currentAsk.tl, ar: currentAsk.ar } : null,
      followUps: [],
      frame: frame ?? null,
      recentCharacterTls,
      arByTl: new Map(),
    });
    const characterId = session.character_id ?? bank.scene?.character_id;
    const characterName =
      (characterId ? getCharacter(characterId)?.name : null) ?? null;
    const side = await handleFreeArabicSide({
      kind: 'language_question',
      learnerText,
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

  if (isStuckHelpRequest(learnerText) || !learnerText) {
    if (current) {
      advanceHintLevel(session);
      emitHintCard(session, emit, current, gender);
    }
    return finish(true);
  }

  if (
    isSceneRepeatRequest(learnerText) &&
    !goalExamplesIncludeRepeat(current, learnerText)
  ) {
    const lastChar = session.last_exchanges
      .filter((e) => e.role === 'character')
      .at(-1);
    if (lastChar?.tl) {
      emitCharacterBubble({
        session,
        emit,
        line: { tl: lastChar.tl, ar: '' },
        goalId: current?.id ?? null,
        playback: 'slow',
        topicId,
        suggest: suggestIfLevel4(session, current, gender),
      });
      emitSuggestFrame(session, emit, current, gender);
    }
    return finish(true);
  }

  // —— Step 2 · Qwen in parallel + code match ——
  pushExchange(session, 'learner', learnerText);
  session.learner_lines = pushLearnerLine(
    session.learner_lines ?? [],
    learnerText,
  );

  const lastCharacter =
    session.last_exchanges.filter((e) => e.role === 'character').at(-1)?.tl ??
    '';
  const candidates = sceneQwenCandidatesFromOpen(openGoals());
  const qwenPromise = callSceneQwen({
    lastCharacter,
    learnerText,
    candidates,
    stub: input.stubQwen,
  });

  const codeMatch = checkSceneGoals(learnerText, bank.goals, session.goals);

  const afterMissesAtLeast3 = (session.scene_misses ?? 0) >= 3;

  const resolveMatch = async (): Promise<{
    kind: 'DONE' | 'NONE';
    furthestId?: string;
    optionValue?: string | null;
    doneIds?: string[];
    skippedIds?: string[];
    qwen: SceneQwenResult | null;
    fromQwen?: boolean;
  }> => {
    if (codeMatch.kind === 'DONE') {
      const qwen = await qwenPromise;
      const validated = validateSceneQwenResult(qwen, candidates);
      return {
        kind: 'DONE',
        furthestId: codeMatch.furthestId,
        optionValue: codeMatch.optionValue,
        doneIds: codeMatch.doneIds,
        skippedIds: codeMatch.skippedIds,
        qwen: validated ?? qwen,
      };
    }

    const raw = await qwenPromise;
    const qwen = validateSceneQwenResult(raw, candidates);
    if (qwen?.kind === 'answer' && qwen.goal && qwen.option) {
      // Build DONE span like checkSceneGoals for this goal.
      const open = openGoals();
      const idx = open.findIndex((g) => g.id === qwen.goal);
      if (idx >= 0) {
        const target = open[idx]!;
        // Farewell from Qwen only if current.
        if (target.farewell && idx !== 0) {
          return { kind: 'NONE', qwen };
        }
        const doneIds: string[] = [];
        const skippedIds: string[] = [];
        for (let i = 0; i <= idx; i++) {
          const id = open[i]!.id;
          if (id === qwen.goal) doneIds.push(id);
          else skippedIds.push(id);
        }
        return {
          kind: 'DONE',
          furthestId: qwen.goal,
          optionValue: qwen.option,
          doneIds,
          skippedIds,
          qwen,
          fromQwen: true,
        };
      }
    }
    return { kind: 'NONE', qwen: qwen ?? raw };
  };

  // —— After 3rd miss: next message ——
  if (afterMissesAtLeast3 && current) {
    const resolved = await resolveMatch();
    if (resolved.kind === 'DONE' && resolved.furthestId) {
      const furthestGoal = bank.goals.find((g) => g.id === resolved.furthestId)!;
      const assisted = assistedFromHintLadder(session);
      if (furthestGoal.farewell) {
        applySceneDoneGoals(
          session,
          bank,
          resolved.doneIds ?? [resolved.furthestId],
          resolved.skippedIds ?? [],
          { assisted, learnerGender: gender },
        );
        emitSceneDone(session, bank, emit, topicId, gender);
        emitCorrectionFromQwen(
          emit,
          resolved.qwen,
          learnerTurnId,
          learnerText,
        );
        return finish(true);
      }
      const { bubble, nextGoal } = applyDoneAndBuildBubble({
        session,
        bank,
        doneIds: resolved.doneIds ?? [resolved.furthestId],
        skippedIds: resolved.skippedIds ?? [],
        furthestId: resolved.furthestId,
        optionValue: resolved.optionValue ?? null,
        gender,
        assisted,
      });
      emitCharacterBubble({
        session,
        emit,
        line: bubble,
        goalId: nextGoal?.id ?? resolved.furthestId,
        topicId,
        suggest: suggestIfLevel4(session, nextGoal, gender),
      });
      emitSuggestFrame(session, emit, nextGoal, gender);
      emitCorrectionFromQwen(emit, resolved.qwen, learnerTurnId, learnerText);
      return finish(true);
    }

    // No match → assisted + next ask only
    applySceneDoneGoals(session, bank, [current.id], [], {
      assisted: true,
      learnerGender: gender,
    });
    const nextGoal = bank.goals.find((g) => g.id === session.current_goal);
    const ask = pickAsk(session, nextGoal, gender);
    if (ask) {
      emitCharacterBubble({
        session,
        emit,
        line: ask,
        goalId: nextGoal?.id ?? null,
        topicId,
        suggest: suggestIfLevel4(session, nextGoal, gender),
      });
      emitSuggestFrame(session, emit, nextGoal, gender);
    }
    emitCorrectionFromQwen(emit, resolved.qwen, learnerTurnId, learnerText);
    return finish(true);
  }

  // —— Code match (rules 1–2) ——
  if (codeMatch.kind === 'DONE') {
    const furthestGoal = bank.goals.find((g) => g.id === codeMatch.furthestId)!;
    const assisted = assistedFromHintLadder(session);
    if (furthestGoal.farewell) {
      applySceneDoneGoals(
        session,
        bank,
        codeMatch.doneIds,
        codeMatch.skippedIds,
        { assisted, learnerGender: gender },
      );
      emitSceneDone(session, bank, emit, topicId, gender);
      const qwen = validateSceneQwenResult(await qwenPromise, candidates);
      emitCorrectionFromQwen(emit, qwen, learnerTurnId, learnerText);
      return finish(true);
    }
    const { bubble, nextGoal } = applyDoneAndBuildBubble({
      session,
      bank,
      doneIds: codeMatch.doneIds,
      skippedIds: codeMatch.skippedIds,
      furthestId: codeMatch.furthestId,
      optionValue: codeMatch.optionValue,
      gender,
      assisted,
    });
    emitCharacterBubble({
      session,
      emit,
      line: bubble,
      goalId: nextGoal?.id ?? codeMatch.furthestId,
      topicId,
      suggest: suggestIfLevel4(session, nextGoal, gender),
    });
    emitSuggestFrame(session, emit, nextGoal, gender);
    const qwen = validateSceneQwenResult(await qwenPromise, candidates);
    emitCorrectionFromQwen(emit, qwen, learnerTurnId, learnerText);
    return finish(true);
  }

  // —— Rules 3–4: greeting / thanks (no code match) ——
  const global = bank.global;
  if (
    global &&
    messageHasAnyKeyword(learnerText, global.greeting.keywords)
  ) {
    const react = pickVariantLine(
      session,
      'global:greeting:react',
      global.greeting.react,
      gender,
    );
    const ask = pickAsk(session, current, gender);
    const bubble = joinLines(react, ask) ?? ask ?? react;
    if (bubble) {
      emitCharacterBubble({
        session,
        emit,
        line: bubble,
        goalId: current?.id ?? null,
        topicId,
        suggest: suggestIfLevel4(session, current, gender),
      });
      emitSuggestFrame(session, emit, current, gender);
    }
    const qwen = validateSceneQwenResult(await qwenPromise, candidates);
    emitCorrectionFromQwen(emit, qwen, learnerTurnId, learnerText);
    return finish(true);
  }

  if (
    global &&
    current &&
    !current.farewell &&
    messageHasAnyKeyword(learnerText, global.thanks.keywords)
  ) {
    const react = pickVariantLine(
      session,
      'global:thanks:react',
      global.thanks.react,
      gender,
    );
    const ask = pickAsk(session, current, gender);
    const bubble = joinLines(react, ask) ?? ask ?? react;
    if (bubble) {
      emitCharacterBubble({
        session,
        emit,
        line: bubble,
        goalId: current?.id ?? null,
        topicId,
        suggest: suggestIfLevel4(session, current, gender),
      });
      emitSuggestFrame(session, emit, current, gender);
    }
    const qwen = validateSceneQwenResult(await qwenPromise, candidates);
    emitCorrectionFromQwen(emit, qwen, learnerTurnId, learnerText);
    return finish(true);
  }

  // —— Rules 5–7: await Qwen ——
  const raw = await qwenPromise;
  const qwen = validateSceneQwenResult(raw, candidates);

  if (qwen?.kind === 'answer' && qwen.goal && qwen.option) {
    const open = openGoals();
    const idx = open.findIndex((g) => g.id === qwen.goal);
    if (idx >= 0) {
      const target = open[idx]!;
      if (!(target.farewell && idx !== 0)) {
        const doneIds: string[] = [];
        const skippedIds: string[] = [];
        for (let i = 0; i <= idx; i++) {
          const id = open[i]!.id;
          if (id === qwen.goal) doneIds.push(id);
          else skippedIds.push(id);
        }
        const assisted = assistedFromHintLadder(session);
        if (target.farewell) {
          applySceneDoneGoals(session, bank, doneIds, skippedIds, {
            assisted,
            learnerGender: gender,
          });
          emitSceneDone(session, bank, emit, topicId, gender);
          emitCorrectionFromQwen(emit, qwen, learnerTurnId, learnerText);
          return finish(true);
        }
        const { bubble, nextGoal } = applyDoneAndBuildBubble({
          session,
          bank,
          doneIds,
          skippedIds,
          furthestId: qwen.goal,
          optionValue: qwen.option,
          gender,
          assisted,
        });
        emitCharacterBubble({
          session,
          emit,
          line: bubble,
          goalId: nextGoal?.id ?? qwen.goal,
          topicId,
          suggest: suggestIfLevel4(session, nextGoal, gender),
        });
        emitSuggestFrame(session, emit, nextGoal, gender);
        emitCorrectionFromQwen(emit, qwen, learnerTurnId, learnerText);
        return finish(true);
      }
    }
  }

  if (qwen?.kind === 'side_question' && global && current) {
    const react = pickVariantLine(
      session,
      'global:side_unknown:react',
      global.side_unknown.react,
      gender,
    );
    const ask = pickAsk(session, current, gender);
    const bubble = joinLines(react, ask) ?? ask ?? react;
    if (bubble) {
      emitCharacterBubble({
        session,
        emit,
        line: bubble,
        goalId: current.id,
        topicId,
        suggest: suggestIfLevel4(session, current, gender),
      });
      emitSuggestFrame(session, emit, current, gender);
    }
    emitCorrectionFromQwen(emit, qwen, learnerTurnId, learnerText);
    return finish(true);
  }

  // Rule 7 · unclear + miss ladder
  if (current) {
    const unclear = pickUnclear(session, current, gender);
    const misses = (session.scene_misses ?? 0) + 1;
    session.scene_misses = misses;
    if (unclear) {
      emitCharacterBubble({
        session,
        emit,
        line: unclear,
        goalId: current.id,
        topicId,
        suggest: suggestIfLevel4(session, current, gender),
      });
    }
    if (misses >= 2) {
      // 2nd miss onward: advance one level (or from prior تلميح presses).
      advanceHintLevel(session);
      emitHintCard(session, emit, current, gender);
    } else {
      emitSuggestFrame(session, emit, current, gender);
    }
  }

  emitCorrectionFromQwen(
    emit,
    qwen ?? (raw?.has_error ? raw : null),
    learnerTurnId,
    learnerText,
  );

  session.current_goal = firstOpenGoalId(session.goals);
  return finish(true);
}
