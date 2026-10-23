import { lessonById } from './lessons/catalogue';
import type { SceneWord } from './lessons/types';
import { chipsFor, stageProgressLabel, availableLessons } from './turn';
import { wordsForScene } from './messages';
import type { Chip, LearnerFile, TypedMessage } from './progressTypes';

export type StageHeader = {
  stages: { id: string; label: string; state: 'done' | 'current' | 'todo' }[];
  detail: string | null;
};

export type AssessmentHeader = {
  targets: { target: string; state: 'done' | 'current' | 'todo'; outcome?: 'pass' | 'fail' }[];
};

export type SceneWordCardView = {
  sceneId: string;
  titleAr?: string;
  words: SceneWord[];
  /** blocking = must dismiss before the beat continues; review = reopen only. */
  mode: 'blocking' | 'review';
};

export type LearnerView = {
  id: string;
  level: LearnerFile['level'];
  mode: LearnerFile['progress']['mode'];
  messages: TypedMessage[];
  chips: Chip[];
  practiceHeader: StageHeader | null;
  assessmentHeader: AssessmentHeader | null;
  wordBank: { pt: string; meaning: string }[] | null;
  sentenceFrame: string | null;
  canEndPractice: boolean;
  /** Current scene word card for the overlay (blocking or available for review). */
  sceneWordCard: SceneWordCardView | null;
  /** Show the local «كلمات المشهد» reopen chip (not a turn action). */
  showSceneWordChip: boolean;
  /** Unique Portuguese strings to prefetch when the lesson opens. */
  sceneWordWarmPt: string[];
  dev: {
    progress: LearnerFile['progress'];
    lastLogLine: string;
    lastTurnLog: LearnerFile['progress']['lastTurnLog'];
  };
};

export function learnerView(file: LearnerFile): LearnerView {
  const { progress } = file;
  let practiceHeader: StageHeader | null = null;
  let assessmentHeader: AssessmentHeader | null = null;
  let wordBank: LearnerView['wordBank'] = null;
  let sentenceFrame: string | null = null;
  let sceneWordCard: SceneWordCardView | null = null;
  let showSceneWordChip = false;
  let sceneWordWarmPt: string[] = [];

  if (progress.mode === 'practice' && progress.practice) {
    const pack = lessonById(progress.practice.lessonId);
    if (pack) {
      practiceHeader = stageProgressLabel(pack, progress.practice);
      const focus = progress.practice;
      const beat = pack.beats[focus.beatIndex];
      const warm = new Set<string>();
      for (const scene of pack.scenes) {
        for (const word of scene.words ?? []) {
          const pt = word.pt.trim();
          if (pt) warm.add(pt);
        }
      }
      sceneWordWarmPt = [...warm];

      if (beat && focus.phase === 'story') {
        if (beat.difficulty === 'guided') sentenceFrame = beat.frame ?? null;
        if (beat.difficulty === 'supported') wordBank = beat.wordBank ?? null;
        if (beat.difficulty === 'open') {
          wordBank = beat.wordBank ?? null;
          sentenceFrame = beat.frame ?? null;
        }

        const sceneWords = wordsForScene(pack, beat.sceneId);
        const scene = pack.scenes.find((row) => row.id === beat.sceneId);
        const gate = focus.sceneWordGate;
        const seen = focus.sceneWordCardsSeen ?? [];
        if (gate && gate.sceneId === beat.sceneId && sceneWords.length) {
          sceneWordCard = {
            sceneId: beat.sceneId,
            titleAr: scene?.titleAr,
            words: sceneWords,
            mode: 'blocking',
          };
        } else if (sceneWords.length && seen.includes(beat.sceneId)) {
          sceneWordCard = {
            sceneId: beat.sceneId,
            titleAr: scene?.titleAr,
            words: sceneWords,
            mode: 'review',
          };
          showSceneWordChip = true;
        }
      }

      // Immediate final task: no coach tip / word bank of the story; optional frame.
      if (focus.phase === 'final-task') {
        const task = pack.assessmentTasks[focus.finalTaskIndex ?? 0];
        if (task) {
          sentenceFrame = task.frame ?? null;
          wordBank = null;
        }
      }
    }
  }

  if (progress.mode === 'assessment' && progress.assessment) {
    const pack = lessonById(progress.assessment.lessonId);
    if (pack) {
      assessmentHeader = {
        targets: pack.assessmentTasks.map((task, i) => {
          const outcome = progress.assessment!.taskOutcomes[task.id];
          let state: 'done' | 'current' | 'todo' = 'todo';
          if (i < progress.assessment!.taskIndex) state = 'done';
          else if (i === progress.assessment!.taskIndex) state = 'current';
          return { target: task.target, state, outcome };
        }),
      };
      const task = pack.assessmentTasks[progress.assessment.taskIndex];
      if (task?.kind === 'open') {
        wordBank = task.wordBank ?? null;
        sentenceFrame = task.frame ?? null;
      }
    }
  }

  return {
    id: file.id,
    level: file.level,
    mode: progress.mode,
    messages: file.visible,
    chips: chipsFor(progress),
    practiceHeader,
    assessmentHeader,
    wordBank,
    sentenceFrame,
    canEndPractice: progress.mode === 'practice',
    sceneWordCard,
    showSceneWordChip,
    sceneWordWarmPt,
    dev: {
      progress,
      lastLogLine: progress.lastLogLine,
      lastTurnLog: progress.lastTurnLog,
    },
  };
}

export { availableLessons };
