import {
  applySceneDoneGoals,
  firstActiveOpenGoalId,
  healSceneSessionAgainstBank,
  isStuckHelpRequest,
  openGoalsFromSession,
  type ConvoGoal,
  type ConvoGoalBank,
} from '@/lib/v2/convo/goals';
import { classifySideChannel } from '@/lib/v2/convo/sideChannel';
import { setCoachPhrase } from '@/lib/v2/convo/free';
import type { ConvoCoachCaller } from '@/lib/v2/convo/sideChannel/coachCall';
import { pushLearnerLine } from '@/lib/v2/convo/result/summary';
import type { ConvoSession, ConvoSessionStore } from '@/lib/v2/convo/session';
import type {
  ConvoStreamModel,
  ConvoTurnMetrics,
  ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn/types';
import { checkSceneGoals } from './check';
import {
  closeButWrongCoachEg,
  detectCloseButWrong,
  detectMissingAccentFix,
  isAnswerWordInGoal,
} from './closeButWrong';
import {
  callSceneQwen,
  sceneQwenCandidatesFromOpen,
  validateSceneQwenResult,
  type SceneQwenResult,
} from './qwenScene';
import {
  resolveSceneLangHelp,
  type SceneLangHelpResult,
} from './sceneLangHelp';
import {
  goalExamplesIncludeRepeat,
  isSceneRepeatRequest,
} from './repeat';
import { joinLines, pickVariantLine } from './variants';
import {
  messageHasAnyKeyword,
  normalizeSceneText,
  replaceWordInContext,
} from './weak';
import type { SceneLine } from '@/lib/v2/convo/goals/types';
import type { SceneMistakePayload } from '@/lib/v2/answers/payload';
import type { SceneMistakeWriter } from '@/lib/v2/convo/progress/sceneMistakeWriter';
import {
  diffWordPairs,
  sceneMistakeAnswerId,
  sceneMistakeKey,
} from '@/lib/v2/answers/sceneMistakeHelpers';

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
  /** Stub the Qwen JSON call (tests). May be a delayed Promise (G7). */
  stubQwen?: SceneQwenResult | Promise<SceneQwenResult>;
  /** Format 3: stub language-help Qwen (or 'timeout'). */
  stubLangHelp?:
    | SceneLangHelpResult
    | Promise<SceneLangHelpResult | null>
    | 'timeout';
  /** Live check: observe the raw Qwen JSON (before validation). */
  onSceneQwen?: (raw: SceneQwenResult | null) => void;
  /** @deprecated format-2 stub — ignored for format 3. */
  stubReaction?: { pt: string; ar?: string; goal?: string };
  /** Learner curriculum day (batch-rp-5). Default session.lesson_day ?? 1. */
  learnerDay?: number;
  /** Server-side writer for role-play mistake pairs (batch-rp-5). */
  writeMistake?: SceneMistakeWriter;
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

/** Best matching authored ar for a character pt line (exact or prefix). */
function findAuthoredArForPt(
  bank: ConvoGoalBank,
  pt: string,
  gender: 'm' | 'f',
): string | undefined {
  const needle = normalizeSceneText(pt);
  if (!needle) return undefined;
  const candidates: SceneLine[] = [];
  const push = (line: SceneLine | undefined | null) => {
    if (line?.tl?.trim()) candidates.push(line);
  };
  for (const l of bank.opening_lines ?? []) push(l);
  if (bank.opening) push(bank.opening);
  for (const g of bank.goals) {
    for (const l of g.ask ?? []) push(l);
    for (const l of g.unclear ?? []) push(l);
    for (const o of g.options ?? []) {
      for (const l of o.react) push(l);
    }
  }
  if (bank.global) {
    for (const l of bank.global.greeting.react) push(l);
    for (const l of bank.global.thanks.react) push(l);
    for (const l of bank.global.side_unknown.react) push(l);
  }
  let best: SceneLine | null = null;
  let bestLen = 0;
  for (const line of candidates) {
    const tl = normalizeSceneText(line.tl);
    if (!tl) continue;
    if (tl === needle || needle.startsWith(tl) || tl.startsWith(needle)) {
      if (tl.length > bestLen) {
        best = line;
        bestLen = tl.length;
      }
    }
  }
  if (!best) return undefined;
  if (gender === 'f' && best.ar_f?.trim()) return best.ar_f.trim();
  return best.ar?.trim() || undefined;
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

/** Miss/stuck help level: 1 = suggest[0], 2 = both, 3 = assisted. */
function helpSuggestsForLevel(
  goal: ConvoGoal,
  gender: 'm' | 'f',
  level: 1 | 2,
): string[] {
  const all = suggestForGoal(goal, gender);
  if (level <= 1) return all.slice(0, 1);
  return all.slice(0, 2);
}

function markSuggestShown(session: ConvoSession): void {
  session.scene_suggest_shown = true;
}

function assistedFromSuggest(session: ConvoSession): boolean {
  return Boolean(session.scene_suggest_shown);
}

/**
 * At most one coach_before every 3 character bubbles; sooner → drop.
 * Returns the coach text to attach, or undefined if none / dropped.
 */
function takeCoachBeforeEg(
  session: ConvoSession,
  goal: ConvoGoal | undefined,
): string | undefined {
  if (!goal?.coach_before_eg?.trim()) return undefined;
  const consumed = session.scene_coach_before_consumed ?? [];
  if (consumed.includes(goal.id)) return undefined;

  const ever = Boolean(session.scene_coach_ever_shown);
  const since = session.scene_char_bubbles_since_coach ?? 0;
  const allow = !ever || since >= 3;
  session.scene_coach_before_consumed = [...consumed, goal.id];
  if (!allow) return undefined;

  session.scene_coach_ever_shown = true;
  session.scene_char_bubbles_since_coach = 0;
  return goal.coach_before_eg.trim();
}

function emitCharacterBubble(opts: {
  session: ConvoSession;
  emit: (e: ConvoTurnStreamEvent) => void;
  line: SceneLine;
  goalId: string | null;
  playback?: 'slow';
  topicId: string;
  suggest?: string[];
  /** Goal whose ask is opening (for coach_before + hint_words). */
  openingGoal?: ConvoGoal | null;
  hintGoal?: ConvoGoal | null;
}): void {
  const { session, emit, line } = opts;
  if (!line.tl.trim()) return;

  const coachEg = takeCoachBeforeEg(
    session,
    opts.openingGoal ?? undefined,
  );
  // Count this bubble for spacing (after takeCoachBefore so a shown coach resets first).
  if (!coachEg) {
    session.scene_char_bubbles_since_coach =
      (session.scene_char_bubbles_since_coach ?? 0) + 1;
  }

  const hintGoal = opts.hintGoal ?? opts.openingGoal ?? null;
  pushExchange(session, 'character', line.tl);
  emit({
    type: 'bubble_ar',
    ar: line.ar || '',
    pt: line.tl,
    ...(opts.playback ? { playback: opts.playback } : {}),
    ...(opts.suggest?.length ? { suggest: opts.suggest } : {}),
    ...(coachEg ? { coach_eg: coachEg } : {}),
    ...(hintGoal?.hint_words?.trim()
      ? { hint_words: hintGoal.hint_words.trim() }
      : {}),
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
  session.scene_char_bubbles_since_coach =
    (session.scene_char_bubbles_since_coach ?? 0) + 1;
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
    ...(bank.end_tips_eg?.length
      ? { end_tips_eg: [...bank.end_tips_eg] }
      : {}),
  });
  session.status = 'done';
  session.phase = 'closing';
  session.pending_frame = null;
  session.scene_misses = 0;
  session.scene_hint_level = 0;
  session.scene_suggest_shown = false;
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
    {
      assisted: opts.assisted,
      learnerGender: opts.gender,
      optionValue: opts.optionValue,
    },
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

/** Lowercase + strip punctuation; used to drop punctuation-only corrections. */
function normalizeForCorrectionCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type CorrectionPairs = Array<{ wrong: string; right: string }>;

function pairsForCorrection(
  original: string,
  corrected: string,
  from?: string,
  to?: string,
): CorrectionPairs {
  if (!corrected.trim()) return [];
  if (
    normalizeForCorrectionCompare(original) ===
    normalizeForCorrectionCompare(corrected)
  ) {
    return [];
  }
  if (from?.trim() && to?.trim() && from.trim() !== to.trim()) {
    return [{ wrong: from.trim(), right: to.trim() }];
  }
  return diffWordPairs(original, corrected);
}

function emitCorrectionCard(
  emit: (e: ConvoTurnStreamEvent) => void,
  opts: {
    learnerTurnId: string;
    original: string;
    corrected: string;
    noteEg?: string;
    severity?: 'accent' | 'error';
    from?: string;
    to?: string;
  },
): CorrectionPairs {
  const pairs = pairsForCorrection(
    opts.original,
    opts.corrected,
    opts.from,
    opts.to,
  );
  if (!opts.corrected.trim()) return [];
  if (
    normalizeForCorrectionCompare(opts.original) ===
    normalizeForCorrectionCompare(opts.corrected)
  ) {
    return [];
  }
  const changes =
    pairs.length > 0
      ? pairs.map((p) => ({ from: p.wrong, to: p.right }))
      : opts.from && opts.to
        ? [{ from: opts.from, to: opts.to }]
        : [];
  const main = changes[0] ?? null;
  emit({
    type: 'correction',
    learner_turn_id: opts.learnerTurnId,
    severity: opts.severity ?? 'error',
    corrected_tl: opts.corrected,
    changes,
    main_error: main
      ? { from: main.from, to: main.to, type: 'spelling' }
      : null,
    note_eg: opts.noteEg ?? '',
    ar: '',
    original: opts.original,
  });
  return pairs;
}

function emitCorrectionFromQwen(
  emit: (e: ConvoTurnStreamEvent) => void,
  qwen: SceneQwenResult | null,
  learnerTurnId: string,
  original: string,
): CorrectionPairs {
  if (!qwen?.has_error || !qwen.corrected?.trim()) return [];
  return emitCorrectionCard(emit, {
    learnerTurnId,
    original,
    corrected: qwen.corrected,
    noteEg: qwen.note_eg || '',
  });
}

function emitCloseButWrongStop(
  emit: (e: ConvoTurnStreamEvent) => void,
  opts: {
    learnerTurnId: string;
    original: string;
    /** Learner's misspelled token (for the pair). */
    fromWord: string;
    answerWord: string;
    correctedInContext: string;
  },
): CorrectionPairs {
  emit({
    type: 'coach',
    id: 'scene_close_but_wrong',
    eg: closeButWrongCoachEg(opts.answerWord),
    moment: 'close_but_wrong',
    suggest: [opts.correctedInContext],
  });
  return emitCorrectionCard(emit, {
    learnerTurnId: opts.learnerTurnId,
    original: opts.original,
    corrected: opts.correctedInContext,
    severity: 'error',
    from: opts.fromWord,
    to: opts.answerWord,
    noteEg: closeButWrongCoachEg(opts.answerWord),
  });
}

async function writeSceneMistakePairs(opts: {
  writeMistake?: SceneMistakeWriter;
  session: ConvoSession;
  sceneId: string;
  goalId: string;
  promptTl: string;
  learnerTl: string;
  correctedTl: string;
  pairs: CorrectionPairs;
  stopped: boolean;
  day: number;
  turnKey: string;
  /** Suggestion reuse — not a mistake (batch-rp-5 §1). */
  skip?: boolean;
}): Promise<void> {
  if (!opts.writeMistake || opts.skip || !opts.pairs.length) return;
  for (const pair of opts.pairs) {
    const mistakeKey = sceneMistakeKey(pair.wrong, pair.right);
    const payload: SceneMistakePayload = {
      kind: 'scene_mistake',
      answer_id: sceneMistakeAnswerId({
        sessionId: opts.session.id,
        turnKey: opts.turnKey,
        mistakeKey,
      }),
      day: opts.day,
      session_id: opts.session.id,
      scene_id: opts.sceneId,
      goal_id: opts.goalId,
      prompt_tl: opts.promptTl,
      learner_tl: opts.learnerTl,
      corrected_tl: opts.correctedTl,
      wrong: pair.wrong,
      right: pair.right,
      stopped: opts.stopped,
    };
    try {
      await opts.writeMistake(payload);
    } catch (err) {
      console.error('[scene] mistake write failed', err);
    }
  }
}

function applyAssistedAndNextAsk(opts: {
  session: ConvoSession;
  bank: ConvoGoalBank;
  goal: ConvoGoal;
  gender: 'm' | 'f';
  topicId: string;
  emit: (e: ConvoTurnStreamEvent) => void;
}): void {
  applySceneDoneGoals(opts.session, opts.bank, [opts.goal.id], [], {
    assisted: true,
    learnerGender: opts.gender,
    optionValue: null,
  });
  const nextGoal = opts.bank.goals.find(
    (g) => g.id === opts.session.current_goal,
  );
  const ask = pickAsk(opts.session, nextGoal, opts.gender);
  if (ask) {
    emitCharacterBubble({
      session: opts.session,
      emit: opts.emit,
      line: ask,
      goalId: nextGoal?.id ?? null,
      topicId: opts.topicId,
      openingGoal: nextGoal,
      hintGoal: nextGoal,
    });
  }
}

/**
 * batch-rp-3 (2026-11-20): authored bubbles; Qwen JSON for match + correction.
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

  healSceneSessionAgainstBank(session, bank, gender);

  const openGoals = () => openGoalsFromSession(session, bank);
  const current =
    bank.goals.find((g) => g.id === session.current_goal) ?? openGoals()[0];
  const learnerDay = input.learnerDay ?? session.lesson_day ?? 1;
  const sceneId = session.topic_id ?? bank.topic_id ?? 'scene';
  const turnKey = String(
    (session.learner_lines?.length ?? 0) + (learnerText ? 1 : 0),
  );
  const lastCharacterForPrompt = () =>
    session.last_exchanges.filter((e) => e.role === 'character').at(-1)?.tl ??
    '';
  const logPairs = async (args: {
    goalId: string;
    pairs: CorrectionPairs;
    correctedTl: string;
    stopped?: boolean;
    skip?: boolean;
  }) => {
    await writeSceneMistakePairs({
      writeMistake: input.writeMistake,
      session,
      sceneId,
      goalId: args.goalId,
      promptTl: lastCharacterForPrompt(),
      learnerTl: learnerText,
      correctedTl: args.correctedTl,
      pairs: args.pairs,
      stopped: args.stopped === true,
      day: learnerDay,
      turnKey,
      skip: args.skip,
    });
  };

  // —— Step 1 · message type ——
  if (
    learnerText &&
    classifySideChannel(learnerText) === 'language_question'
  ) {
    const lastChar = [...session.last_exchanges]
      .reverse()
      .find((e) => e.role === 'character');
    const lastPt =
      lastChar?.tl?.trim() ||
      pickAsk(session, current, gender)?.tl ||
      current?.ask_tl ||
      '';
    const lastAr = findAuthoredArForPt(bank, lastPt, gender);
    const help = await resolveSceneLangHelp({
      lastCharacterPt: lastPt,
      lastCharacterAr: lastAr,
      learnerQuestion: learnerText,
      goal: current ?? null,
      bank,
      gender,
      ...(input.stubLangHelp !== undefined
        ? { stub: input.stubLangHelp }
        : {}),
    });
    emit({
      type: 'coach',
      id: 'scene_lang_help',
      eg: help.eg,
      segments: help.segments,
      moment: 'language_question',
      ...(help.suggest.length ? { suggest: help.suggest } : {}),
    });
    if (help.suggest[0]) {
      session.coach_phrase = setCoachPhrase(help.suggest[0]);
    }
    return finish(true);
  }

  if (isStuckHelpRequest(learnerText) || !learnerText) {
    if (current) {
      const missesBefore = session.scene_misses ?? 0;
      const level = Math.min(3, missesBefore + 1) as 1 | 2 | 3;
      if (level >= 3) {
        applyAssistedAndNextAsk({
          session,
          bank,
          goal: current,
          gender,
          topicId,
          emit,
        });
      } else {
        const suggests = helpSuggestsForLevel(
          current,
          gender,
          level as 1 | 2,
        );
        markSuggestShown(session);
        if (suggests.length) {
          emit({
            type: 'coach',
            id: `scene_help:${current.id}:L${level}`,
            eg: 'ممكن تقول:',
            moment: 'help',
            suggest: suggests,
          });
        }
      }
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
        hintGoal: current,
      });
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
  }).then((raw) => {
    input.onSceneQwen?.(raw);
    return raw;
  });

  const codeMatch = checkSceneGoals(learnerText, bank.goals, session.goals);

  const emitMatchBubble = (
    bubble: SceneLine,
    nextGoal: ConvoGoal | undefined,
    goalId: string,
  ) => {
    emitCharacterBubble({
      session,
      emit,
      line: bubble,
      goalId: nextGoal?.id ?? goalId,
      topicId,
      openingGoal: nextGoal,
      hintGoal: nextGoal,
    });
  };

  // —— Code match (rules 1–2) ——
  if (codeMatch.kind === 'DONE') {
    const furthestGoal = bank.goals.find((g) => g.id === codeMatch.furthestId)!;
    const close = detectCloseButWrong(
      learnerText,
      furthestGoal,
      codeMatch.optionValue,
    );
    if (close && !furthestGoal.farewell) {
      const streak = session.scene_close_but_wrong_streak ?? 0;
      if (streak < 1) {
        // First close-but-wrong → stop; not a miss.
        session.scene_close_but_wrong_streak = 1;
        void (await qwenPromise);
        const pairs = emitCloseButWrongStop(emit, {
          learnerTurnId,
          original: learnerText,
          fromWord: close.hit.token,
          answerWord: close.answerWord,
          correctedInContext: close.correctedInContext,
        });
        await logPairs({
          goalId: furthestGoal.id,
          pairs,
          correctedTl: close.correctedInContext,
          stopped: true,
        });
        return finish(true);
      }
      // Second in a row → accept as assisted + correction card.
      session.scene_close_but_wrong_streak = 0;
      const { bubble, nextGoal } = applyDoneAndBuildBubble({
        session,
        bank,
        doneIds: codeMatch.doneIds,
        skippedIds: codeMatch.skippedIds,
        furthestId: codeMatch.furthestId,
        optionValue: codeMatch.optionValue,
        gender,
        assisted: true,
      });
      emitMatchBubble(bubble, nextGoal, codeMatch.furthestId);
      void (await qwenPromise);
      const pairs = emitCorrectionCard(emit, {
        learnerTurnId,
        original: learnerText,
        corrected: close.correctedInContext,
        severity: 'error',
        from: close.hit.token,
        to: close.answerWord,
      });
      // Second close-but-wrong is a new occurrence of the same pair.
      await logPairs({
        goalId: furthestGoal.id,
        pairs,
        correctedTl: close.correctedInContext,
      });
      return finish(true);
    }

    session.scene_close_but_wrong_streak = 0;
    const assisted = assistedFromSuggest(session);
    if (furthestGoal.farewell) {
      applySceneDoneGoals(
        session,
        bank,
        codeMatch.doneIds,
        codeMatch.skippedIds,
        {
          assisted,
          learnerGender: gender,
          optionValue: codeMatch.optionValue,
        },
      );
      emitSceneDone(session, bank, emit, topicId, gender);
      const qwen = validateSceneQwenResult(await qwenPromise, candidates);
      const pairs = emitCorrectionFromQwen(
        emit,
        qwen,
        learnerTurnId,
        learnerText,
      );
      await logPairs({
        goalId: furthestGoal.id,
        pairs,
        correctedTl: qwen?.corrected ?? '',
        skip: assisted,
      });
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
    emitMatchBubble(bubble, nextGoal, codeMatch.furthestId);
    const qwen = validateSceneQwenResult(await qwenPromise, candidates);
    // Missing accents/cedilla → always show a correction card (Qwen or code).
    const accent = detectMissingAccentFix(
      learnerText,
      furthestGoal,
      codeMatch.optionValue,
    );
    if (qwen?.has_error && qwen.corrected?.trim()) {
      const pairs = emitCorrectionFromQwen(
        emit,
        qwen,
        learnerTurnId,
        learnerText,
      );
      await logPairs({
        goalId: furthestGoal.id,
        pairs,
        correctedTl: qwen.corrected,
        skip: assisted,
      });
    } else if (accent) {
      const pairs = emitCorrectionCard(emit, {
        learnerTurnId,
        original: learnerText,
        corrected: accent.correctedInContext,
        severity: 'accent',
        from: accent.hit.token,
        to: accent.answerWord,
      });
      await logPairs({
        goalId: furthestGoal.id,
        pairs,
        correctedTl: accent.correctedInContext,
        skip: assisted,
      });
    }
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
        hintGoal: current,
      });
    }
    const qwen = validateSceneQwenResult(await qwenPromise, candidates);
    const pairs = emitCorrectionFromQwen(
      emit,
      qwen,
      learnerTurnId,
      learnerText,
    );
    await logPairs({
      goalId: current?.id ?? 'greeting',
      pairs,
      correctedTl: qwen?.corrected ?? '',
    });
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
        hintGoal: current,
      });
    }
    const qwen = validateSceneQwenResult(await qwenPromise, candidates);
    const pairs = emitCorrectionFromQwen(
      emit,
      qwen,
      learnerTurnId,
      learnerText,
    );
    await logPairs({
      goalId: current.id,
      pairs,
      correctedTl: qwen?.corrected ?? '',
    });
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
        // Qwen-only close-but-wrong: answer_word in options + misspelled → stop.
        if (
          qwen.answer_word &&
          qwen.answer_word_misspelled &&
          isAnswerWordInGoal(target, qwen.answer_word) &&
          !target.farewell
        ) {
          const streak = session.scene_close_but_wrong_streak ?? 0;
          const correctedInContext =
            qwen.corrected?.trim() ||
            replaceWordInContext(
              learnerText,
              learnerText.trim().split(/\s+/).at(-1) ?? qwen.answer_word,
              qwen.answer_word,
            );
          if (streak < 1) {
            session.scene_close_but_wrong_streak = 1;
            const fromWord =
              learnerText.trim().split(/\s+/).at(-1) ?? qwen.answer_word;
            const pairs = emitCloseButWrongStop(emit, {
              learnerTurnId,
              original: learnerText,
              fromWord,
              answerWord: qwen.answer_word,
              correctedInContext,
            });
            await logPairs({
              goalId: target.id,
              pairs,
              correctedTl: correctedInContext,
              stopped: true,
            });
            return finish(true);
          }
          session.scene_close_but_wrong_streak = 0;
          const doneIdsQ: string[] = [];
          const skippedIdsQ: string[] = [];
          for (let i = 0; i <= idx; i++) {
            const id = open[i]!.id;
            if (id === qwen.goal) doneIdsQ.push(id);
            else skippedIdsQ.push(id);
          }
          const { bubble, nextGoal } = applyDoneAndBuildBubble({
            session,
            bank,
            doneIds: doneIdsQ,
            skippedIds: skippedIdsQ,
            furthestId: qwen.goal,
            optionValue: qwen.option,
            gender,
            assisted: true,
          });
          emitMatchBubble(bubble, nextGoal, qwen.goal);
          const fromWord =
            learnerText.trim().split(/\s+/).at(-1) ?? qwen.answer_word;
          const pairs = emitCorrectionCard(emit, {
            learnerTurnId,
            original: learnerText,
            corrected: correctedInContext,
            severity: 'error',
            from: fromWord,
            to: qwen.answer_word,
          });
          await logPairs({
            goalId: target.id,
            pairs,
            correctedTl: correctedInContext,
          });
          return finish(true);
        }

        session.scene_close_but_wrong_streak = 0;
        const doneIds: string[] = [];
        const skippedIds: string[] = [];
        for (let i = 0; i <= idx; i++) {
          const id = open[i]!.id;
          if (id === qwen.goal) doneIds.push(id);
          else skippedIds.push(id);
        }
        const assisted = assistedFromSuggest(session);
        if (target.farewell) {
          applySceneDoneGoals(session, bank, doneIds, skippedIds, {
            assisted,
            learnerGender: gender,
            optionValue: qwen.option,
          });
          emitSceneDone(session, bank, emit, topicId, gender);
          const pairs = emitCorrectionFromQwen(
            emit,
            qwen,
            learnerTurnId,
            learnerText,
          );
          await logPairs({
            goalId: target.id,
            pairs,
            correctedTl: qwen.corrected ?? '',
            skip: assisted,
          });
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
        emitMatchBubble(bubble, nextGoal, qwen.goal);
        const pairs = emitCorrectionFromQwen(
          emit,
          qwen,
          learnerTurnId,
          learnerText,
        );
        await logPairs({
          goalId: target.id,
          pairs,
          correctedTl: qwen.corrected ?? '',
          skip: assisted,
        });
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
        hintGoal: current,
      });
    }
    const pairs = emitCorrectionFromQwen(
      emit,
      qwen,
      learnerTurnId,
      learnerText,
    );
    await logPairs({
      goalId: current.id,
      pairs,
      correctedTl: qwen.corrected ?? '',
    });
    return finish(true);
  }

  // Rule 7 · unclear + miss ladder — not a mistake for weak spots (R5-5).
  session.scene_close_but_wrong_streak = 0;
  if (current) {
    const missesBefore = session.scene_misses ?? 0;
    const nextMiss = missesBefore + 1;
    if (nextMiss >= 3) {
      session.scene_misses = nextMiss;
      applyAssistedAndNextAsk({
        session,
        bank,
        goal: current,
        gender,
        topicId,
        emit,
      });
    } else {
      session.scene_misses = nextMiss;
      const level = nextMiss as 1 | 2;
      const suggests = helpSuggestsForLevel(current, gender, level);
      markSuggestShown(session);
      const unclear = pickUnclear(session, current, gender);
      if (unclear) {
        // One «ممكن تقول:» under the unclear bubble — no duplicate help coach.
        emitCharacterBubble({
          session,
          emit,
          line: unclear,
          goalId: current.id,
          topicId,
          suggest: suggests,
          hintGoal: current,
        });
      } else if (suggests.length) {
        emit({
          type: 'coach',
          id: `scene_help:${current.id}:L${level}`,
          eg: 'ممكن تقول:',
          moment: 'help',
          suggest: suggests,
        });
      }
    }
  }

  emitCorrectionFromQwen(
    emit,
    qwen ?? (raw?.has_error ? raw : null),
    learnerTurnId,
    learnerText,
  );

  session.current_goal = firstActiveOpenGoalId(bank, session.goals);
  return finish(true);
}
