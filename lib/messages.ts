import type {
  AuthoredSegment,
  AssessmentTask,
  ExplanationExample,
  LessonPack,
  SceneWord,
  StoryBeat,
  StoryLine,
} from './lessons/types';
import {
  PRAISE_PHRASES,
  type MessageType,
  type PracticeFocus,
  type Progress,
  type TypedMessage,
} from './progressTypes';

let seq = 0;
function nextId(): string {
  seq += 1;
  return `m-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

export function makeUserMessage(text: string, verdict?: TypedMessage['learnerVerdict']): TypedMessage {
  return {
    id: nextId(),
    role: 'user',
    type: 'chat',
    at: Date.now(),
    segments: [{ lang: 'pt', text }],
    learnerVerdict: verdict,
  };
}

export function makeChatMessage(
  ptSegments: AuthoredSegment[],
  translation?: AuthoredSegment[],
): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type: 'chat',
    at: Date.now(),
    segments: ptSegments,
    translation,
  };
}

export function makePraise(progress: Progress): { message: TypedMessage; nextIndex: number } {
  const next =
    progress.lastPraiseIndex < 0
      ? 0
      : (progress.lastPraiseIndex + 1 + Math.floor(Math.random() * (PRAISE_PHRASES.length - 1))) %
        PRAISE_PHRASES.length;
  const phrase = PRAISE_PHRASES[next];
  return {
    nextIndex: next,
    message: {
      id: nextId(),
      role: 'assistant',
      type: 'praise',
      at: Date.now(),
      segments: [{ lang: 'pt', text: phrase.pt }],
      translation: [{ lang: 'ar', text: phrase.ar, pronunciation: phrase.pronunciation }],
    },
  };
}

/** Shown once every quiz item has a real outcome — not when items were skipped. */
export function makeChecklistDone(done: number, total: number): TypedMessage {
  return makeMixed('results', [
    {
      lang: 'ar',
      text: `خلصت ${done} من ${total}.`,
      pronunciation: `خَلَّصْت ${done} مِن ${total}.`,
    },
    {
      lang: 'ar',
      text: 'يلا نتكلم شوية عن الموقف.',
      pronunciation: 'يَلا نِتْكَلِّم شُوَيّة عَن المَوْقِف.',
    },
  ]);
}

/** Near-miss when the learner copied the prompt and also said the answer. */
export function makeExtraWordsCorrection(expected: string, promptEcho: string): AuthoredSegment[] {
  return [
    { lang: 'ar', text: 'قول', pronunciation: 'قُول' },
    { lang: 'pt', text: expected },
    { lang: 'ar', text: 'بس.', pronunciation: 'بَس.' },
    { lang: 'pt', text: promptEcho },
    {
      lang: 'ar',
      text: 'هي الجملة اللي بترد عليها.',
      pronunciation: 'هِي الجُمْلة اللّي بِتْرُدّ عَلِيها.',
    },
  ];
}

export function makeMixed(
  type: Extract<MessageType, 'hint' | 'correction' | 'near-miss' | 'reveal' | 'results'>,
  segments: AuthoredSegment[],
  opts?: { label?: string; playablePt?: string },
): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type,
    at: Date.now(),
    segments,
    label: opts?.label,
    playablePt: opts?.playablePt,
  };
}

export function makeExplanation(
  segments: AuthoredSegment[],
  examples: ExplanationExample[],
): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type: 'explanation',
    at: Date.now(),
    segments,
    examples,
  };
}

export function makeIntro(text: string, pronunciation: string): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type: 'intro',
    at: Date.now(),
    segments: [{ lang: 'ar', text, pronunciation }],
  };
}

export function makeNarration(text: string): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type: 'narration',
    at: Date.now(),
    segments: [{ lang: 'ar', text, pronunciation: text }],
  };
}

export function makeCharacterLine(speaker: string, line: StoryLine): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type: 'character',
    at: Date.now(),
    speaker,
    segments: [{ lang: 'pt', text: line.pt }],
    translation: line.ar
      ? [{ lang: 'ar', text: line.ar, pronunciation: line.arz || line.ar }]
      : undefined,
    playablePt: line.pt,
  };
}

export function makeCoachTip(
  ar: string,
  arz: string,
  opts?: { showWhyChip?: boolean },
): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type: 'coach',
    at: Date.now(),
    segments: [{ lang: 'ar', text: ar, pronunciation: arz || ar }],
    coachKind: 'tip',
    showWhyChip: opts?.showWhyChip === true,
  };
}

/** First wrong attempt: clear “say it again” with the target phrase once. */
export function makeRetryCoach(targetPt: string): TypedMessage {
  const target = targetPt.trim() || '…';
  const ar = `الإجابة مش صح. خلّينا نعيد: ${target}. جرّب تاني.`;
  const arz = `الإِجابَة مِش صَح. خَلِّينا نِعيد: ${target}. جَرِّب تاني.`;
  return makeCoachTip(ar, arz);
}

/** Pack note or near-miss fix line (Egyptian / mixed, shown as coach). */
export function makeCoachNote(text: string, pronunciation?: string): TypedMessage {
  const ar = text.trim();
  return {
    id: nextId(),
    role: 'assistant',
    type: 'coach',
    at: Date.now(),
    segments: [{ lang: 'ar', text: ar, pronunciation: pronunciation?.trim() || ar }],
    coachKind: 'note',
  };
}

/** line_explain coach bubble (stuck step 1). */
export function makeLineExplainCoach(explain: { ar: string; arz: string }): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type: 'coach',
    at: Date.now(),
    segments: [{ lang: 'ar', text: explain.ar, pronunciation: explain.arz || explain.ar }],
    coachKind: 'explain',
  };
}

/** Stuck hint card: frame + tappable word_bank pieces. */
export function makeHintCardMessage(opts: {
  frame?: string;
  words: { pt: string; meaning: string }[];
}): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type: 'hint',
    at: Date.now(),
    segments: [],
    label: 'مساعدة',
    hintCard: {
      frame: opts.frame?.trim() || undefined,
      words: opts.words,
    },
  };
}

/** In-thread scene vocabulary carousel (كلمات هنحتاجها). */
export function makeSceneWordCardMessage(
  pack: LessonPack,
  sceneId: string,
): TypedMessage | null {
  const words = wordsForScene(pack, sceneId);
  if (!words.length) return null;
  const scene = pack.scenes.find((row) => row.id === sceneId);
  return {
    id: nextId(),
    role: 'assistant',
    type: 'scene-words',
    at: Date.now(),
    segments: [],
    label: 'كلمات هنحتاجها',
    sceneWordCard: {
      sceneId,
      titleAr: scene?.titleAr,
      words: words.map((w: SceneWord) =>
        w.emoji ? { pt: w.pt, ar: w.ar, arz: w.arz, emoji: w.emoji } : { pt: w.pt, ar: w.ar, arz: w.arz },
      ),
    },
  };
}

/** Lesson grammar_card as an explanation bubble. */
export function makeGrammarCardMessage(card: {
  ruleAr: string;
  ruleArz: string;
  examples: { pt: string; meaningAr: string }[];
  contrastAr?: string;
}): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type: 'explanation',
    at: Date.now(),
    segments: [{ lang: 'ar', text: card.ruleAr, pronunciation: card.ruleArz || card.ruleAr }],
    examples: card.examples,
    contrastAr: card.contrastAr?.trim() || undefined,
  };
}

/** After grammar card: invite him back into the beat. */
export function makeYallaNesta3melha(): TypedMessage {
  return makeCoachNote('يلا نستخدمها', 'يَلّا نِسْتَخْدِمها');
}

/** Near-miss spelling fix when no authored anticipated_wrong note exists. */
export function makeNearMissFixCoach(correctWord: string): TypedMessage {
  const form = correctWord.trim() || '…';
  return makeCoachNote(`بنكتبها ${form}.`, `بِنِكْتِبها ${form}.`);
}

/** Question with no story character (assessment). */
export function makeAssessmentPrompt(task: AssessmentTask): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type: 'chat',
    at: Date.now(),
    segments: [{ lang: 'pt', text: task.line.pt }],
    translation: task.line.ar
      ? [{ lang: 'ar', text: task.line.ar, pronunciation: task.line.arz || task.line.ar }]
      : undefined,
    playablePt: task.line.pt,
  };
}

export function currentBeat(pack: LessonPack, beatIndex: number): StoryBeat | null {
  if (beatIndex < 0 || beatIndex >= pack.beats.length) return null;
  return pack.beats[beatIndex];
}

/** True when presentBeat emits a coach pre-hint for this beat. */
export function beatShowsPreHint(beat: StoryBeat | null | undefined, alt?: boolean): boolean {
  if (!beat || alt || !beat.coachTip) return false;
  return beat.difficulty === 'guided' || beat.difficulty === 'supported';
}

export function wordsForScene(pack: LessonPack, sceneId: string): SceneWord[] {
  const scene = pack.scenes.find((row) => row.id === sceneId);
  return scene?.words?.length ? scene.words : [];
}

export function sceneHasWordCard(pack: LessonPack, sceneId: string): boolean {
  return wordsForScene(pack, sceneId).length > 0;
}

/** Scene change (and not an alt re-ask) that still needs a vocabulary card. */
export function sceneNeedsWordCard(
  pack: LessonPack,
  index: number,
  focus: Pick<PracticeFocus, 'sceneWordCardsSeen'> | null | undefined,
  opts?: { alt?: boolean },
): boolean {
  if (opts?.alt) return false;
  const beat = currentBeat(pack, index);
  if (!beat || !sceneHasWordCard(pack, beat.sceneId)) return false;
  const prev = index > 0 ? pack.beats[index - 1] : null;
  const sceneChanged = !prev || prev.sceneId !== beat.sceneId;
  if (!sceneChanged) return false;
  const seen = focus?.sceneWordCardsSeen ?? [];
  return !seen.includes(beat.sceneId);
}

/** Narration only when the scene changes (no tip/character). */
export function presentBeatHead(
  pack: LessonPack,
  index: number,
  opts?: { alt?: boolean },
): TypedMessage[] {
  const beat = currentBeat(pack, index);
  if (!beat || opts?.alt) return [];
  const prev = index > 0 ? pack.beats[index - 1] : null;
  const sceneChanged = !prev || prev.sceneId !== beat.sceneId;
  if (!sceneChanged || !beat.narrationAr) return [];
  return [makeNarration(beat.narrationAr)];
}

/**
 * Coach tip + character line (no narration).
 * Guided: tip → character. Supported/open: character → tip.
 */
export function presentBeatTail(
  pack: LessonPack,
  index: number,
  opts?: { alt?: boolean },
): TypedMessage[] {
  const beat = currentBeat(pack, index);
  if (!beat) return [];
  const out: TypedMessage[] = [];
  const tip =
    beatShowsPreHint(beat, opts?.alt) && beat.coachTip
      ? makeCoachTip(beat.coachTip.ar, beat.coachTip.arz, {
          showWhyChip: Boolean(pack.grammarCard),
        })
      : null;
  const character = makeCharacterLine(beat.speaker, opts?.alt ? beat.altLine : beat.line);
  if (beat.difficulty === 'guided') {
    if (tip) out.push(tip);
    out.push(character);
  } else {
    out.push(character);
    if (tip) out.push(tip);
  }
  return out;
}

/**
 * Narration when the scene changes, coach tip, and character line.
 * Guided: narration → coach tip → character (tool first).
 * Supported: narration → character → coach tip.
 */
export function presentBeat(
  pack: LessonPack,
  index: number,
  opts?: { alt?: boolean },
): TypedMessage[] {
  return [...presentBeatHead(pack, index, opts), ...presentBeatTail(pack, index, opts)];
}

export function presentClosing(pack: LessonPack): TypedMessage {
  const speaker = pack.closingHook.speaker?.trim() || pack.character.name;
  return makeCharacterLine(speaker, pack.closingHook);
}

/** Farewell line after the friend bridge ends. */
export function presentFarewell(pack: LessonPack): TypedMessage | null {
  if (!pack.farewell?.pt?.trim()) return null;
  return makeCharacterLine(pack.character.name, pack.farewell);
}

export function extractPlayablePt(segments: AuthoredSegment[]): string | undefined {
  const pts = segments.filter((s) => s.lang === 'pt').map((s) => s.text.trim());
  return pts.length ? pts[pts.length - 1] : undefined;
}

export function currentAssessmentTask(pack: LessonPack, taskIndex: number): AssessmentTask | null {
  if (taskIndex < 0 || taskIndex >= pack.assessmentTasks.length) return null;
  return pack.assessmentTasks[taskIndex];
}

/** Plain-text history line for the model (Portuguese + Arabic display text). */
export function typedToPlain(message: TypedMessage): string {
  if (message.type === 'legacy' && message.legacyContent) return message.legacyContent;
  const parts = message.segments.map((s) => s.text);
  if (message.translation) parts.push(...message.translation.map((s) => s.text));
  if (message.playablePt) parts.push(message.playablePt);
  if (message.prompt?.shape === 'translate') {
    parts.push(message.prompt.labelPt, message.prompt.arSentence);
  }
  if (message.prompt?.shape === 'question') {
    parts.push(message.prompt.pt);
  }
  if (message.speaker) parts.unshift(message.speaker);
  if (message.teachMeaning) {
    parts.push(message.teachMeaning.pt, message.teachMeaning.meaningAr);
  }
  return parts.filter(Boolean).join(' ').trim();
}
