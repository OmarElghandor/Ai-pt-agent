import type { CefrLevel } from '@/lib/prompts';

/** Authored bilingual segment. Arabic always carries pronunciation for TTS. */
export type AuthoredSegment =
  | { lang: 'pt'; text: string }
  | { lang: 'ar'; text: string; pronunciation: string };

export type PromptShape =
  | {
      shape: 'question';
      pt: string;
      arHidden: string;
    }
  | {
      shape: 'translate';
      labelPt: string;
      arSentence: string;
    };

export type AnticipatedWrong = {
  answer: string;
  feedback: AuthoredSegment[];
  verdict?: 'near_miss' | 'wrong';
};

export type CodeGuard = {
  requiredWords?: string[];
  requiredEndings?: string[];
};

export type WordBankEntry = {
  pt: string;
  meaning: string;
};

export type ExplanationExample = {
  pt: string;
  meaningAr: string;
};

export type StoryLine = {
  pt: string;
  ar: string;
  arz: string;
};

export type BeatDifficulty = 'guided' | 'supported' | 'open';

type AnswerNotes = {
  frame?: string;
  wordBank?: WordBankEntry[];
  hintNote?: string;
  whyNote?: string;
  nudgeNote?: string;
};

export type KnownAnswerFields = AnswerNotes & {
  kind: 'known';
  acceptedAnswers: string[];
  anticipatedWrong: AnticipatedWrong[];
};

export type OpenAnswerFields = AnswerNotes & {
  kind: 'open';
  successCriterion: string;
  codeGuard: CodeGuard;
};

export type StoryCharacter = {
  name: string;
  roleAr: string;
};

export type StoryScene = {
  id: string;
  titleAr: string;
};

export type StoryBeat = {
  id: string;
  sceneId: string;
  /** Display only. Present when the moment changes. */
  narrationAr?: string;
  speaker: string;
  line: StoryLine;
  altLine: StoryLine;
  difficulty: BeatDifficulty;
  coachTip?: { ar: string; arz: string };
  reactionCue: string;
} & (KnownAnswerFields | OpenAnswerFields);

export type AssessmentTask = {
  id: string;
  target: string;
  /** Question shown with no story character. */
  line: StoryLine;
  passSummary: AuthoredSegment[];
  reviewSummary: AuthoredSegment[];
} & (KnownAnswerFields | OpenAnswerFields);

export type LessonPack = {
  id: string;
  titleAr: string;
  level: CefrLevel;
  learningTarget: string;
  chipLabel: string;
  assessmentAvailable: boolean;
  /** Excluded from the live catalogue; may have a short beat list. */
  testOnly?: boolean;
  introAr: string;
  introArz: string;
  character: StoryCharacter;
  scenes: StoryScene[];
  beats: StoryBeat[];
  closingHook: StoryLine;
  assessmentTasks: AssessmentTask[];
  requirements?: { cells: string[]; words: string[] };
  version?: number;
  status?: string;
  situationAr?: string;
  cellIds?: string[];
  audioCacheRefs?: { key: string; url: string; language: string }[];
  source?: 'json' | 'mongo';
};

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidateResult =
  | { ok: true; pack: LessonPack }
  | { ok: false; issues: ValidationIssue[] };

export const BRAZILIAN_BLACKLIST = [
  'ônibus',
  'trem',
  'café da manhã',
  'celular',
  'banheiro',
  'você',
] as const;

export const BEAT_DIFFICULTIES: BeatDifficulty[] = ['guided', 'supported', 'open'];
