import type { CefrLevel } from '@/lib/prompts';
import type {
  AnticipatedWrong,
  AssessmentTask,
  AuthoredSegment,
  BeatInfoCard,
  BeatReply,
  BeatSkill,
  BeatTeach,
  CodeGuard,
  GrammarCard,
  LessonPack,
  LessonSummary,
  LineExplain,
  ListeningOption,
  ReadingArtifact,
  ReadingArtifactKind,
  SceneWord,
  ScriptTurn,
  StoryBeat,
  StoryLine,
  StoryScene,
  WordBankEntry,
} from './types';
import { BEAT_SKILLS } from './types';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function displayAr(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const o = value as Record<string, unknown>;
  return (
    asString(o.ar).trim() ||
    asString(o.display).trim() ||
    asString(o.text).trim() ||
    asString(o.ar_display).trim() ||
    asString(o.display_ar).trim()
  );
}

function noteToSegments(note: unknown): AuthoredSegment[] {
  const text = displayAr(note) || asString(note).trim();
  if (!text) return [];
  let pronunciation = text;
  if (note && typeof note === 'object') {
    const o = note as Record<string, unknown>;
    pronunciation = asString(o.arz || o.pronunciation || text).trim() || text;
  }
  return [{ lang: 'ar', text, pronunciation }];
}

function adaptGuard(raw: unknown): CodeGuard {
  if (!raw) return {};
  if (typeof raw === 'string') {
    const parts = raw
      .split(/[,|]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return { requiredWords: parts };
  }
  if (Array.isArray(raw)) {
    return { requiredWords: raw.map(asString).filter(Boolean) };
  }
  const obj = raw as Record<string, unknown>;
  return {
    requiredWords: Array.isArray(obj.requiredWords)
      ? obj.requiredWords.map(asString)
      : Array.isArray(obj.words)
        ? obj.words.map(asString)
        : Array.isArray(obj.required_words)
          ? obj.required_words.map(asString)
          : undefined,
    requiredEndings: Array.isArray(obj.requiredEndings)
      ? obj.requiredEndings.map(asString)
      : Array.isArray(obj.endings)
        ? obj.endings.map(asString)
        : Array.isArray(obj.required_endings)
          ? obj.required_endings.map(asString)
          : undefined,
  };
}

function adaptWordBank(raw: unknown): WordBankEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WordBankEntry[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      out.push({ pt: entry, meaning: '' });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const o = entry as Record<string, unknown>;
      const pt = asString(o.pt || o.word || o.phrase);
      const meaning = asString(o.meaning || o.ar || o.meaning_ar);
      if (pt) out.push({ pt, meaning });
    }
  }
  return out.length ? out : undefined;
}

function adaptAnticipatedWrong(raw: unknown): AnticipatedWrong[] {
  if (!Array.isArray(raw)) return [];
  const out: AnticipatedWrong[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    const answer = asString(o.answer || o.form || o.wrong);
    if (!answer) continue;
    const note = o.note ?? o.feedback;
    const feedback = Array.isArray(note) ? (note as AuthoredSegment[]) : noteToSegments(note);
    const verdictRaw = asString(o.verdict).toLowerCase().replace('-', '_');
    out.push({
      answer,
      feedback,
      verdict: verdictRaw === 'near_miss' ? 'near_miss' : 'wrong',
    });
  }
  return out;
}

function adaptLine(raw: unknown, fallbackPt = ''): StoryLine | null {
  if (typeof raw === 'string') {
    const pt = raw.trim();
    if (!pt) return null;
    return { pt, ar: '', arz: '' };
  }
  if (!raw || typeof raw !== 'object') {
    if (!fallbackPt) return null;
    return { pt: fallbackPt, ar: '', arz: '' };
  }
  const o = raw as Record<string, unknown>;
  const pt = asString(o.pt || o.line_pt || o.phrase_pt).trim() || fallbackPt;
  if (!pt) return null;
  const ar = displayAr(o.ar || o.meaning_ar || o.translation) || asString(o.ar);
  const arz = asString(o.arz || o.pronunciation || ar);
  const frame = asString(o.frame || o.sentenceFrame || o.sentence_frame) || undefined;
  return frame ? { pt, ar, arz, frame } : { pt, ar, arz };
}

function adaptAlt(raw: unknown, main: StoryLine): StoryLine {
  if (!raw || typeof raw !== 'object') return main;
  const o = raw as Record<string, unknown>;
  const pt = asString(o.alt_pt || o.altPt).trim();
  if (!pt) return main;
  const ar = displayAr(o.alt_ar || o.altAr) || main.ar;
  const arz = asString(o.alt_arz || o.altArz || ar);
  return { pt, ar, arz };
}

function adaptCoachTip(raw: unknown, arzRaw: unknown): { ar: string; arz: string } | undefined {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const ar = displayAr(o.ar || o.display) || asString(o.text);
    if (!ar) return undefined;
    return { ar, arz: asString(o.arz || o.pronunciation || ar) };
  }
  const ar = asString(raw).trim();
  if (!ar) return undefined;
  return { ar, arz: asString(arzRaw).trim() || ar };
}

function adaptLineExplain(raw: unknown): LineExplain | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    const ar = raw.trim();
    if (!ar) return undefined;
    return { ar, arz: ar };
  }
  if (typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const ar = displayAr(o.ar || o.display) || asString(o.text).trim();
  if (!ar) return undefined;
  return { ar, arz: asString(o.arz || o.pronunciation || ar).trim() || ar };
}

function adaptSceneWords(raw: unknown): SceneWord[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SceneWord[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    const pt = asString(o.pt || o.word || o.phrase).trim();
    if (!pt) continue;
    const ar =
      displayAr(o.ar || o.meaning || o.meaning_ar || o.meaningAr) ||
      asString(o.ar || o.meaning).trim();
    if (!ar) continue;
    const arz = asString(o.arz || o.pronunciation || ar).trim() || ar;
    const emoji = asString(o.emoji).trim() || undefined;
    out.push(emoji ? { pt, ar, arz, emoji } : { pt, ar, arz });
  }
  return out.length ? out : undefined;
}

function adaptGrammarCard(raw: unknown): GrammarCard | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const ruleAr = displayAr(o.rule_ar || o.ruleAr) || asString(o.rule_ar || o.ruleAr).trim();
  if (!ruleAr) return undefined;
  const ruleArz = asString(o.rule_arz || o.ruleArz || ruleAr).trim() || ruleAr;
  const examplesRaw = Array.isArray(o.examples) ? o.examples : [];
  const examples: GrammarCard['examples'] = [];
  for (const entry of examplesRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const ex = entry as Record<string, unknown>;
    const pt = asString(ex.pt).trim();
    if (!pt) continue;
    const meaningAr =
      displayAr(ex.ar || ex.meaning || ex.meaning_ar || ex.meaningAr) ||
      asString(ex.ar || ex.meaning).trim();
    examples.push({ pt, meaningAr });
  }
  if (examples.length === 0) return undefined;
  const contrastAr =
    displayAr(o.contrast_ar || o.contrastAr) ||
    asString(o.contrast_ar || o.contrastAr).trim() ||
    undefined;
  return {
    ruleAr,
    ruleArz,
    examples: examples.slice(0, 2),
    contrastAr: contrastAr || undefined,
  };
}

function adaptDifficulty(raw: unknown): StoryBeat['difficulty'] {
  const value = asString(raw);
  if (value === 'guided' || value === 'supported' || value === 'open') return value;
  return 'guided';
}

function adaptSkill(raw: unknown): BeatSkill {
  const value = asString(raw);
  if ((BEAT_SKILLS as string[]).includes(value)) return value as BeatSkill;
  return 'speaking';
}

function adaptListeningOptions(raw: unknown): ListeningOption[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ListeningOption[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i];
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const tl = asString(o.tl || o.pt).trim();
    if (!tl) continue;
    out.push({
      id: asString(o.id) || `opt${i + 1}`,
      tl,
      correct: Boolean(o.correct),
    });
  }
  return out.length ? out : undefined;
}

function adaptReadingArtifact(raw: unknown): ReadingArtifact | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const kindRaw = asString(o.kind);
  const kinds: ReadingArtifactKind[] = ['receipt', 'sign', 'label', 'menu'];
  if (!kinds.includes(kindRaw as ReadingArtifactKind)) return undefined;
  const linesRaw = Array.isArray(o.lines) ? o.lines : [];
  const lines: { tl: string; ar?: string }[] = [];
  for (const line of linesRaw) {
    if (!line || typeof line !== 'object') continue;
    const lo = line as Record<string, unknown>;
    const tl = asString(lo.tl || lo.pt).trim();
    if (!tl) continue;
    const ar = asString(lo.ar).trim();
    lines.push(ar ? { tl, ar } : { tl });
  }
  const options = adaptListeningOptions(o.options) ?? [];
  const questionAr = asString(o.question_ar || o.questionAr).trim();
  if (!lines.length || !questionAr || !options.length) return undefined;
  return {
    kind: kindRaw as ReadingArtifactKind,
    lines,
    questionAr,
    options,
  };
}

function adaptAnswer(
  o: Record<string, unknown>,
  kind: 'known' | 'open',
): StoryBeat['kind'] extends never ? never : KnownOrOpen {
  const hintNote =
    displayAr(o.hint_note || o.hintNote) || asString(o.hint_note || o.hintNote) || undefined;
  const whyNote =
    displayAr(o.why_note || o.whyNote) || asString(o.why_note || o.whyNote) || undefined;
  const nudgeNote =
    displayAr(o.nudge_note || o.nudgeNote) || asString(o.nudge_note || o.nudgeNote) || undefined;
  const frame = asString(o.frame || o.sentenceFrame || o.sentence_frame) || undefined;
  const wordBank = adaptWordBank(o.word_bank || o.wordBank);
  if (kind === 'open') {
    return {
      kind: 'open',
      successCriterion: asString(o.criterion || o.successCriterion || o.success_criterion),
      codeGuard: adaptGuard(o.guard || o.codeGuard || o.code_guard),
      frame,
      wordBank,
      hintNote,
      whyNote,
      nudgeNote,
    };
  }
  const accepted = Array.isArray(o.accepted)
    ? o.accepted.map(asString).filter(Boolean)
    : Array.isArray(o.acceptedAnswers)
      ? o.acceptedAnswers.map(asString).filter(Boolean)
      : [];
  return {
    kind: 'known',
    acceptedAnswers: accepted,
    anticipatedWrong: adaptAnticipatedWrong(o.anticipated_wrong || o.anticipatedWrong),
    frame,
    wordBank,
    hintNote,
    whyNote,
    nudgeNote,
  };
}

type KnownOrOpen =
  | {
      kind: 'known';
      acceptedAnswers: string[];
      anticipatedWrong: AnticipatedWrong[];
      frame?: string;
      wordBank?: WordBankEntry[];
      hintNote?: string;
      whyNote?: string;
      nudgeNote?: string;
    }
  | {
      kind: 'open';
      successCriterion: string;
      codeGuard: CodeGuard;
      frame?: string;
      wordBank?: WordBankEntry[];
      hintNote?: string;
      whyNote?: string;
      nudgeNote?: string;
    };

function adaptBeat(raw: unknown, index: number, sceneIds: string[]): StoryBeat | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const line = adaptLine(o.line);
  if (!line) return null;
  const sceneId = asString(o.scene || o.scene_id || o.sceneId) || sceneIds[0] || '';
  if (!sceneId) return null;
  const difficulty = adaptDifficulty(o.difficulty);
  const authoredKind = asString(o.kind);
  // Prefer authored kind. Difficulty open only means "no coach tip".
  const kind =
    authoredKind === 'open' || authoredKind === 'known'
      ? authoredKind
      : difficulty === 'open'
        ? 'open'
        : 'known';
  const answer = adaptAnswer(o, kind);
  if (answer.kind === 'known' && answer.acceptedAnswers.length === 0) return null;
  const reply = adaptReply(o.reply);
  const teach = adaptTeach(o.teach);
  const infoCard = adaptInfoCard(o.info_card || o.infoCard);
  const skill = adaptSkill(o.skill);
  const listeningOptions = adaptListeningOptions(
    o.listening_options || o.listeningOptions,
  );
  const readingArtifact = adaptReadingArtifact(
    o.reading_artifact || o.readingArtifact,
  );
  return {
    id: asString(o.id) || `b${String(index + 1).padStart(2, '0')}`,
    sceneId,
    narrationAr: asString(o.narration_ar || o.narrationAr).trim() || undefined,
    speaker: asString(o.speaker || o.character) || '?',
    line,
    altLine: adaptAlt(o.line, line),
    ...(reply !== undefined ? { reply } : {}),
    difficulty,
    skill,
    ...(listeningOptions ? { listeningOptions } : {}),
    ...(readingArtifact ? { readingArtifact } : {}),
    coachTip: adaptCoachTip(o.coach_tip || o.coachTip, o.coach_tip_arz),
    reactionCue: asString(o.reaction_cue || o.reactionCue),
    lineExplain: adaptLineExplain(o.line_explain || o.lineExplain),
    ...(teach ? { teach } : {}),
    ...(infoCard ? { infoCard } : {}),
    ...answer,
  };
}

/** `undefined` = legacy (no reply key). Empty pt = authored, no bubble. */
function adaptReply(raw: unknown): BeatReply | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    const pt = raw.trim();
    return { pt, ar: '', arz: '' };
  }
  if (typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const pt = asString(o.pt).trim();
  const ar = displayAr(o) || asString(o.ar).trim();
  const arz = asString(o.arz || o.pronunciation).trim() || ar;
  return { pt, ar, arz };
}

function adaptScript(raw: unknown): ScriptTurn[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ScriptTurn[] = [];
  for (const turn of raw) {
    if (!turn || typeof turn !== 'object') continue;
    const o = turn as Record<string, unknown>;
    const pt = asString(o.pt).trim();
    if (!pt) continue;
    const ar = displayAr(o) || asString(o.ar).trim();
    const arz = asString(o.arz || o.pronunciation).trim() || ar;
    const turnOut: ScriptTurn = {
      scene: asString(o.scene || o.scene_id || o.sceneId).trim() || 's01',
      speaker: asString(o.speaker).trim() || '?',
      pt,
    };
    if (ar) {
      turnOut.ar = ar;
      turnOut.arz = arz;
    }
    out.push(turnOut);
  }
  return out.length ? out : undefined;
}

/** First-use teach card. null / empty → absent. */
function adaptTeach(raw: unknown): BeatTeach | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const momentAr = asString(o.moment_ar || o.momentAr).trim();
  const rulePt = asString(o.rule_pt || o.rulePt).trim();
  const ruleAr = asString(o.rule_ar || o.ruleAr).trim();
  const examplePt = asString(o.example_pt || o.examplePt).trim();
  const exampleAr = asString(o.example_ar || o.exampleAr).trim();
  const askAr = asString(o.ask_ar || o.askAr).trim();
  if (!momentAr && !rulePt && !askAr) return undefined;
  return { momentAr, rulePt, ruleAr, examplePt, exampleAr, askAr };
}

function adaptInfoCard(raw: unknown): BeatInfoCard | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const titleAr = asString(o.title_ar || o.titleAr).trim();
  const rowsRaw = Array.isArray(o.rows) ? o.rows : [];
  const rows: { pt: string; ar: string }[] = [];
  for (const row of rowsRaw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const pt = asString(r.pt).trim();
    const ar = displayAr(r) || asString(r.ar).trim();
    if (pt) rows.push({ pt, ar });
  }
  if (!titleAr && rows.length === 0) return undefined;
  const noteAr = asString(o.note_ar || o.noteAr).trim() || undefined;
  return { titleAr, rows, ...(noteAr ? { noteAr } : {}) };
}

function adaptSummary(raw: unknown): LessonSummary | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const words: { pt: string; ar: string }[] = [];
  if (Array.isArray(o.words)) {
    for (const entry of o.words) {
      if (!entry || typeof entry !== 'object') continue;
      const w = entry as Record<string, unknown>;
      const pt = asString(w.pt).trim();
      const ar = displayAr(w) || asString(w.ar).trim();
      if (pt) words.push({ pt, ar });
    }
  }
  const rules: LessonSummary['rules'] = [];
  if (Array.isArray(o.rules)) {
    for (const entry of o.rules) {
      if (!entry || typeof entry !== 'object') continue;
      const r = entry as Record<string, unknown>;
      const pt = asString(r.pt).trim();
      if (!pt) continue;
      rules.push({
        pt,
        ar: displayAr(r) || asString(r.ar).trim(),
        examplePt: asString(r.example_pt || r.examplePt).trim(),
        exampleAr: asString(r.example_ar || r.exampleAr).trim(),
      });
    }
  }
  if (words.length === 0 && rules.length === 0) return undefined;
  return { words, rules };
}

function adaptAssessmentTask(raw: unknown, index: number): AssessmentTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  // v5 final tasks may have empty line.pt and only an Egyptian situation in line.ar.
  let line = adaptLine(o.line || o.prompts || o.prompt);
  if (!line && o.line && typeof o.line === 'object') {
    const lo = o.line as Record<string, unknown>;
    const ar = displayAr(lo) || asString(lo.ar).trim();
    if (ar) {
      line = {
        pt: asString(lo.pt).trim(),
        ar,
        arz: asString(lo.arz || lo.pronunciation).trim() || ar,
      };
    }
  }
  if (!line) return null;
  const authoredKind = asString(o.kind);
  const kind =
    authoredKind === 'open' || authoredKind === 'known'
      ? authoredKind
      : o.criterion
        ? 'open'
        : 'known';
  const answer = adaptAnswer(o, kind);
  if (answer.kind === 'known' && answer.acceptedAnswers.length === 0) return null;
  const target = asString(o.target) || `هدف ${index + 1}`;
  const why =
    displayAr(o.why_note || o.whyNote) ||
    asString(o.why_note || o.whyNote) ||
    answer.whyNote ||
    '';
  return {
    id: asString(o.id) || `a${index + 1}`,
    target,
    line,
    passSummary: [{ lang: 'ar', text: `✓ ${target}`, pronunciation: target }],
    reviewSummary: noteToSegments(why).length
      ? noteToSegments(why)
      : [{ lang: 'ar', text: `راجع: ${target}`, pronunciation: target }],
    ...answer,
    nudgeNote:
      displayAr(o.nudge_note || o.nudgeNote) ||
      asString(o.nudge_note || o.nudgeNote) ||
      answer.nudgeNote,
    whyNote: why || undefined,
  };
}

export type MongoLessonSource = {
  lesson_key: string;
  cefr_level?: string;
  topic?: string;
  version?: number;
  status?: string;
  cell_ids?: string[];
  requirements?: { cells?: string[]; words?: string[] };
  spec?: Record<string, unknown> | null;
  pack?: Record<string, unknown> | null;
  audio_cache_refs?: { key?: string; url?: string; language?: string }[];
};

const LEVELS: CefrLevel[] = ['A0', 'A1', 'A2', 'B1'];

export function adaptMongoPack(doc: MongoLessonSource): LessonPack | null {
  const pack = doc.pack;
  if (!pack || typeof pack !== 'object') return null;
  if (pack.teach_steps || pack.teachSteps || pack.items) {
    if (!pack.beats) return null;
  }

  const spec = (doc.spec ?? {}) as Record<string, unknown>;
  const levelRaw = asString(doc.cefr_level || spec.level);
  const level = LEVELS.includes(levelRaw as CefrLevel) ? (levelRaw as CefrLevel) : 'A0';

  const scenesRaw = Array.isArray(pack.scenes) ? pack.scenes : [];
  const scenes = scenesRaw
    .map((scene, i) => {
      if (!scene || typeof scene !== 'object') return null;
      const o = scene as Record<string, unknown>;
      const id = asString(o.id) || `s${i + 1}`;
      const titleAr = asString(o.title_ar || o.titleAr);
      if (!titleAr) return null;
      const words = adaptSceneWords(o.words);
      const row: StoryScene = { id, titleAr };
      if (words) row.words = words;
      return row;
    })
    .filter((scene): scene is StoryScene => Boolean(scene));
  if (scenes.length === 0) return null;

  const beatsRaw = Array.isArray(pack.beats) ? pack.beats : [];
  const beats = beatsRaw
    .map((beat, i) => adaptBeat(beat, i, scenes.map((s) => s.id)))
    .filter((beat): beat is StoryBeat => Boolean(beat));
  if (beats.length === 0) return null;

  const characterRaw = (pack.character ?? {}) as Record<string, unknown>;
  const character = {
    name: asString(characterRaw.name) || beats[0].speaker,
    roleAr: asString(characterRaw.role_ar || characterRaw.roleAr),
  };

  const closingRaw = pack.closing_hook || pack.closingHook;
  const closing = adaptLine(closingRaw);
  if (!closing) return null;
  if (closingRaw && typeof closingRaw === 'object') {
    const speaker = asString((closingRaw as Record<string, unknown>).speaker).trim();
    if (speaker) closing.speaker = speaker;
  }

  const farewell = adaptLine(pack.farewell) || undefined;

  const extraRaw = pack.extra_characters || pack.extraCharacters;
  const extraCharacters = Array.isArray(extraRaw)
    ? extraRaw
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const o = entry as Record<string, unknown>;
          const name = asString(o.name).trim();
          if (!name) return null;
          return { name, roleAr: asString(o.role_ar || o.roleAr) };
        })
        .filter((c): c is { name: string; roleAr: string } => Boolean(c))
    : undefined;

  const introAr = asString(pack.intro_ar || pack.introAr).trim();
  if (!introAr) return null;

  const assessmentRaw = Array.isArray(pack.assessment) ? pack.assessment : [];
  const assessmentTasks = assessmentRaw
    .map((task, i) => adaptAssessmentTask(task, i))
    .filter((task): task is AssessmentTask => Boolean(task));

  const titleAr = asString(spec.title_ar) || asString(doc.topic) || doc.lesson_key;
  const grammarCard = adaptGrammarCard(pack.grammar_card || pack.grammarCard);
  const script = adaptScript(pack.script);
  const summary = adaptSummary(pack.summary);

  return {
    id: doc.lesson_key,
    titleAr,
    level,
    learningTarget: asString(spec.target) || asString(spec.situation_en) || titleAr,
    chipLabel: titleAr,
    assessmentAvailable: assessmentTasks.length > 0,
    introAr,
    introArz: asString(pack.intro_arz || pack.introArz).trim() || introAr,
    character,
    extraCharacters: extraCharacters?.length ? extraCharacters : undefined,
    grammarCard,
    ...(script ? { script } : {}),
    ...(summary ? { summary } : {}),
    scenes,
    beats,
    closingHook: closing,
    farewell,
    assessmentTasks,
    requirements: {
      cells: doc.requirements?.cells ?? doc.cell_ids ?? [],
      words: doc.requirements?.words ?? [],
    },
    version: doc.version,
    status: doc.status,
    situationAr: asString(spec.situation_ar) || undefined,
    cellIds: doc.cell_ids,
    audioCacheRefs: (doc.audio_cache_refs ?? [])
      .filter((ref) => ref?.key && ref.url)
      .map((ref) => ({
        key: String(ref.key),
        url: String(ref.url),
        language: String(ref.language || 'pt'),
      })),
    source: 'mongo',
  };
}
