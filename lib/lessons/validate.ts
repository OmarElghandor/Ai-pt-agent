import {
  BEAT_SKILLS,
  BRAZILIAN_BLACKLIST,
  type AssessmentTask,
  type AuthoredSegment,
  type BeatDifficulty,
  type BeatSkill,
  type GrammarCard,
  type KnownAnswerFields,
  type LineExplain,
  type ListeningOption,
  type OpenAnswerFields,
  type ReadingArtifact,
  type SceneWord,
  type StoryBeat,
  type StoryLine,
  type StoryScene,
  type ValidateResult,
  type ValidationIssue,
  type WordBankEntry,
} from './types';
import type { CefrLevel } from '@/lib/prompts';

const ARABIC_LETTER_RE = /[\u0600-\u06FF]/;
const LATIN_LETTER_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]/;
const MARKED_PT_RE = /\[[^\]]*\]/g;
const ANDANDO_RE = /\b\w+ando\b/iu;
const SLOT_RE = /\[(?:NAME|CITY|NUMBER|PLACE)\]/;
const VALID_LEVELS: CefrLevel[] = ['A0', 'A1', 'A2', 'B1'];
const DIFFICULTY_RANK: Record<BeatDifficulty, number> = { guided: 0, supported: 1, open: 2 };

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, path: string, issues: ValidationIssue[]): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push(issue(path, 'required non-empty string'));
    return null;
  }
  return value;
}

function requireArray(value: unknown, path: string, issues: ValidationIssue[]): unknown[] | null {
  if (!Array.isArray(value)) {
    issues.push(issue(path, 'required array'));
    return null;
  }
  return value;
}

function hasArabic(text: string): boolean {
  return ARABIC_LETTER_RE.test(text);
}

function hasLatin(text: string): boolean {
  return LATIN_LETTER_RE.test(text);
}

function withoutMarkedPortuguese(text: string): string {
  return text.replace(MARKED_PT_RE, ' ');
}

function checkPortugueseField(text: string, path: string, issues: ValidationIssue[]): void {
  if (hasArabic(text)) {
    issues.push(issue(path, 'Portuguese field contains Arabic letters'));
  }
  checkBrazilian(text, path, issues);
}

function checkArabicField(text: string, path: string, issues: ValidationIssue[]): void {
  const cleaned = withoutMarkedPortuguese(text);
  if (hasLatin(cleaned)) {
    issues.push(
      issue(path, 'Arabic field contains Latin letters outside a marked Portuguese segment'),
    );
  }
}

function checkBrazilian(text: string, path: string, issues: ValidationIssue[]): void {
  const lower = text.toLowerCase().normalize('NFC');
  for (const word of BRAZILIAN_BLACKLIST) {
    if (lower.includes(word.toLowerCase())) {
      issues.push(issue(path, `Brazilian Portuguese word "${word}" is not allowed`));
    }
  }
  if (ANDANDO_RE.test(lower)) {
    issues.push(issue(path, 'Brazilian "-ando" form is not allowed'));
  }
}

function checkNoVisibleSlot(text: string, path: string, issues: ValidationIssue[]): void {
  if (SLOT_RE.test(text)) {
    issues.push(issue(path, 'slot is only for grading and must not be shown'));
  }
}

function validateSegments(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): AuthoredSegment[] | null {
  const arr = requireArray(value, path, issues);
  if (!arr) return null;
  if (arr.length === 0) {
    issues.push(issue(path, 'required non-empty segment list'));
    return null;
  }
  const out: AuthoredSegment[] = [];
  for (let i = 0; i < arr.length; i++) {
    const segPath = `${path}[${i}]`;
    const seg = arr[i];
    if (!isObject(seg)) {
      issues.push(issue(segPath, 'required object'));
      continue;
    }
    const text = requireString(seg.text, `${segPath}.text`, issues);
    if (seg.lang !== 'pt' && seg.lang !== 'ar') {
      issues.push(issue(`${segPath}.lang`, 'must be "pt" or "ar"'));
      continue;
    }
    if (!text) continue;
    if (seg.lang === 'pt') {
      checkPortugueseField(text, `${segPath}.text`, issues);
      out.push({ lang: 'pt', text });
      continue;
    }
    checkArabicField(text, `${segPath}.text`, issues);
    const pronunciation = requireString(seg.pronunciation, `${segPath}.pronunciation`, issues);
    if (pronunciation) {
      checkArabicField(pronunciation, `${segPath}.pronunciation`, issues);
      out.push({ lang: 'ar', text, pronunciation });
    }
  }
  return out.length ? out : null;
}

function validateLine(value: unknown, path: string, issues: ValidationIssue[]): StoryLine | null {
  if (!isObject(value)) {
    issues.push(issue(path, 'required object'));
    return null;
  }
  const pt = requireString(value.pt, `${path}.pt`, issues);
  const ar = requireString(value.ar, `${path}.ar`, issues);
  const arz = requireString(value.arz, `${path}.arz`, issues);
  if (!pt || !ar || !arz) return null;
  checkPortugueseField(pt, `${path}.pt`, issues);
  checkArabicField(ar, `${path}.ar`, issues);
  checkArabicField(arz, `${path}.arz`, issues);
  checkNoVisibleSlot(`${pt} ${ar}`, path, issues);
  const speaker =
    typeof value.speaker === 'string' && value.speaker.trim()
      ? value.speaker.trim()
      : undefined;
  return speaker ? { pt, ar, arz, speaker } : { pt, ar, arz };
}

function validateWordBank(value: unknown, path: string, issues: ValidationIssue[]): WordBankEntry[] | undefined {
  if (value == null) return undefined;
  const arr = requireArray(value, path, issues);
  if (!arr) return undefined;
  const out: WordBankEntry[] = [];
  for (let i = 0; i < arr.length; i++) {
    const entry = arr[i];
    if (!isObject(entry)) {
      issues.push(issue(`${path}[${i}]`, 'required object'));
      continue;
    }
    const pt = requireString(entry.pt, `${path}[${i}].pt`, issues);
    const meaning = typeof entry.meaning === 'string' ? entry.meaning : '';
    if (!pt) continue;
    checkPortugueseField(pt, `${path}[${i}].pt`, issues);
    if (meaning) checkArabicField(meaning, `${path}[${i}].meaning`, issues);
    checkNoVisibleSlot(`${pt} ${meaning}`, `${path}[${i}]`, issues);
    out.push({ pt, meaning });
  }
  return out;
}

function validateLineExplain(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): LineExplain | undefined {
  if (value == null) return undefined;
  if (!isObject(value)) {
    issues.push(issue(path, 'required object'));
    return undefined;
  }
  const ar = requireString(value.ar, `${path}.ar`, issues);
  const arz = requireString(value.arz, `${path}.arz`, issues);
  if (!ar || !arz) return undefined;
  checkArabicField(ar, `${path}.ar`, issues);
  checkArabicField(arz, `${path}.arz`, issues);
  checkNoVisibleSlot(ar, `${path}.ar`, issues);
  return { ar, arz };
}

function validateSceneWords(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): SceneWord[] | undefined {
  if (value == null) return undefined;
  const arr = requireArray(value, path, issues);
  if (!arr) return undefined;
  const out: SceneWord[] = [];
  for (let i = 0; i < arr.length; i++) {
    const entry = arr[i];
    if (!isObject(entry)) {
      issues.push(issue(`${path}[${i}]`, 'required object'));
      continue;
    }
    const pt = requireString(entry.pt, `${path}[${i}].pt`, issues);
    const ar =
      typeof entry.ar === 'string' && entry.ar.trim()
        ? entry.ar.trim()
        : typeof entry.meaningAr === 'string' && entry.meaningAr.trim()
          ? entry.meaningAr.trim()
          : null;
    if (!ar) {
      issues.push(issue(`${path}[${i}].ar`, 'required non-empty string'));
    }
    const arz =
      typeof entry.arz === 'string' && entry.arz.trim()
        ? entry.arz.trim()
        : ar;
    if (!pt || !ar || !arz) continue;
    checkPortugueseField(pt, `${path}[${i}].pt`, issues);
    checkArabicField(ar, `${path}[${i}].ar`, issues);
    checkArabicField(arz, `${path}[${i}].arz`, issues);
    checkNoVisibleSlot(`${pt} ${ar}`, `${path}[${i}]`, issues);
    const emoji =
      typeof entry.emoji === 'string' && entry.emoji.trim()
        ? entry.emoji.trim()
        : undefined;
    out.push(emoji ? { pt, ar, arz, emoji } : { pt, ar, arz });
  }
  return out;
}

function validateGrammarCard(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): GrammarCard | undefined {
  if (value == null) return undefined;
  if (!isObject(value)) {
    issues.push(issue(path, 'required object'));
    return undefined;
  }
  const ruleAr = requireString(value.ruleAr, `${path}.ruleAr`, issues);
  const ruleArz = requireString(value.ruleArz, `${path}.ruleArz`, issues);
  if (ruleAr) {
    checkArabicField(ruleAr, `${path}.ruleAr`, issues);
    checkNoVisibleSlot(ruleAr, `${path}.ruleAr`, issues);
  }
  if (ruleArz) checkArabicField(ruleArz, `${path}.ruleArz`, issues);
  const examplesRaw = requireArray(value.examples, `${path}.examples`, issues);
  const examples: GrammarCard['examples'] = [];
  if (examplesRaw) {
    if (examplesRaw.length < 1 || examplesRaw.length > 2) {
      issues.push(issue(`${path}.examples`, 'grammar card needs 1 or 2 examples'));
    }
    for (let i = 0; i < examplesRaw.length; i++) {
      const entry = examplesRaw[i];
      if (!isObject(entry)) {
        issues.push(issue(`${path}.examples[${i}]`, 'required object'));
        continue;
      }
      const pt = requireString(entry.pt, `${path}.examples[${i}].pt`, issues);
      const meaningAr =
        typeof entry.meaningAr === 'string'
          ? entry.meaningAr
          : typeof entry.ar === 'string'
            ? entry.ar
            : '';
      if (!pt) continue;
      checkPortugueseField(pt, `${path}.examples[${i}].pt`, issues);
      if (meaningAr) checkArabicField(meaningAr, `${path}.examples[${i}].meaningAr`, issues);
      examples.push({ pt, meaningAr });
    }
  }
  let contrastAr: string | undefined;
  if (typeof value.contrastAr === 'string' && value.contrastAr.trim()) {
    contrastAr = value.contrastAr.trim();
    checkArabicField(contrastAr, `${path}.contrastAr`, issues);
  }
  if (!ruleAr || !ruleArz || examples.length === 0) return undefined;
  return { ruleAr, ruleArz, examples, contrastAr };
}

function validateAnticipated(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): KnownAnswerFields['anticipatedWrong'] {
  if (value == null) return [];
  const arr = requireArray(value, path, issues);
  if (!arr) return [];
  const out: KnownAnswerFields['anticipatedWrong'] = [];
  for (let i = 0; i < arr.length; i++) {
    const entry = arr[i];
    const entryPath = `${path}[${i}]`;
    if (!isObject(entry)) {
      issues.push(issue(entryPath, 'required object'));
      continue;
    }
    const answer = requireString(entry.answer, `${entryPath}.answer`, issues);
    if (!answer) continue;
    checkPortugueseField(answer, `${entryPath}.answer`, issues);
    const verdict = entry.verdict;
    if (verdict !== 'near_miss' && verdict !== 'wrong') {
      issues.push(issue(`${entryPath}.verdict`, 'must be near_miss or wrong'));
    }
    const feedback = Array.isArray(entry.feedback)
      ? validateSegments(entry.feedback, `${entryPath}.feedback`, issues) ?? []
      : [];
    out.push({
      answer,
      feedback,
      verdict: verdict === 'near_miss' ? 'near_miss' : 'wrong',
    });
  }
  return out;
}

function validateAnswer(
  value: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
  kind: 'known' | 'open',
): KnownAnswerFields | OpenAnswerFields | null {
  const frame = typeof value.frame === 'string' ? value.frame : undefined;
  if (frame) {
    checkPortugueseField(frame, `${path}.frame`, issues);
    checkNoVisibleSlot(frame, `${path}.frame`, issues);
  }
  const wordBank = validateWordBank(value.wordBank, `${path}.wordBank`, issues);
  const hintNote = typeof value.hintNote === 'string' ? value.hintNote : undefined;
  const whyNote = typeof value.whyNote === 'string' ? value.whyNote : undefined;
  const nudgeNote = typeof value.nudgeNote === 'string' ? value.nudgeNote : undefined;
  if (kind === 'open') {
    const successCriterion = requireString(value.successCriterion, `${path}.successCriterion`, issues);
    if (!successCriterion) return null;
    const guard = isObject(value.codeGuard) ? value.codeGuard : {};
    return {
      kind: 'open',
      successCriterion,
      codeGuard: {
        requiredWords: Array.isArray(guard.requiredWords)
          ? guard.requiredWords.filter((w): w is string => typeof w === 'string')
          : undefined,
        requiredEndings: Array.isArray(guard.requiredEndings)
          ? guard.requiredEndings.filter((w): w is string => typeof w === 'string')
          : undefined,
      },
      frame,
      wordBank,
      hintNote,
      whyNote,
      nudgeNote,
    };
  }
  const acceptedRaw = requireArray(value.acceptedAnswers, `${path}.acceptedAnswers`, issues);
  if (!acceptedRaw || acceptedRaw.length === 0) {
    if (acceptedRaw) issues.push(issue(`${path}.acceptedAnswers`, 'required non-empty list'));
    return null;
  }
  const acceptedAnswers: string[] = [];
  for (let i = 0; i < acceptedRaw.length; i++) {
    const answer = acceptedRaw[i];
    if (typeof answer !== 'string' || !answer.trim()) {
      issues.push(issue(`${path}.acceptedAnswers[${i}]`, 'required non-empty string'));
      continue;
    }
    checkPortugueseField(answer, `${path}.acceptedAnswers[${i}]`, issues);
    acceptedAnswers.push(answer);
  }
  if (!acceptedAnswers.length) return null;
  return {
    kind: 'known',
    acceptedAnswers,
    anticipatedWrong: validateAnticipated(value.anticipatedWrong, `${path}.anticipatedWrong`, issues),
    frame,
    wordBank,
    hintNote,
    whyNote,
    nudgeNote,
  };
}

function validateBeat(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  sceneIds: Set<string>,
): StoryBeat | null {
  if (!isObject(value)) {
    issues.push(issue(path, 'required object'));
    return null;
  }
  const id = requireString(value.id, `${path}.id`, issues);
  const sceneId = requireString(value.sceneId, `${path}.sceneId`, issues);
  if (sceneId && !sceneIds.has(sceneId)) {
    issues.push(issue(`${path}.sceneId`, 'does not match a scene'));
  }
  const speaker = requireString(value.speaker, `${path}.speaker`, issues);
  const line = validateLine(value.line, `${path}.line`, issues);
  const altLine = validateLine(value.altLine, `${path}.altLine`, issues);
  const difficulty = value.difficulty;
  if (difficulty !== 'guided' && difficulty !== 'supported' && difficulty !== 'open') {
    issues.push(issue(`${path}.difficulty`, 'must be guided, supported, or open'));
  }
  const skillRaw = value.skill;
  const skill: BeatSkill =
    typeof skillRaw === 'string' && (BEAT_SKILLS as string[]).includes(skillRaw)
      ? (skillRaw as BeatSkill)
      : 'speaking';
  if (skillRaw != null && skillRaw !== skill) {
    issues.push(issue(`${path}.skill`, 'must be listening, reading, speaking, or writing'));
  }
  const listeningOptions = validateListeningOptions(
    value.listeningOptions,
    `${path}.listeningOptions`,
    issues,
  );
  const readingArtifact = validateReadingArtifact(
    value.readingArtifact,
    `${path}.readingArtifact`,
    issues,
  );
  if (skill === 'listening' && (!listeningOptions || listeningOptions.length < 2)) {
    issues.push(issue(`${path}.listeningOptions`, 'listening beat needs at least 2 options'));
  }
  if (skill === 'listening' && listeningOptions && !listeningOptions.some((o) => o.correct)) {
    issues.push(issue(`${path}.listeningOptions`, 'listening beat needs exactly one correct option'));
  }
  if (skill === 'reading' && !readingArtifact) {
    issues.push(issue(`${path}.readingArtifact`, 'reading beat needs a reading artifact'));
  }
  const reactionCue = requireString(value.reactionCue, `${path}.reactionCue`, issues);
  let narrationAr: string | undefined;
  if (typeof value.narrationAr === 'string' && value.narrationAr.trim()) {
    narrationAr = value.narrationAr;
    checkArabicField(narrationAr, `${path}.narrationAr`, issues);
    checkNoVisibleSlot(narrationAr, `${path}.narrationAr`, issues);
  }
  let coachTip: StoryBeat['coachTip'];
  if (isObject(value.coachTip)) {
    const ar = requireString(value.coachTip.ar, `${path}.coachTip.ar`, issues);
    const arz = requireString(value.coachTip.arz, `${path}.coachTip.arz`, issues);
    if (ar && arz) {
      checkArabicField(ar, `${path}.coachTip.ar`, issues);
      checkArabicField(arz, `${path}.coachTip.arz`, issues);
      checkNoVisibleSlot(ar, `${path}.coachTip.ar`, issues);
      coachTip = { ar, arz };
    }
  }
  const lineExplain = validateLineExplain(value.lineExplain, `${path}.lineExplain`, issues);
  const authoredKind = value.kind === 'open' || value.kind === 'known' ? value.kind : null;
  const kind = authoredKind ?? (difficulty === 'open' ? 'open' : 'known');
  if (difficulty === 'guided') {
    if (!coachTip) issues.push(issue(`${path}.coachTip`, 'guided beat shows a coach tip'));
    if (typeof value.frame !== 'string' || !value.frame.trim()) {
      issues.push(issue(`${path}.frame`, 'guided beat includes a frame'));
    }
    const bank = Array.isArray(value.wordBank) ? value.wordBank.length : 0;
    if (bank > 0 && (bank < 3 || bank > 8)) {
      issues.push(issue(`${path}.wordBank`, 'guided beat word bank needs 3 to 8 words when present'));
    }
  }
  if (difficulty === 'supported') {
    if (!coachTip) issues.push(issue(`${path}.coachTip`, 'supported beat keeps a coach tip'));
    const bank = Array.isArray(value.wordBank) ? value.wordBank.length : 0;
    if (bank < 4 || bank > 8) {
      issues.push(issue(`${path}.wordBank`, 'supported beat needs 4 to 8 words'));
    }
  }
  if (difficulty === 'open') {
    const bank = Array.isArray(value.wordBank) ? value.wordBank.length : 0;
    if (bank < 4 || bank > 8) {
      issues.push(issue(`${path}.wordBank`, 'open beat needs 4 to 8 words'));
    }
    if (typeof value.frame !== 'string' || !value.frame.trim()) {
      issues.push(issue(`${path}.frame`, 'open beat includes a frame'));
    }
  }
  const answer = validateAnswer(value, path, issues, kind);
  if (!id || !sceneId || !speaker || !line || !altLine || !reactionCue || !answer) return null;
  if (difficulty !== 'guided' && difficulty !== 'supported' && difficulty !== 'open') return null;
  return {
    id,
    sceneId,
    narrationAr,
    speaker,
    line,
    altLine,
    difficulty,
    skill,
    ...(listeningOptions ? { listeningOptions } : {}),
    ...(readingArtifact ? { readingArtifact } : {}),
    coachTip,
    reactionCue,
    lineExplain,
    ...answer,
  };
}

function validateListeningOptions(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ListeningOption[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    issues.push(issue(path, 'must be an array'));
    return undefined;
  }
  const out: ListeningOption[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const row = value[i];
    if (!isObject(row)) {
      issues.push(issue(`${path}[${i}]`, 'required object'));
      continue;
    }
    const id = requireString(row.id, `${path}[${i}].id`, issues);
    const tl = requireString(row.tl, `${path}[${i}].tl`, issues);
    if (tl) checkPortugueseField(tl, `${path}[${i}].tl`, issues);
    if (id && tl) out.push({ id, tl, correct: Boolean(row.correct) });
  }
  const correctCount = out.filter((o) => o.correct).length;
  if (out.length > 0 && correctCount !== 1) {
    issues.push(issue(path, 'exactly one option must be correct'));
  }
  return out.length ? out : undefined;
}

function validateReadingArtifact(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ReadingArtifact | undefined {
  if (value == null) return undefined;
  if (!isObject(value)) {
    issues.push(issue(path, 'required object'));
    return undefined;
  }
  const kind = value.kind;
  if (kind !== 'receipt' && kind !== 'sign' && kind !== 'label' && kind !== 'menu') {
    issues.push(issue(`${path}.kind`, 'must be receipt, sign, label, or menu'));
    return undefined;
  }
  if (!Array.isArray(value.lines) || value.lines.length === 0) {
    issues.push(issue(`${path}.lines`, 'needs at least one line'));
    return undefined;
  }
  const lines: { tl: string; ar?: string }[] = [];
  for (let i = 0; i < value.lines.length; i += 1) {
    const row = value.lines[i];
    if (!isObject(row)) continue;
    const tl = requireString(row.tl, `${path}.lines[${i}].tl`, issues);
    if (!tl) continue;
    checkPortugueseField(tl, `${path}.lines[${i}].tl`, issues);
    const ar = typeof row.ar === 'string' && row.ar.trim() ? row.ar.trim() : undefined;
    if (ar) checkArabicField(ar, `${path}.lines[${i}].ar`, issues);
    lines.push(ar ? { tl, ar } : { tl });
  }
  const questionAr = requireString(value.questionAr, `${path}.questionAr`, issues);
  if (questionAr) checkArabicField(questionAr, `${path}.questionAr`, issues);
  const options = validateListeningOptions(value.options, `${path}.options`, issues);
  if (!lines.length || !questionAr || !options?.length) return undefined;
  return { kind, lines, questionAr, options };
}

function validateAssessment(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): AssessmentTask | null {
  if (!isObject(value)) {
    issues.push(issue(path, 'required object'));
    return null;
  }
  const id = requireString(value.id, `${path}.id`, issues);
  const target = requireString(value.target, `${path}.target`, issues);
  if (target) checkArabicField(target, `${path}.target`, issues);
  const line = validateLine(value.line, `${path}.line`, issues);
  const passSummary = validateSegments(value.passSummary, `${path}.passSummary`, issues);
  const reviewSummary = validateSegments(value.reviewSummary, `${path}.reviewSummary`, issues);
  const kind = value.kind === 'open' ? 'open' : 'known';
  const answer = validateAnswer(value, path, issues, kind);
  if (!id || !target || !line || !passSummary || !reviewSummary || !answer) return null;
  if (kind === 'known' && !answer) return null;
  if (value.kind === 'known' && !value.nudgeNote && !value.hintNote) {
    // nudge is preferred; empty is allowed for the test pack if whyNote exists
  }
  return { id, target, line, passSummary, reviewSummary, ...answer };
}

export function validateLessonPack(raw: unknown): ValidateResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(raw)) {
    return { ok: false, issues: [issue('', 'pack must be an object')] };
  }

  const id = requireString(raw.id, 'id', issues);
  const titleAr = requireString(raw.titleAr, 'titleAr', issues);
  if (titleAr) checkArabicField(titleAr, 'titleAr', issues);
  const level = raw.level;
  if (!VALID_LEVELS.includes(level as CefrLevel)) {
    issues.push(issue('level', 'must be A0, A1, A2, or B1'));
  }
  const learningTarget = requireString(raw.learningTarget, 'learningTarget', issues);
  const chipLabel = requireString(raw.chipLabel, 'chipLabel', issues);
  if (typeof raw.assessmentAvailable !== 'boolean') {
    issues.push(issue('assessmentAvailable', 'required boolean'));
  }
  const testOnly = raw.testOnly === true;
  const introAr = requireString(raw.introAr, 'introAr', issues);
  const introArz = requireString(raw.introArz, 'introArz', issues);
  if (introAr) {
    checkArabicField(introAr, 'introAr', issues);
    checkNoVisibleSlot(introAr, 'introAr', issues);
  }
  if (introArz) checkArabicField(introArz, 'introArz', issues);

  let characterName = '';
  let characterRole = '';
  if (!isObject(raw.character)) {
    issues.push(issue('character', 'required object'));
  } else {
    characterName = requireString(raw.character.name, 'character.name', issues) ?? '';
    characterRole = requireString(raw.character.roleAr, 'character.roleAr', issues) ?? '';
    if (characterRole) checkArabicField(characterRole, 'character.roleAr', issues);
  }

  const scenesRaw = requireArray(raw.scenes, 'scenes', issues);
  const scenes: StoryScene[] = [];
  if (scenesRaw) {
    const minScenes = testOnly ? 1 : 3;
    if (scenesRaw.length < minScenes || scenesRaw.length > 4) {
      issues.push(issue('scenes', testOnly ? 'test pack needs 1 to 4 scenes' : 'scene count must be 3 or 4'));
    }
    for (let i = 0; i < scenesRaw.length; i++) {
      const scene = scenesRaw[i];
      if (!isObject(scene)) {
        issues.push(issue(`scenes[${i}]`, 'required object'));
        continue;
      }
      const sceneId = requireString(scene.id, `scenes[${i}].id`, issues);
      const sceneTitle = requireString(scene.titleAr, `scenes[${i}].titleAr`, issues);
      if (sceneTitle) checkArabicField(sceneTitle, `scenes[${i}].titleAr`, issues);
      const words = validateSceneWords(scene.words, `scenes[${i}].words`, issues);
      if (sceneId && sceneTitle) {
        const row: StoryScene = { id: sceneId, titleAr: sceneTitle };
        if (words && words.length) row.words = words;
        scenes.push(row);
      }
    }
  }

  const beatsRaw = requireArray(raw.beats, 'beats', issues);
  const beats: StoryBeat[] = [];
  if (beatsRaw) {
    const minBeats = testOnly ? 3 : 8;
    const maxBeats = testOnly ? 6 : 14;
    if (beatsRaw.length < minBeats || beatsRaw.length > maxBeats) {
      issues.push(
        issue(
          'beats',
          testOnly ? 'test-only pack must have 3 to 6 beats' : 'beat count must be between 8 and 14',
        ),
      );
    }
    const sceneIds = new Set(scenes.map((scene) => scene.id));
    let lastRank = -1;
    for (let i = 0; i < beatsRaw.length; i++) {
      const beat = validateBeat(beatsRaw[i], `beats[${i}]`, issues, sceneIds);
      if (!beat) continue;
      const rank = DIFFICULTY_RANK[beat.difficulty];
      if (rank < lastRank) {
        issues.push(issue(`beats[${i}].difficulty`, 'difficulty is out of order'));
      } else {
        lastRank = rank;
      }
      beats.push(beat);
    }
  }

  const closingHook = validateLine(raw.closingHook, 'closingHook', issues);
  const grammarCard = validateGrammarCard(raw.grammarCard, 'grammarCard', issues);

  const assessmentRaw = requireArray(raw.assessmentTasks, 'assessmentTasks', issues);
  const assessmentTasks: AssessmentTask[] = [];
  if (assessmentRaw) {
    if (assessmentRaw.length < 3 || assessmentRaw.length > 6) {
      issues.push(issue('assessmentTasks', 'assessment task count must be between 3 and 6'));
    }
    for (let i = 0; i < assessmentRaw.length; i++) {
      const task = validateAssessment(assessmentRaw[i], `assessmentTasks[${i}]`, issues);
      if (task) assessmentTasks.push(task);
    }
  }

  if (
    issues.length > 0 ||
    !id ||
    !titleAr ||
    !learningTarget ||
    !chipLabel ||
    !introAr ||
    !introArz ||
    !characterName ||
    !closingHook
  ) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    pack: {
      id,
      titleAr,
      level: level as CefrLevel,
      learningTarget,
      chipLabel,
      assessmentAvailable: Boolean(raw.assessmentAvailable),
      testOnly: testOnly || undefined,
      introAr,
      introArz,
      character: { name: characterName, roleAr: characterRole },
      grammarCard,
      scenes,
      beats,
      closingHook,
      assessmentTasks,
    },
  };
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('\n');
}
