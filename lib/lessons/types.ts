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

/** Lesson-level micro-grammar card (ليه؟ / Arabic why about this tool). */
export type GrammarCard = {
  ruleAr: string;
  ruleArz: string;
  examples: ExplanationExample[];
  contrastAr?: string;
};

/** What the character's line means and what kind of answer is expected — never the answer. */
export type LineExplain = {
  ar: string;
  arz: string;
};

export type StoryLine = {
  pt: string;
  ar: string;
  arz: string;
  /** Sentence start above the input (closing hook / frames). */
  frame?: string;
  /** Who says this line (closing hook may be the s03 person). */
  speaker?: string;
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

/** Pre-scene vocabulary card row (كلمات هنحتاجها). */
export type SceneWord = {
  pt: string;
  ar: string;
  arz: string;
  emoji?: string;
};

export type StoryScene = {
  id: string;
  titleAr: string;
  /** s01/s02: 3–5 new words; s03/reviews: empty/absent. Optional on older packs. */
  words?: SceneWord[];
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
  /** Shown on stuck (??? / مش فاهم); optional on older packs. */
  lineExplain?: LineExplain;
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
  /** Optional second speakers named in beats. */
  extraCharacters?: StoryCharacter[];
  /** Optional; older packs omit it and hide ليه؟ / tool-why cards. */
  grammarCard?: GrammarCard;
  scenes: StoryScene[];
  beats: StoryBeat[];
  closingHook: StoryLine;
  /** Character's last line when the friend bridge ends. */
  farewell?: StoryLine;
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
