import { lessonById, liveLessons, testLessons } from './lessons/catalogue';
import { allBeatsResolved, nextUnresolvedBeat, practiceChecklistSummary } from './lessons/alignment';
import type { AssessmentTask, LessonPack, StoryBeat } from './lessons/types';
import type { GradeVerdict } from './grade';
import {
  classifyScript,
  extractPersonalSlotValue,
  gradeFilledPersonalSlot,
  gradeKnownAnswer,
  hasPersonalSlot,
  isArabicWhyQuestion,
  isStuckMessage,
  matchesFilledPersonalSlot,
  mentionsLessonTool,
  slotNoteForPattern,
} from './grade';
import { wordsForReaction } from './friendPrompt';
import {
  beatShowsPreHint,
  currentAssessmentTask,
  currentBeat,
  makeAssessmentPrompt,
  makeCharacterLine,
  makeChecklistDone,
  makeCoachNote,
  makeCoachTip,
  makeFinalTaskPrompt,
  makeGrammarCardMessage,
  makeHintCardMessage,
  makeLineExplainCoach,
  makeMixed,
  makeNearMissFixCoach,
  makePraise,
  makeYallaNesta3melha,
  presentBeat,
  presentBeatHead,
  presentBeatTail,
  presentClosing,
  presentFarewell,
  presentLessonEndingAids,
  makeIntro,
  makeSceneWordCardMessage,
  sceneNeedsWordCard,
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
    if (focus.phase === 'story' && !focus.sceneWordGate && !focus.coachTipShown) {
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
    stuckCountOnCurrent: 0,
    itemOutcomes: {},
    phase: 'story',
    friendBridgeTurnsLeft: 0,
    useAltLine: false,
    coachTipShown: false,
    sceneWordGate: null,
    sceneWordCardsSeen: [],
  };
}

/**
 * Emit narration (if any) and either gate on a word card or continue with the
 * beat tip/character. Returns the focus after presentation.
 */
function presentBeatWithWordGate(
  progress: Progress,
  pack: LessonPack,
  focus: PracticeFocus,
  beatIndex: number,
  outbound: TypedMessage[],
  opts?: { alt?: boolean },
): PracticeFocus {
  if (opts?.alt) {
    outbound.push(...presentBeat(pack, beatIndex, { alt: true }));
    progress.practice = { ...focus, beatIndex, useAltLine: true, coachTipShown: false, sceneWordGate: null };
    return progress.practice;
  }

  const beat = currentBeat(pack, beatIndex);
  if (!beat) {
    progress.practice = focus;
    return focus;
  }

  outbound.push(...presentBeatHead(pack, beatIndex));

  if (sceneNeedsWordCard(pack, beatIndex, focus)) {
    const card = makeSceneWordCardMessage(pack, beat.sceneId);
    if (card) outbound.push(card);
    const next: PracticeFocus = {
      ...focus,
      beatIndex,
      useAltLine: false,
      coachTipShown: false,
      sceneWordGate: { sceneId: beat.sceneId, beatIndex },
    };
    progress.practice = next;
    return next;
  }

  outbound.push(...presentBeatTail(pack, beatIndex));
  const next = withPreHintFlag(
    {
      ...focus,
      beatIndex,
      useAltLine: false,
      sceneWordGate: null,
    },
    pack,
    beatIndex,
    false,
  );
  progress.practice = next;
  return next;
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

/** Model-graded practice pass: praise only on correct (never near-miss). */
export function shouldEmitPracticePraise(
  reaction: Pick<LessonReactionContext, 'mode' | 'source'>,
  verdict: string | null | undefined,
): boolean {
  if (reaction.mode !== 'practice' || reaction.source !== 'you') return false;
  return verdict === 'correct';
}

/** Raw coach tip already on screen (pre-hint for guided/supported). */
function shownCoachTip(progress: Progress, unit: GradedUnit): string | undefined {
  if (!('coachTip' in unit) || !('difficulty' in unit)) return undefined;
  const text = unit.coachTip?.ar?.trim();
  if (!text) return undefined;
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
  const line = unit.line;
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
    codeGuard: unit.kind === 'open' ? unit.codeGuard : undefined,
    frame: unit.frame,
    coachTip: shownCoachTip(progress, unit),
    wordBank: unit.wordBank?.length
      ? unit.wordBank.map((word) => (word.meaning ? `${word.pt} (${word.meaning})` : word.pt)).join(' | ')
      : undefined,
    currentPromptPlain: line.pt,
    lineAr: line.ar,
    recentPraise: progress.recentPraise ?? [],
    characterName: beat?.speaker || pack.character.name,
    characterRole: pack.character.roleAr,
    sceneTitle: sceneTitle(pack, beat),
    beatLine: line.pt,
    reactionCue: beat?.reactionCue,
    words: wordsForReaction(pack),
    recentCharacterReactions: progress.recentCharacterReactions ?? [],
    grammarPoint: pack.learningTarget,
  };
}

function nearMissFixMessage(grade: GradeVerdict, beat: StoryBeat): TypedMessage {
  const authored = mistakeNote(grade);
  if (authored) return makeCoachNote(authored);
  if (grade.verdict === 'near-miss' && grade.fixNote?.trim()) {
    return makeCoachNote(grade.fixNote.trim());
  }
  if (grade.verdict === 'near-miss' && grade.correctedWord?.trim()) {
    return makeNearMissFixCoach(grade.correctedWord.trim());
  }
  const accepted =
    grade.verdict === 'near-miss' || grade.verdict === 'anticipated-wrong' || grade.verdict === 'correct'
      ? grade.matched
      : beat.kind === 'known'
        ? beat.acceptedAnswers[0]
        : beat.line.pt;
  const word = (accepted || beat.line.pt).trim().split(/\s+/).pop() || accepted || beat.line.pt;
  return makeNearMissFixCoach(word);
}

function wrongAttemptCoach(grade: GradeVerdict | null, beat: StoryBeat, attempt: number): TypedMessage {
  if (attempt >= 2) {
    const why = beat.whyNote?.trim();
    if (why) return makeCoachNote(why);
    const accepted = beat.kind === 'known' ? beat.acceptedAnswers[0] : beat.line.pt;
    return makeCoachNote(`الإجابة: ${accepted || '…'}`);
  }
  const anticipated = grade ? mistakeNote(grade) : undefined;
  if (anticipated) return makeCoachNote(anticipated);
  if (beat.hintNote?.trim()) return makeCoachNote(beat.hintNote.trim());
  const tip = beat.coachTip?.ar?.trim();
  if (tip) {
    const base = tip.replace(/[.。…]+$/u, '').trim();
    return makeCoachNote(`${base}. جرّب تاني.`);
  }
  return makeCoachNote('جرّب تاني.', 'جَرِّب تاني.');
}

/** Grammar card + يلا نستخدمها + alt character line. Does not advance the beat. */
function emitGrammarCardSequence(
  pack: LessonPack,
  focus: PracticeFocus,
  beat: StoryBeat,
  outbound: TypedMessage[],
): void {
  if (pack.grammarCard) {
    outbound.push(makeGrammarCardMessage(pack.grammarCard));
  }
  outbound.push(makeYallaNesta3melha());
  const alt = presentBeat(pack, focus.beatIndex, { alt: true });
  const character = alt.find((message) => message.type === 'character');
  if (character) outbound.push(character);
  else outbound.push(...alt);
}

/**
 * Stuck ladder (??? / مش فاهم): never increments wrong attempts.
 * 1 → line_explain + hint card; 2 → hint_note; 3 → why_note + learned-with-help.
 */
function handleStuckTurn(
  progress: Progress,
  pack: LessonPack,
  focus: PracticeFocus,
  beat: StoryBeat,
  log: TurnLogDetail,
): TurnResult {
  const outbound: TypedMessage[] = [];
  const stuckCount = (focus.stuckCountOnCurrent ?? 0) + 1;
  log.gradingSource = 'none';
  log.verdict = `stuck-${stuckCount}`;

  if (stuckCount === 1) {
    if (beat.lineExplain?.ar?.trim()) {
      outbound.push(makeLineExplainCoach(beat.lineExplain));
    } else if (beat.coachTip?.ar?.trim()) {
      outbound.push(makeCoachNote(beat.coachTip.ar, beat.coachTip.arz));
    } else {
      outbound.push(makeCoachNote('هي بتسألك حاجة بسيطة. فكّر في الجملة اللي تناسب السؤال.'));
    }
    const words = (beat.wordBank ?? []).slice(0, 5);
    if (beat.frame || words.length) {
      outbound.push(
        makeHintCardMessage({
          frame: beat.frame,
          words,
        }),
      );
    }
    progress.practice = { ...focus, stuckCountOnCurrent: stuckCount };
    log.messageTypes = outbound.map((m) => m.type);
    log.finishReason = 'deterministic';
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  if (stuckCount === 2) {
    if (beat.hintNote?.trim()) outbound.push(makeCoachNote(beat.hintNote.trim()));
    else outbound.push(wrongAttemptCoach(null, beat, 1));
    progress.practice = { ...focus, stuckCountOnCurrent: stuckCount };
    log.messageTypes = outbound.map((m) => m.type);
    log.finishReason = 'deterministic';
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  if (beat.whyNote?.trim()) outbound.push(makeCoachNote(beat.whyNote.trim()));
  else outbound.push(wrongAttemptCoach(null, beat, 2));
  advancePracticeAfterOutcome(
    progress,
    pack,
    { ...focus, stuckCountOnCurrent: stuckCount },
    beat.id,
    'learned-with-help',
    outbound,
  );
  log.messageTypes = outbound.map((m) => m.type);
  log.finishReason = 'deterministic';
  return { progress, messages: outbound, streamKind: 'none', log };
}

function handleGrammarCardTurn(
  progress: Progress,
  pack: LessonPack,
  focus: PracticeFocus,
  beat: StoryBeat,
  log: TurnLogDetail,
): TurnResult {
  const outbound: TypedMessage[] = [];
  emitGrammarCardSequence(pack, focus, beat, outbound);
  log.gradingSource = 'none';
  log.verdict = 'grammar-card';
  log.messageTypes = outbound.map((m) => m.type);
  log.finishReason = 'deterministic';
  return { progress, messages: outbound, streamKind: 'none', log };
}

function followUpMessages(pack: LessonPack, fromIndex: number, alt: boolean): TypedMessage[] {
  // Kept for callers that only need the full beat (alt re-ask / fallbacks).
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
    stuckCountOnCurrent: 0,
    useAltLine: false,
    coachTipShown: false,
    sceneWordGate: null,
  };
  progress.mode = 'friend';
  progress.practice = next;
  return next;
}

/**
 * After the last story beat: replay + summary + first immediate final task (v5).
 * Packs without assessment tasks still show ending aids, then the friend bridge.
 * Does not write formal assessment results (12h assessment stays separate).
 */
function enterFinalTaskPhase(
  progress: Progress,
  pack: LessonPack,
  focus: PracticeFocus,
  outbound: TypedMessage[],
): PracticeFocus {
  outbound.push(...presentLessonEndingAids(pack));
  const tasks = pack.assessmentTasks;
  if (tasks.length === 0) {
    return enterFriendBridge(progress, pack, focus, outbound);
  }
  outbound.push(makeFinalTaskPrompt(tasks[0]));
  const next: PracticeFocus = {
    ...focus,
    phase: 'final-task',
    finalTaskIndex: 0,
    finalTaskAttempts: 0,
    finalTaskOutcomes: {},
    beatIndex: pack.beats.length,
    attemptsOnCurrent: 0,
    stuckCountOnCurrent: 0,
    useAltLine: false,
    coachTipShown: false,
    sceneWordGate: null,
  };
  progress.mode = 'practice';
  progress.practice = next;
  return next;
}

function advanceFinalTask(
  progress: Progress,
  pack: LessonPack,
  focus: PracticeFocus,
  taskId: string,
  outcome: 'pass' | 'fail',
  outbound: TypedMessage[],
): PracticeFocus {
  const outcomes = { ...(focus.finalTaskOutcomes ?? {}), [taskId]: outcome };
  const nextIndex = (focus.finalTaskIndex ?? 0) + 1;
  if (nextIndex >= pack.assessmentTasks.length) {
    return enterFriendBridge(
      progress,
      pack,
      { ...focus, finalTaskOutcomes: outcomes, finalTaskIndex: nextIndex },
      outbound,
    );
  }
  const nextTask = pack.assessmentTasks[nextIndex];
  outbound.push(makeFinalTaskPrompt(nextTask));
  const next: PracticeFocus = {
    ...focus,
    phase: 'final-task',
    finalTaskIndex: nextIndex,
    finalTaskAttempts: 0,
    finalTaskOutcomes: outcomes,
  };
  progress.practice = next;
  return next;
}

function finalTaskWrongCoach(task: AssessmentTask, attempt: number): TypedMessage {
  if (attempt >= 2) {
    const why = task.whyNote?.trim();
    if (why) return makeCoachNote(why);
    const accepted = task.kind === 'known' ? task.acceptedAnswers[0] : '';
    return makeCoachNote(accepted ? `الإجابة: ${accepted}` : 'خلّينا نكمّل.');
  }
  if (task.nudgeNote?.trim()) return makeCoachNote(task.nudgeNote.trim());
  if (task.hintNote?.trim()) return makeCoachNote(task.hintNote.trim());
  return makeCoachNote('جرّب تاني.', 'جَرِّب تاني.');
}

function handleFinalTaskTurn(
  progress: Progress,
  pack: LessonPack,
  focus: PracticeFocus,
  userText: string,
  script: ReturnType<typeof classifyScript>,
  log: TurnLogDetail,
): TurnResult {
  const outbound: TypedMessage[] = [];
  const taskIndex = focus.finalTaskIndex ?? 0;
  const task = pack.assessmentTasks[taskIndex];
  log.mode = 'practice';
  log.lessonId = pack.id;
  log.itemId = task?.id ?? null;
  log.stage = 'final-task';

  if (!task) {
    enterFriendBridge(progress, pack, focus, outbound);
    log.messageTypes = outbound.map((m) => m.type);
    log.finishReason = 'deterministic';
    return { progress, messages: outbound, streamKind: 'none', log };
  }

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
          ...buildReactionBase(progress, pack, task, null),
          mode: 'side',
          verdict: 'correct',
          source: 'code',
          attempt: 1,
          reactionKind: 'r3',
          currentPromptPlain: task.line.pt || task.line.ar,
          nextPrompt: makeFinalTaskPrompt(task),
        },
      },
    };
  }

  if (script !== 'latin') {
    log.verdict = 'ignored';
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  // Open final tasks still need R2.
  if (task.kind === 'open') {
    log.gradingSource = 'model';
    log.reactionModel = 'r2';
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
          ...buildReactionBase(progress, pack, task, null),
          mode: 'practice',
          verdict: 'wrong',
          source: 'you',
          attempt: (focus.finalTaskAttempts ?? 0) + 1,
          reactionKind: 'r2',
          currentPromptPlain: task.line.pt || task.line.ar,
        },
      },
    };
  }

  const grade = gradeKnownAnswer(userText, task.acceptedAnswers, task.anticipatedWrong);
  const attempt = (focus.finalTaskAttempts ?? 0) + 1;
  const verdict = reactionVerdict(grade);
  const passed = verdict === 'correct' || verdict === 'near_miss';

  if (passed) {
    if (verdict === 'near_miss') {
      const authored = mistakeNote(grade);
      if (authored) outbound.push(makeCoachNote(authored));
      else if (grade.verdict === 'near-miss' && grade.fixNote?.trim()) {
        outbound.push(makeCoachNote(grade.fixNote.trim()));
      } else if (grade.verdict === 'near-miss' && grade.correctedWord?.trim()) {
        outbound.push(makeNearMissFixCoach(grade.correctedWord.trim()));
      }
    } else {
      outbound.push(takePracticePraise(progress));
    }
    advanceFinalTask(progress, pack, { ...focus, finalTaskAttempts: attempt }, task.id, 'pass', outbound);
    log.gradingSource = 'code';
    log.verdict = grade.verdict;
    log.matchedAnswer = 'matched' in grade ? grade.matched : null;
    log.finishReason = 'deterministic';
    log.messageTypes = outbound.map((m) => m.type);
    return {
      progress,
      messages: outbound,
      learnerVerdict: learnerVerdictFor(grade),
      streamKind: 'none',
      log,
    };
  }

  outbound.push(finalTaskWrongCoach(task, attempt));
  if (attempt >= 2) {
    advanceFinalTask(progress, pack, { ...focus, finalTaskAttempts: attempt }, task.id, 'fail', outbound);
  } else {
    progress.practice = { ...focus, finalTaskAttempts: attempt };
  }
  log.gradingSource = 'code';
  log.verdict = grade.verdict;
  log.finishReason = 'deterministic';
  log.messageTypes = outbound.map((m) => m.type);
  return { progress, messages: outbound, streamKind: 'none', log };
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
    stuckCountOnCurrent: 0,
    useAltLine: false,
    coachTipShown: false,
    sceneWordGate: null,
  };
  const idx = nextUnresolvedBeat(pack.beats, next.itemOutcomes, from < 0 ? 0 : from + 1);
  if (idx < 0) {
    if (allBeatsResolved(pack.beats, next.itemOutcomes)) {
      return enterFinalTaskPhase(progress, pack, next, outbound);
    }
    progress.practice = next;
    return next;
  }
  next.phase = 'story';
  return presentBeatWithWordGate(progress, pack, next, idx, outbound);
}

export function unresolvedPracticePrompt(
  progress: Progress,
  pack: LessonPack,
): TypedMessage | undefined {
  const focus = progress.practice;
  if (!focus || focus.phase !== 'story') return undefined;
  if (focus.sceneWordGate) return undefined;
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

/** After Prompt 4 grades an open beat, final task, or assessment task. */
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
  if (!focus) return [];

  // Immediate end-of-lesson final task (practice-only; no formal assessment write).
  if (focus.phase === 'final-task') {
    const task =
      pack.assessmentTasks.find((item) => item.id === unitId) ??
      pack.assessmentTasks[focus.finalTaskIndex ?? 0];
    if (!task) return [];
    const outbound: TypedMessage[] = [];
    const attempts = (focus.finalTaskAttempts ?? 0) + 1;
    if (verdict === 'correct' || verdict === 'near-miss') {
      advanceFinalTask(
        progress,
        pack,
        { ...focus, finalTaskAttempts: attempts },
        task.id,
        'pass',
        outbound,
      );
      return outbound;
    }
    outbound.push(finalTaskWrongCoach(task, attempts));
    if (attempts >= 2) {
      advanceFinalTask(
        progress,
        pack,
        { ...focus, finalTaskAttempts: attempts },
        task.id,
        'fail',
        outbound,
      );
    } else {
      progress.practice = { ...focus, finalTaskAttempts: attempts };
    }
    return outbound;
  }

  if (focus.phase !== 'story') return [];
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
    outbound.push(wrongAttemptCoach(null, beat, 2));
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
  outbound.push(wrongAttemptCoach(null, beat, 1));
  progress.practice = {
    ...focus,
    attemptsOnCurrent: attempts,
    useAltLine: true,
  };
  // Coach hint / tip fallback — do not re-present the character line; frame stays.
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
  opts?: { slotNote?: string },
): TurnResult {
  const attempt = focus.attemptsOnCurrent + 1;
  const verdict = grade ? reactionVerdict(grade) : 'wrong';
  const passed = verdict === 'correct' || verdict === 'near_miss';
  const outbound: TypedMessage[] = [];
  let nextFocus: PracticeFocus = { ...focus, attemptsOnCurrent: attempt };
  const nextPrompts: TypedMessage[] = [];

  // Known wrong attempts: pack notes only, no model.
  if (source === 'code' && !passed) {
    outbound.push(wrongAttemptCoach(grade, beat, attempt));
    if (attempt >= 2) {
      advancePracticeAfterOutcome(
        progress,
        pack,
        nextFocus,
        beat.id,
        'learned-with-help',
        nextPrompts,
      );
      outbound.push(...nextPrompts);
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
        learnerVerdict: undefined,
        streamKind: 'none',
        log,
      };
    }
    nextFocus = { ...nextFocus, useAltLine: true };
    progress.practice = nextFocus;
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
      learnerVerdict: undefined,
      streamKind: 'none',
      log,
    };
  }

  if (source === 'code' && passed) {
    // Near-miss: no praise; show pack/template fix, then reply or R1.
    if (verdict === 'near_miss') {
      outbound.push(nearMissFixMessage(grade!, beat));
    } else {
      outbound.push(takePracticePraise(progress));
    }
    advancePracticeAfterOutcome(
      progress,
      pack,
      nextFocus,
      beat.id,
      verdict === 'near_miss' ? 'near-miss' : 'correct',
      nextPrompts,
    );

    // v4: authored reply replaces the live R1 reaction for ordinary known beats.
    if (beat.reply !== undefined) {
      const replyPt = beat.reply.pt?.trim() || '';
      const needsSlotR1 = !replyPt && Boolean(opts?.slotNote);
      if (!needsSlotR1) {
        if (replyPt) {
          outbound.push(
            makeCharacterLine(beat.speaker, {
              pt: beat.reply.pt,
              ar: beat.reply.ar || '',
              arz: beat.reply.arz || beat.reply.ar || '',
            }),
          );
        }
        outbound.push(...nextPrompts);
        log.gradingSource = 'code';
        log.verdict = grade?.verdict ?? null;
        log.matchedAnswer = grade && 'matched' in grade ? grade.matched : null;
        log.finishReason = 'deterministic';
        log.itemId = beat.id;
        log.stage = beat.difficulty;
        log.reactionModel = null;
        log.messageTypes = outbound.map((m) => m.type);
        return {
          progress,
          messages: outbound,
          learnerVerdict: grade ? learnerVerdictFor(grade) : undefined,
          streamKind: 'none',
          log,
        };
      }
      // Empty reply + personal slot with his value → still call R1.
    }
  }

  const nextBeat = progress.practice ? currentBeat(pack, progress.practice.beatIndex) : null;
  const nextLine =
    progress.practice?.phase === 'friend-bridge'
      ? pack.closingHook.pt
      : nextBeat && nextBeat.id !== beat.id
        ? nextBeat.line.pt
        : undefined;
  const nextSpeaker =
    progress.practice?.phase === 'friend-bridge'
      ? pack.closingHook.speaker?.trim() || pack.character.name
      : nextBeat && nextBeat.id !== beat.id
        ? nextBeat.speaker
        : undefined;

  const slotPattern =
    beat.kind === 'known'
      ? beat.acceptedAnswers.find((answer) => hasPersonalSlot(answer))
      : undefined;

  // After a near-miss, pass the corrected accepted answer so R1 never repeats the slip.
  const answerForReaction =
    verdict === 'near_miss' && grade && 'matched' in grade && grade.matched
      ? grade.matched
      : userText;

  log.gradingSource = source === 'code' ? 'code' : 'model';
  log.verdict = grade?.verdict ?? null;
  log.matchedAnswer = grade && 'matched' in grade ? grade.matched : null;
  log.finishReason = source === 'code' ? 'model' : null;
  log.itemId = beat.id;
  log.stage = beat.difficulty;
  log.reactionModel = source === 'you' ? 'r2' : 'r1';

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
        reactionKind: source === 'you' ? 'r2' : 'r1',
        mistakeNote: grade ? mistakeNote(grade) : undefined,
        nextLine,
        nextSpeaker,
        nextPrompt: nextPrompts[0],
        nextPrompts,
        slotPattern: source === 'you' ? slotPattern : undefined,
        slotNote: opts?.slotNote,
        answerForReaction,
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
    presentBeatWithWordGate(progress, pack, focus, 0, outbound);
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
    progress.practice = {
      ...paused,
      sceneWordCardsSeen: paused.sceneWordCardsSeen ?? [],
      sceneWordGate: paused.sceneWordGate ?? null,
    };
    const rec = lessonRecord(progress, paused.lessonId);
    delete rec.paused;
    saveLesson(progress, rec);
    if (paused.phase === 'story') {
      if (paused.sceneWordGate) {
        // Mid-card: re-show narration + scene-words; gate stays until dismiss.
        outbound.push(...presentBeatHead(pack, paused.beatIndex, { alt: paused.useAltLine }));
        const card = makeSceneWordCardMessage(pack, paused.sceneWordGate.sceneId);
        if (card) outbound.push(card);
        progress.practice = {
          ...progress.practice,
          coachTipShown: false,
          sceneWordGate: paused.sceneWordGate,
        };
      } else if (paused.useAltLine) {
        outbound.push(...presentBeat(pack, paused.beatIndex, { alt: true }));
        progress.practice = { ...progress.practice, coachTipShown: paused.coachTipShown };
      } else {
        outbound.push(...presentBeat(pack, paused.beatIndex));
        progress.practice = withPreHintFlag(progress.practice, pack, paused.beatIndex, false);
      }
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
    if (focus?.sceneWordGate) {
      log.verdict = 'awaiting-scene-words';
      log.finishReason = 'deterministic';
      return { progress, messages: outbound, streamKind: 'none', log };
    }
    if (focus && beat?.coachTip && beat.difficulty === 'supported') {
      outbound.push(
        makeCoachTip(beat.coachTip.ar, beat.coachTip.arz, {
          showWhyChip: Boolean(pack?.grammarCard),
        }),
      );
      progress.practice = { ...focus, coachTipShown: true };
    }
    log.finishReason = 'deterministic';
    log.messageTypes = outbound.map((m) => m.type);
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  if (action.type === 'show-grammar-card') {
    const focus = progress.practice;
    const pack = focus ? lessonById(focus.lessonId) : null;
    const beat = pack && focus ? currentBeat(pack, focus.beatIndex) : null;
    if (focus?.sceneWordGate) {
      log.verdict = 'awaiting-scene-words';
      log.finishReason = 'deterministic';
      return { progress, messages: outbound, streamKind: 'none', log };
    }
    if (focus && pack && beat && pack.grammarCard && focus.phase === 'story') {
      return handleGrammarCardTurn(progress, pack, focus, beat, log);
    }
    log.finishReason = 'deterministic';
    return { progress, messages: outbound, streamKind: 'none', log };
  }

  if (action.type === 'dismiss-scene-word-card') {
    const focus = progress.practice;
    const pack = focus ? lessonById(focus.lessonId) : null;
    const gate = focus?.sceneWordGate;
    if (!focus || !pack || !gate || focus.phase !== 'story') {
      log.finishReason = 'deterministic';
      return { progress, messages: outbound, streamKind: 'none', log };
    }
    const beatIndex = gate.beatIndex;
    const beat = currentBeat(pack, beatIndex);
    const seen = new Set(focus.sceneWordCardsSeen ?? []);
    if (gate.sceneId) seen.add(gate.sceneId);
    outbound.push(...presentBeatTail(pack, beatIndex));
    const next = withPreHintFlag(
      {
        ...focus,
        beatIndex,
        sceneWordGate: null,
        sceneWordCardsSeen: [...seen],
        useAltLine: false,
      },
      pack,
      beatIndex,
      false,
    );
    progress.practice = next;
    log.mode = 'practice';
    log.lessonId = pack.id;
    log.itemId = beat?.id ?? null;
    log.stage = beat?.difficulty ?? null;
    log.verdict = 'scene-words-dismissed';
    log.messageTypes = outbound.map((m) => m.type);
    log.finishReason = 'deterministic';
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
    if (focus.phase === 'final-task') {
      return handleFinalTaskTurn(progress, pack, focus, input.userText, script, log);
    }
    const beat = currentBeat(pack, focus.beatIndex);
    log.itemId = beat?.id ?? null;
    log.stage = beat?.difficulty ?? null;
    if (!beat) {
      const bridge = enterFriendBridge(progress, pack, focus, outbound);
      progress.practice = bridge;
      return { progress, messages: outbound, streamKind: 'none', log };
    }

    if (focus.sceneWordGate) {
      log.gradingSource = 'none';
      log.verdict = 'awaiting-scene-words';
      log.finishReason = 'deterministic';
      return { progress, messages: outbound, streamKind: 'none', log };
    }

    if (isStuckMessage(input.userText)) {
      return handleStuckTurn(progress, pack, focus, beat, log);
    }

    // Tool-why may mix Arabic with Portuguese words (ليه بنقول queria مش quero؟),
    // so do not require arabic-only script.
    if (
      isArabicWhyQuestion(input.userText) &&
      pack.grammarCard &&
      mentionsLessonTool(input.userText, pack, beat)
    ) {
      return handleGrammarCardTurn(progress, pack, focus, beat, log);
    }

    if (script === 'arabic-only') {
      log.gradingSource = 'none';
      log.verdict = 'side-remark';
      const alt = presentBeat(pack, focus.beatIndex, { alt: true });
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
            reactionKind: 'r3',
            nextLine: beat.altLine.pt,
            nextPrompts: alt,
            nextPrompt: alt[0],
          },
        },
      };
    }

    if (script !== 'latin') {
      log.verdict = 'ignored';
      return { progress, messages: outbound, streamKind: 'none', log };
    }

    if (beat.kind === 'known') {
      const slotPatterns = beat.acceptedAnswers.filter((answer) => hasPersonalSlot(answer));
      if (slotPatterns.length) {
        const slotGrade = gradeFilledPersonalSlot(input.userText, slotPatterns);
        if (slotGrade?.verdict === 'correct') {
          const pattern = slotGrade.matched;
          const value = extractPersonalSlotValue(input.userText, pattern);
          return storyReaction(
            progress,
            pack,
            focus,
            beat,
            input.userText,
            slotGrade,
            'code',
            log,
            value ? { slotNote: slotNoteForPattern(pattern, value) } : undefined,
          );
        }
        // Anticipated Brazilian / wrong frames (e.g. Me chamo [NAME]) before R2.
        for (const entry of beat.anticipatedWrong) {
          if (!hasPersonalSlot(entry.answer)) continue;
          if (!matchesFilledPersonalSlot(input.userText, entry.answer)) continue;
          return storyReaction(
            progress,
            pack,
            focus,
            beat,
            input.userText,
            {
              verdict: 'anticipated-wrong',
              matched: entry.answer,
              feedback: entry.feedback,
              authoredVerdict: entry.verdict === 'near_miss' ? 'near_miss' : 'wrong',
            },
            'code',
            log,
          );
        }
        return storyReaction(progress, pack, focus, beat, input.userText, null, 'you', log);
      }
      const grade = gradeKnownAnswer(
        input.userText,
        beat.acceptedAnswers,
        beat.anticipatedWrong,
      );
      return storyReaction(progress, pack, focus, beat, input.userText, grade, 'code', log);
    }

    // Open beat → R2, then code guard in the chat route.
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
  const farewellMessages: TypedMessage[] = [];
  if (progress.practice?.phase === 'friend-bridge') {
    const left = progress.practice.friendBridgeTurnsLeft - 1;
    if (left <= 0) {
      const packForFarewell = bridgeLesson ?? lessonById(progress.practice.lessonId) ?? undefined;
      if (packForFarewell) {
        const farewell = presentFarewell(packForFarewell);
        if (farewell) farewellMessages.push(farewell);
      }
      console.log(
        '[lesson_reaction_calls]',
        progress.practice.lessonId,
        progress.practice.reactionCalls ?? 0,
      );
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
    messages: farewellMessages,
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
          reactionKind: 'r3',
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
        reactionKind: 'r2',
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
  const storyDone = focus.phase === 'friend-bridge' || focus.phase === 'final-task';
  const currentScene = storyDone ? null : pack.beats[focus.beatIndex]?.sceneId;
  const currentIdx = pack.scenes.findIndex((scene) => scene.id === currentScene);
  const stages = pack.scenes.map((scene, i) => ({
    id: scene.id,
    label: scene.titleAr,
    state: (storyDone || (currentIdx >= 0 && i < currentIdx)
      ? 'done'
      : i === currentIdx
        ? 'current'
        : 'todo') as 'done' | 'current' | 'todo',
  }));
  const total = pack.beats.length;
  const pos = storyDone ? total : Math.min(focus.beatIndex + 1, total);
  const detail =
    focus.phase === 'final-task' && pack.assessmentTasks.length
      ? `مهمة ${(focus.finalTaskIndex ?? 0) + 1} / ${pack.assessmentTasks.length}`
      : total > 0
        ? `${pos} / ${total}`
        : null;
  return { stages, detail };
}

export { ASSESSMENT_COOLDOWN_MS, FRIEND_BRIDGE_TURNS, availableLessons };
