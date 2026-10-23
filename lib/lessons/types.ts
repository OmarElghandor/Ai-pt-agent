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

/** Four skills inside one practice conversation (Langify v2). */
export type BeatSkill = 'listening' | 'reading' | 'speaking' | 'writing';

export type ListeningOption = {
  id: string;
  tl: string;
  correct: boolean;
};

export type ReadingArtifactKind = 'receipt' | 'sign' | 'label' | 'menu';

export type ReadingArtifact = {
  kind: ReadingArtifactKind;
  lines: { tl: string; ar?: string }[];
  questionAr: string;
  options: ListeningOption[];
};

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

/** Authored character reaction after his turn (v4). Empty pt = no bubble. */
export type BeatReply = {
  pt: string;
  ar: string;
  arz: string;
};

/** One spoken turn in the authored script (replay / reviewer). */
export type ScriptTurn = {
  scene: string;
  speaker: string;
  pt: string;
  /** Egyptian meaning for replay; optional on older v4 packs. */
  ar?: string;
  arz?: string;
};

/** First-use coach teaching card (v5). Null/absent = no teach on this beat. */
export type BeatTeach = {
  momentAr: string;
  rulePt: string;
  ruleAr: string;
  examplePt: string;
  exampleAr: string;
  askAr: string;
};

/** Small reference table after a character line (v5). */
export type BeatInfoCard = {
  titleAr: string;
  rows: { pt: string; ar: string }[];
  noteAr?: string;
};

/** End-of-lesson review screen (v5). */
export type LessonSummary = {
  words: { pt: string; ar: string }[];
  rules: { pt: string; ar: string; examplePt: string; exampleAr: string }[];
};

export type StoryBeat = {
  id: string;
  sceneId: string;
  /** Display only. Present when the moment changes. */
  narrationAr?: string;
  speaker: string;
  line: StoryLine;
  altLine: StoryLine;
  /**
   * Authored reaction after a correct answer (v4).
   * `undefined` = legacy pack (use R1). Empty `pt` = no character bubble.
   */
  reply?: BeatReply;
  difficulty: BeatDifficulty;
  /**
   * Skill for this beat (v2). Soft-defaults to speaking when adapting old packs.
   * Listening/reading are closed (code-graded); speaking/writing may use the LLM grader.
   */
  skill: BeatSkill;
  /** Closed options for listening beats (text hidden until answered in UI). */
  listeningOptions?: ListeningOption[];
  /** In-chat reading artifact (receipt, sign, label, menu) with closed options. */
  readingArtifact?: ReadingArtifact;
  coachTip?: { ar: string; arz: string };
  reactionCue: string;
  /** Shown on stuck (??? / مش فاهم); optional on older packs. */
  lineExplain?: LineExplain;
  /** First-use tool teaching (v5). */
  teach?: BeatTeach;
  /** Reference table after the character line (v5). */
  infoCard?: BeatInfoCard;
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
  /** Full conversation script (v4/v5); shown as replay at end of lesson in v5. */
  script?: ScriptTurn[];
  /** End-of-lesson word/rule review (v5). */
  summary?: LessonSummary;
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

export const BEAT_SKILLS: BeatSkill[] = ['listening', 'reading', 'speaking', 'writing'];

/** Default mix per 10 beats when no weak skill is passed. */
export const DEFAULT_SKILL_MIX: Record<BeatSkill, number> = {
  speaking: 3,
  listening: 3,
  reading: 2,
  writing: 2,
};
