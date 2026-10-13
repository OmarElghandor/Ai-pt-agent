import { lessonById } from './lessons/catalogue';
import { chipsFor, stageProgressLabel, availableLessons } from './turn';
import type { Chip, LearnerFile, TypedMessage } from './progressTypes';

export type StageHeader = {
  stages: { id: string; label: string; state: 'done' | 'current' | 'todo' }[];
  detail: string | null;
};

export type AssessmentHeader = {
  targets: { target: string; state: 'done' | 'current' | 'todo'; outcome?: 'pass' | 'fail' }[];
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

  if (progress.mode === 'practice' && progress.practice) {
    const pack = lessonById(progress.practice.lessonId);
    if (pack) {
      practiceHeader = stageProgressLabel(pack, progress.practice);
      const beat = pack.beats[progress.practice.beatIndex];
      if (beat && progress.practice.phase === 'story') {
        if (beat.difficulty === 'guided') sentenceFrame = beat.frame ?? null;
        if (beat.difficulty === 'supported') wordBank = beat.wordBank ?? null;
        if (beat.difficulty === 'open') {
          wordBank = beat.wordBank ?? null;
          sentenceFrame = beat.frame ?? null;
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
    dev: {
      progress,
      lastLogLine: progress.lastLogLine,
      lastTurnLog: progress.lastTurnLog,
    },
  };
}

export { availableLessons };
