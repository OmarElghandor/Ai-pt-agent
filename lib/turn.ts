import { lessonById, liveLessons, testLessons } from './lessons/catalogue';
import { allBeatsResolved, nextUnresolvedBeat, practiceChecklistSummary } from './lessons/alignment';
import type { AssessmentTask, LessonPack, StoryBeat } from './lessons/types';
import type { GradeVerdict } from './grade';
import { classifyScript, gradeKnownAnswer, hasPersonalSlot } from './grade';
import {
  beatShowsPreHint,
  currentAssessmentTask,
  currentBeat,
  makeAssessmentPrompt,
  makeChecklistDone,
  makeCoachTip,
  makeMixed,
  makePraise,
  makeRetryCoach,
  presentBeat,
  presentClosing,
  makeIntro,
} from './messages';
import type {
  Chip,
  LessonReactionContext,
  LessonRecord,
  PracticeFocus,
  Progress,
  TurnAction,
  TurnLogDetail,
  TypedMessage,
} from './progressTypes';
import { emptyTurnLog } from './progressTypes';

const FRIEND_BRIDGE_TURNS = 5;
const ASSESSMENT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type { LessonReactionContext };

export type GradedUnit = StoryBeat | AssessmentTask;

export type TurnResult = {
  progress: Progress;
  messages: TypedMessage[];
  learnerVerdict?: TypedMessage['learnerVerdict'];
  streamKind: 'none' | 'friend' | 'open-grade' | 'side-reply' | 'lesson-reaction';
  log: TurnLogDetail;
  modelContext?: {
    item?: GradedUnit;
    lesson?: LessonPack;
    userText: string;
    reaction?: LessonReactionContext;
  };
};

function packUnlocked(_pack: LessonPack): boolean {
  return true;
}

function lessonRecord(progress: Progress, lessonId: string): LessonRecord {
  return progress.lessons[lessonId] ?? { lessonId };
}

function saveLesson(progress: Progress, record: LessonRecord): void {
  progress.lessons[record.lessonId] = record;
}

function availableLessons(): LessonPack[] {
  const live = liveLessons();
  const allowTest =
    process.env.NODE_ENV !== 'production' || process.env.ALLOW_TEST_LESSONS === '1';
  if (allowTest) return [...live, ...testLessons()];
  return live;
}

export function chipsFor(progress: Progress): Chip[] {
  const chips: Chip[] = [];
  if (progress.mode === 'practice' && progress.practice) {
    const focus = progress.practice;
    if (focus.phase === 'story' && !focus.coachTipShown) {
      const pack = lessonById(focus.lessonId);
      const beat = pack ? currentBeat(pack, focus.beatIndex) : null;
      if (beat?.difficulty === 'supported' && beat.coachTip) {
        chips.push({ id: 'coach-tip', label: 'مساعدة', action: { type: 'show-coach-tip' } });
      }
    }
    chips.push({ id: 'end-practice', label: 'إنهاء التمرين', action: { type: 'end-practice' } });
    return chips;
  }
  if (progress.mode === 'assessment') return chips;

  for (const [id, rec] of Object.entries(progress.lessons)) {
    if (rec.paused) {
      const pack = lessonById(id);
      chips.push({
        id: `resume-${id}`,
        label: `كمّل: ${pack?.chipLabel ?? id}`,
        action: { type: 'resume-practice' },
      });
    }
  }

  const now = Date.now();
  for (const pack of availableLessons()) {
    if (!packUnlocked(pack) || !pack.assessmentAvailable) continue;
    const rec = progress.lessons[pack.id];
    if (!rec?.practisedAt) continue;
    if (now - rec.practisedAt < ASSESSMENT_COOLDOWN_MS) continue;
    chips.push({
      id: `assess-${pack.id}`,
      label: `اختبر نفسك في ${pack.chipLabel}`,
      action: { type: 'start-assessment', lessonId: pack.id },
    });
  }

  for (const pack of availableLessons()) {
    if (!packUnlocked(pack)) continue;
    chips.push({
      id: `practice-${pack.id}`,
      label: pack.chipLabel,
      action: { type: 'start-practice', lessonId: pack.id },
    });
  }

  return chips;
}

function startPracticeFocus(lessonId: string): PracticeFocus {
  return {
    lessonId,
    beatIndex: 0,
    attemptsOnCurrent: 0,
    itemOutcomes: {},
    phase: 'story',
    friendBridgeTurnsLeft: 0,
    useAltLine: false,
    coachTipShown: false,
  };
}

function sceneTitle(pack: LessonPack, beat: StoryBeat | null): string {
  if (!beat) return '';
  return pack.scenes.find((scene) => scene.id === beat.sceneId)?.titleAr ?? '';
}

function reactionVerdict(grade: GradeVerdict): 'correct' | 'near_miss' | 'wrong' {
  if (grade.verdict === 'correct') return 'correct';
  if (grade.verdict === 'near-miss') return 'near_miss';
  if (grade.verdict === 'anticipated-wrong') {
    return grade.authoredVerdict === 'near_miss' ? 'near_miss' : 'wrong';
  }
  return 'wrong';
}

function mistakeNote(grade: GradeVerdict): string | undefined {
  if (grade.verdict !== 'anticipated-wrong') return undefined;
  const text = grade.feedback.map((seg) => seg.text).join(' ').trim();
  return text || undefined;
}

function learnerVerdictFor(grade: GradeVerdict): TypedMessage['learnerVerdict'] | undefined {
  const verdict = reactionVerdict(grade);
  if (verdict === 'correct') return 'صح';
  if (verdict === 'near_miss') return 'قربت';
  return undefined;
}

/** Rotating praise bubble for a valid practice answer. Updates progress in place. */
export function takePracticePraise(progress: Progress): TypedMessage {
  const praised = makePraise(progress);
  progress.lastPraiseIndex = praised.nextIndex;
  const pt = praised.message.segments
    .filter((seg) => seg.lang === 'pt')
    .map((seg) => seg.text.trim())
    .filter(Boolean);
  if (pt.length) {
    progress.recentPraise = [...(progress.recentPraise ?? []), ...pt].slice(-5);
  }
  return praised.message;
}

/** Model-graded practice pass: emit praise in the chat route (code path already did). */
export function shouldEmitPracticePraise(
  reaction: Pick<LessonReactionContext, 'mode' | 'source'>,
  verdict: string | null | undefined,
): boolean {
  if (reaction.mode !== 'practice' || reaction.source !== 'you') return false;
  return verdict === 'correct' || verdict === 'near-miss' || verdict === 'near_miss';
}

/** Raw coach tip already on screen (pre-hint for guided/supported). */
function shownCoachTip(progress: Progress, unit: GradedUnit): string | undefined {
  const text = unit.coachTip?.ar?.trim();
  if (!text || !('difficulty' in unit)) return undefined;
  if (unit.difficulty === 'guided') return text;
  if (unit.difficulty === 'supported' && progress.practice?.coachTipShown) return text;
  return undefined;
}

function withPreHintFlag(
  focus: PracticeFocus,
  pack: LessonPack,
  beatIndex: number,
  alt = false,
): PracticeFocus {
  const beat = currentBeat(pack, beatIndex);
  return { ...focus, coachTipShown: beatShowsPreHint(beat, alt) };
}

function buildReactionBase(
  progress: Progress,
  pack: LessonPack,
  unit: GradedUnit,
  beat: StoryBeat | null,
): Omit<LessonReactionContext, 'verdict' | 'source' | 'attempt' | 'nextPrompt' | 'nextPrompts'> {
  const line = 'speaker' in unit ? unit.line : unit.line;
  return {
    mode: 'practice',
    accepted: unit.kind === 'known' ? unit.acceptedAnswers.slice(0, 5).join(' | ') : undefined,
    hintNote: unit.hintNote,
    whyNote: unit.whyNote,
    nudgeNote: unit.nudgeNote,
    criterion: unit.kind === 'open' ? unit.successCriterion : undefined,
    guard:
      unit.kind === 'open'
        ? [...(unit.codeGuard.requiredWords ?? []), ...(unit.codeGuard.requiredEndings ?? [])].join(
            ', ',
          )
        : undefined,
    frame: unit.frame,
    coachTip: shownCoachTip(progress, unit),
    wordBank: unit.wordBank?.length
      ? unit.wordBank.map((word) => (word.meaning ? `${word.pt} (${word.meaning})` : word.pt)).join(' | ')
      : undefined,
    currentPromptPlain: line.pt,
    situation: pack.situationAr || pack.learningTarget,
    lessonTarget: pack.learningTarget,
    recentPraise: progress.recentPraise ?? [],
    characterName: beat?.speaker || pack.character.name,
    characterRole: pack.character.roleAr,
    sceneTitle: sceneTitle(pack, beat),
    beatLine: line.pt,
    reactionCue: beat?.reactionCue,
    recentCharacterReactions: progress.recentCharacterReactions ?? [],
  };
}

function followUpMessages(pack: LessonPack, fromIndex: number, alt: boolean): TypedMessage[] {
  return presentBeat(pack, fromIndex, { alt });
}

function enterFriendBridge(
  progress: Progress,
  pack: LessonPack,
  focus: PracticeFocus,
  outbound: TypedMessage[],
): PracticeFocus {
  const summary = practiceChecklistSummary(pack.beats, focus.itemOutcomes);
  outbound.push(presentClosing(pack));
  outbound.push(makeChecklistDone(summary.done, summary.total));
  const next: PracticeFocus = {
    ...focus,
    phase: 'friend-bridge',
    friendBridgeTurnsLeft: FRIEND_BRIDGE_TURNS,
    beatIndex: pack.beats.length,
    attemptsOnCurrent: 0,
    useAltLine: false,
    coachTipShown: false,
  };
  progress.mode = 'friend';
  progress.practice = next;
  return next;
}

/** Record a beat outcome and queue the next story line, or the closing hook. */
export function advancePracticeAfterOutcome(
  progress: Progress,
  pack: LessonPack,
  focus: PracticeFocus,
  beatId: string,
  outcome: 'correct' | 'near-miss' | 'learned-with-help',
  outbound: TypedMessage[],
): PracticeFocus {
  const from = pack.beats.findIndex((beat) => beat.id === beatId);
  const next: PracticeFocus = {
    ...focus,
    itemOutcomes: { ...focus.itemOutcomes, [beatId]: outcome },
    attemptsOnCurrent: 0,
    useAltLine: false,
    coachTipShown: false,
  };
  const idx = nextUnresolvedBeat(pack.beats, next.itemOutcomes, from < 0 ? 0 : from + 1);
  if (idx < 0) {
    if (allBeatsResolved(pack.beats, next.itemOutcomes)) {
      return enterFriendBridge(progress, pack, next, outbound);
    }
    progress.practice = next;
    return next;
  }
  next.phase = 'story';
  next.beatIndex = idx;
  outbound.push(...followUpMessages(pack, idx, false));
  progress.practice = withPreHintFlag(next, pack, idx, false);
  return next;
}

export function unresolvedPracticePrompt(
  progress: Progress,
  pack: LessonPack,
): TypedMessage | undefined {
  const focus = progress.practice;
  if (!focus || focus.phase !== 'story') return undefined;
  const idx = nextUnresolvedBeat(pack.beats, focus.itemOutcomes, focus.beatIndex);
  if (idx < 0) return undefined;
  const shown = presentBeat(pack, idx, { alt: focus.useAltLine });
  return shown.find((message) => message.type === 'character') ?? shown[0];
}

export function commitPersonalSlotAdvance(
  progress: Progress,
  pack: LessonPack,
  outcome: 'correct' | 'near-miss' | 'learned-with-help',
): TypedMessage[] {
  const focus = progress.practice;
  if (!focus || focus.phase !== 'story') return [];
  const beat = currentBeat(pack, focus.beatIndex);
  if (!beat) return [];
  const outbound: TypedMessage[] = [];
  advancePracticeAfterOutcome(progress, pack, focus, beat.id, outcome, outbound);
  return outbound;
}

/** After Prompt 4 grades an open beat or assessment task. */
export function commitOpenVerdict(
  progress: Progress,
  pack: LessonPack,
  unitId: string,
  verdict: 'correct' | 'near-miss' | 'wrong',
): TypedMessage[] {
  if (progress.assessment && progress.mode === 'assessment') {
    return commitAssessmentVerdict(progress, pack, unitId, verdict);
  }
  const focus = progress.practice;
  if (!focus || focus.phase !== 'story') return [];
  const beat = pack.beats.find((item) => item.id === unitId) ?? currentBeat(pack, focus.beatIndex);
  if (!beat) return [];
  const outbound: TypedMessage[] = [];
  if (verdict === 'correct' || verdict === 'near-miss') {
    advancePracticeAfterOutcome(
      progress,
      pack,
      focus,
      beat.id,
      verdict === 'near-miss' ? 'near-miss' : 'correct',
      outbound,
    );
    return outbound;
  }
  const attempts = (focus.attemptsOnCurrent ?? 0) + 1;
  if (attempts >= 2) {
    advancePracticeAfterOutcome(
      progress,
      pack,
      { ...focus, attemptsOnCurrent: attempts },
      beat.id,
      'learned-with-help',
      outbound,
    );
    return outbound;
  }
  progress.practice = {
    ...focus,
    attemptsOnCurrent: attempts,
    useAltLine: true,
  };
  // Coach says try again — do not re-present the character line.
  return outbound;
}

function commitAssessmentVerdict(
  progress: Progress,
  pack: LessonPack,
  unitId: string,
  verdict: 'correct' | 'near-miss' | 'wrong',
): TypedMessage[] {
  const focus = progress.assessment;
  if (!focus) return [];
  const task = pack.assessmentTasks.find((item) => item.id === unitId) ?? pack.assessmentTasks[focus.taskIndex];
  if (!task) return [];
  const outbound: TypedMessage[] = [];
  const attempts = focus.attemptsOnCurrent + 1;
  const pass = verdict === 'correct' || verdict === 'near-miss';
  if (!pass && attempts < 2) {
    progress.assessment = { ...focus, attemptsOnCurrent: attempts };
    return outbound;
  }
  const nextFocus = {
    ...focus,
    attemptsOnCurrent: attempts,
    taskOutcomes: {
      ...focus.taskOutcomes,
      [task.id]: pass ? ('pass' as const) : ('fail' as const),
    },
  };
  advanceAssessment(progress, pack, nextFocus, outbound, emptyTurnLog());
  return outbound;
}

function storyReaction(
  progress: Progress,
  pack: LessonPack,
  focus: PracticeFocus,
  beat: StoryBeat,
  userText: string,
  grade: GradeVerdict | null,
  source: 'code' | 'you',
  log: TurnLogDetail,
): TurnResult {
  const attempt = focus.attemptsOnCurrent + 1;
  const verdict = grade ? reactionVerdict(grade) : 'wrong';
  const passed = verdict === 'correct' || verdict === 'near_miss';
  const outbound: TypedMessage[] = [];
  let nextFocus: PracticeFocus = { ...focus, attemptsOnCurrent: attempt };
  let nextPrompts: TypedMessage[] = [];

  if (source === 'code') {
    if (passed || attempt >= 2) {
      if (passed) outbound.push(takePracticePraise(progress));
      nextPrompts = [];
      const outcome = passed
        ? verdict === 'near_miss'
          ? 'near-miss'
          : 'correct'
        : 'learned-with-help';
      advancePracticeAfterOutcome(progress, pack, nextFocus, beat.id, outcome, nextPrompts);
    } else {
      // Stay on the beat; clear coach template — do not call the model or re-present the line.
      nextFocus = { ...nextFocus, useAltLine: true };
      progress.practice = nextFocus;
      nextPrompts = [];
      const target =
        beat.kind === 'known' ? beat.acceptedAnswers[0] || beat.line.pt : beat.line.pt;
      outbound.push(makeRetryCoach(target));
      log.gradingSource = 'code';
      log.verdict = grade?.verdict ?? 'wrong';
      log.matchedAnswer = grade && 'matched' in grade ? grade.matched : null;
      log.finishReason = 'deterministic';
      log.itemId = beat.id;
      log.stage = beat.difficulty;
      log.messageTypes = outbound.map((m) => m.type);
      return {
        progress,
        messages: outbound,
        learnerVerdict: grade ? learnerVerdictFor(grade) : undefined,
        streamKind: 'none',
        log,
      };
    }
  }

  const nextBeat = progress.practice ? currentBeat(pack, progress.practice.beatIndex) : null;
  const nextLine =
    progress.practice?.phase === 'friend-bridge'
      ? pack.closingHook.pt
      : nextBeat && nextBeat.id !== beat.id
        ? nextBeat.line.pt
        : beat.altLine.pt;

  log.gradingSource = source === 'code' ? 'code' : 'model';
  log.verdict = grade?.verdict ?? null;
  log.matchedAnswer = grade && 'matched' in grade ? grade.matched : null;
  log.finishReason = source === 'code' ? 'model' : null;
  log.itemId = beat.id;
  log.stage = beat.difficulty;

  return {
    progress,
    messages: outbound,
    learnerVerdict: grade ? learnerVerdictFor(grade) : undefined,
    streamKind: 'lesson-reaction',
    log,
    modelContext: {
      item: beat,
      lesson: pack,
      userText,
      reaction: {
        ...buildReactionBase(progress, pack, beat, beat),
        mode: 'practice',
        verdict: source === 'you' ? 'wrong' : verdict,
        source,
        attempt,
        mistakeNote: grade ? mistakeNote(grade) : undefined,
        nextLine: source === 'code' ? nextLine : undefined,
        nextPrompt: nextPrompts[0],
        nextPrompts,
        slotPattern:
          source === 'you' && beat.kind === 'known'
            ? beat.acceptedAnswers.find((answer) => hasPersonalSlot(answer))
            : undefined,
      },
    },
  };
}

export function applyLearnerTurn(input: {
  progress: Progress;
  userText: string;
  action?: TurnAction;
  now?: number;
}): TurnResult {
  const progress = structuredClone(input.progress);
  const outbound: TypedMessage[] = [];
  const log = emptyTurnLog();
  log.mode = progress.mode;
  const script = classifyScript(input.userText);
  log.script = script;
  const action = input.action ?? { type: 'message' };

  if (action.type === 'start-practice') {
    const pack = lessonById(action.lessonId);
    if (!pack || pack.beats.length === 0) {
      log.verdict = 'missing-lesson';
      return { progress, messages: outbound, streamKind: 'none', log };
    }
    const focus = startPracticeFocus(pack.id);
    progress.mode = 'practice';
    progress.practice = focus;
    progress.assessment = null;
    const rec = lessonRecord(progress, pack.id);
    delete rec.paused;
    saveLesson(progress, rec);
    outbound.push(makeIntro(pack.introAr, pack.introArz));
    outbound.push(...presentBeat(pack, 0));
    progress.practice = withPreHintFlag(focus, pack, 0, false);
    log.mode = 'practice';
    log.lessonId = pack.id;
    log.stage = pack.beats[0].difficulty;
    log.itemId = pack.beats[0].id;
    log.messageTypes = outbound.map((m) => m.type);
    log.finishReason = 'deterministic';
    log.outputTokens = 0;
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  if (action.type === 'resume-practice') {
    const paused = Object.values(progress.lessons).find((r) => r.paused)?.paused;
    if (!paused) return { progress, messages: outbound, streamKind: 'none', log };
    const pack = lessonById(paused.lessonId);
    if (!pack) return { progress, messages: outbound, streamKind: 'none', log };
    progress.mode = 'practice';
    progress.practice = { ...paused };
    const rec = lessonRecord(progress, paused.lessonId);
    delete rec.paused;
    saveLesson(progress, rec);
    if (paused.phase === 'story') {
      outbound.push(...presentBeat(pack, paused.beatIndex, { alt: paused.useAltLine }));
      // Alt re-ask does not re-emit the tip; keep the paused flag.
      progress.practice = paused.useAltLine
        ? { ...progress.practice, coachTipShown: paused.coachTipShown }
        : withPreHintFlag(progress.practice, pack, paused.beatIndex, false);
    }
    log.mode = 'practice';
    log.lessonId = pack.id;
    log.messageTypes = outbound.map((m) => m.type);
    log.finishReason = 'deterministic';
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  if (action.type === 'end-practice') {
    if (progress.practice) {
      const rec = lessonRecord(progress, progress.practice.lessonId);
      rec.paused = structuredClone(progress.practice);
      saveLesson(progress, rec);
    }
    progress.mode = 'friend';
    progress.practice = null;
    log.mode = 'friend';
    log.verdict = 'paused';
    log.finishReason = 'deterministic';
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  if (action.type === 'show-coach-tip') {
    const focus = progress.practice;
    const pack = focus ? lessonById(focus.lessonId) : null;
    const beat = pack && focus ? currentBeat(pack, focus.beatIndex) : null;
    if (focus && beat?.coachTip && beat.difficulty === 'supported') {
      outbound.push(makeCoachTip(beat.coachTip.ar, beat.coachTip.arz));
      progress.practice = { ...focus, coachTipShown: true };
    }
    log.finishReason = 'deterministic';
    log.messageTypes = outbound.map((m) => m.type);
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  if (action.type === 'start-assessment') {
    const pack = lessonById(action.lessonId);
    if (!pack || !pack.assessmentAvailable || pack.assessmentTasks.length === 0) {
      return { progress, messages: outbound, streamKind: 'none', log };
    }
    progress.mode = 'assessment';
    progress.practice = null;
    progress.assessment = {
      lessonId: pack.id,
      taskIndex: 0,
      attemptsOnCurrent: 0,
      taskOutcomes: {},
    };
    const first = pack.assessmentTasks[0];
    outbound.push(makeAssessmentPrompt(first));
    log.mode = 'assessment';
    log.lessonId = pack.id;
    log.itemId = first.id;
    log.messageTypes = outbound.map((m) => m.type);
    log.finishReason = 'deterministic';
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  if (progress.mode === 'practice' && progress.practice) {
    const pack = lessonById(progress.practice.lessonId);
    log.lessonId = progress.practice.lessonId;
    if (!pack) {
      progress.mode = 'friend';
      progress.practice = null;
      return {
        progress,
        messages: outbound,
        streamKind: 'friend',
        log,
        modelContext: { userText: input.userText },
      };
    }
    const focus = progress.practice;
    if (focus.phase === 'friend-bridge') {
      return friendTurn(progress, pack, input.userText, input.now, log);
    }
    const beat = currentBeat(pack, focus.beatIndex);
    log.itemId = beat?.id ?? null;
    log.stage = beat?.difficulty ?? null;
    if (!beat) {
      const bridge = enterFriendBridge(progress, pack, focus, outbound);
      progress.practice = bridge;
      return { progress, messages: outbound, streamKind: 'none', log };
    }

    if (script === 'arabic-only') {
      log.gradingSource = 'none';
      log.verdict = 'side-remark';
      return {
        progress,
        messages: outbound,
        streamKind: 'lesson-reaction',
        log,
        modelContext: {
          item: beat,
          lesson: pack,
          userText: input.userText,
          reaction: {
            ...buildReactionBase(progress, pack, beat, beat),
            mode: 'side',
            verdict: 'correct',
            source: 'code',
            attempt: 1,
            nextLine: beat.altLine.pt,
            nextPrompts: presentBeat(pack, focus.beatIndex, { alt: true }),
            nextPrompt: presentBeat(pack, focus.beatIndex, { alt: true })[0],
          },
        },
      };
    }

    if (script !== 'latin') {
      log.verdict = 'ignored';
      return { progress, messages: outbound, streamKind: 'none', log };
    }

    const knownNoSlot =
      beat.kind === 'known' &&
      !hasPersonalSlot(beat.frame, ...(beat.acceptedAnswers ?? []));
    if (knownNoSlot) {
      const grade = gradeKnownAnswer(
        input.userText,
        beat.acceptedAnswers,
        beat.anticipatedWrong,
      );
      return storyReaction(progress, pack, focus, beat, input.userText, grade, 'code', log);
    }

    return storyReaction(progress, pack, focus, beat, input.userText, null, 'you', log);
  }

  if (progress.mode === 'assessment' && progress.assessment) {
    const pack = lessonById(progress.assessment.lessonId);
    log.mode = 'assessment';
    log.lessonId = progress.assessment.lessonId;
    if (!pack) {
      progress.mode = 'friend';
      progress.assessment = null;
      return {
        progress,
        messages: outbound,
        streamKind: 'friend',
        log,
        modelContext: { userText: input.userText },
      };
    }
    return handleAssessmentTurn(progress, pack, input.userText, script, outbound, log);
  }

  return friendTurn(progress, undefined, input.userText, input.now, log);
}

function friendTurn(
  progress: Progress,
  bridgePack: LessonPack | undefined,
  userText: string,
  now: number | undefined,
  log: TurnLogDetail,
): TurnResult {
  let bridgeLesson = bridgePack;
  if (!bridgeLesson && progress.practice?.phase === 'friend-bridge') {
    bridgeLesson = lessonById(progress.practice.lessonId) ?? undefined;
  }
  if (progress.practice?.phase === 'friend-bridge') {
    const left = progress.practice.friendBridgeTurnsLeft - 1;
    if (left <= 0) {
      const rec = lessonRecord(progress, progress.practice.lessonId);
      rec.practisedAt = now ?? Date.now();
      saveLesson(progress, rec);
      progress.lastPractisedLessonId = progress.practice.lessonId;
      progress.finishedLastTime = true;
      progress.practice = null;
    } else {
      progress.practice = { ...progress.practice, friendBridgeTurnsLeft: left };
    }
  }
  log.mode = 'friend';
  return {
    progress,
    messages: [],
    streamKind: 'friend',
    log,
    modelContext: {
      userText,
      lesson:
        bridgeLesson ??
        (progress.lastPractisedLessonId
          ? lessonById(progress.lastPractisedLessonId) ?? undefined
          : undefined),
    },
  };
}

function handleAssessmentTurn(
  progress: Progress,
  pack: LessonPack,
  userText: string,
  script: ReturnType<typeof classifyScript>,
  outbound: TypedMessage[],
  log: TurnLogDetail,
): TurnResult {
  const focus = progress.assessment!;
  const task = currentAssessmentTask(pack, focus.taskIndex);
  log.itemId = task?.id ?? null;
  if (!task) {
    progress.mode = 'friend';
    progress.assessment = null;
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  const promptPlain = task.line.pt;
  const beat = null;

  if (script === 'arabic-only') {
    log.verdict = 'side-remark';
    return {
      progress,
      messages: outbound,
      streamKind: 'lesson-reaction',
      log,
      modelContext: {
        item: task,
        lesson: pack,
        userText,
        reaction: {
          ...buildReactionBase(progress, pack, task, beat),
          mode: 'side',
          verdict: 'correct',
          source: 'code',
          attempt: 1,
          currentPromptPlain: promptPlain,
          nextPrompt: makeAssessmentPrompt(task),
        },
      },
    };
  }

  if (script !== 'latin') {
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  log.gradingSource = 'model';
  return {
    progress,
    messages: outbound,
    streamKind: 'lesson-reaction',
    log,
    modelContext: {
      item: task,
      lesson: pack,
      userText,
      reaction: {
        ...buildReactionBase(progress, pack, task, beat),
        mode: 'assessment',
        verdict: 'wrong',
        source: 'you',
        attempt: focus.attemptsOnCurrent + 1,
        currentPromptPlain: promptPlain,
      },
    },
  };
}

function advanceAssessment(
  progress: Progress,
  pack: LessonPack,
  focus: NonNullable<Progress['assessment']>,
  outbound: TypedMessage[],
  log: TurnLogDetail,
): TurnResult {
  const nextIndex = focus.taskIndex + 1;
  if (nextIndex >= pack.assessmentTasks.length) {
    const byTarget: Record<string, 'pass' | 'fail'> = {};
    const resultSegments: import('./lessons/types').AuthoredSegment[] = [
      { lang: 'ar', text: 'نتيجة الاختبار:', pronunciation: 'نَتيجة الاِخْتِبار:' },
    ];
    for (const task of pack.assessmentTasks) {
      const outcome = focus.taskOutcomes[task.id] ?? 'fail';
      byTarget[task.target] = outcome;
      resultSegments.push(...(outcome === 'pass' ? task.passSummary : task.reviewSummary));
    }
    outbound.push(makeMixed('results', resultSegments));
    const rec = lessonRecord(progress, pack.id);
    rec.assessmentByTarget = byTarget;
    rec.lastAssessedAt = Date.now();
    saveLesson(progress, rec);
    progress.mode = 'friend';
    progress.assessment = null;
    log.messageTypes = outbound.map((m) => m.type);
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  const nextTask = pack.assessmentTasks[nextIndex];
  progress.assessment = { ...focus, taskIndex: nextIndex, attemptsOnCurrent: 0 };
  outbound.push(makeAssessmentPrompt(nextTask));
  log.messageTypes = outbound.map((m) => m.type);
  return { progress, messages: outbound, streamKind: 'none', log };
}

export function stageProgressLabel(
  pack: LessonPack,
  focus: PracticeFocus,
): {
  stages: { id: string; label: string; state: 'done' | 'current' | 'todo' }[];
  detail: string | null;
} {
  const currentScene =
    focus.phase === 'friend-bridge' ? null : pack.beats[focus.beatIndex]?.sceneId;
  const currentIdx = pack.scenes.findIndex((scene) => scene.id === currentScene);
  const stages = pack.scenes.map((scene, i) => ({
    id: scene.id,
    label: scene.titleAr,
    state: (focus.phase === 'friend-bridge' || (currentIdx >= 0 && i < currentIdx)
      ? 'done'
      : i === currentIdx
        ? 'current'
        : 'todo') as 'done' | 'current' | 'todo',
  }));
  const total = pack.beats.length;
  const pos =
    focus.phase === 'friend-bridge' ? total : Math.min(focus.beatIndex + 1, total);
  return { stages, detail: total > 0 ? `${pos} / ${total}` : null };
}

export { ASSESSMENT_COOLDOWN_MS, FRIEND_BRIDGE_TURNS, availableLessons };
