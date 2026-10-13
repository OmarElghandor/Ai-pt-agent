import type {
  AuthoredSegment,
  AssessmentTask,
  ExplanationExample,
  LessonPack,
  StoryBeat,
  StoryLine,
} from './lessons/types';
import {
  PRAISE_PHRASES,
  type MessageType,
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

export function makeCoachTip(ar: string, arz: string): TypedMessage {
  return {
    id: nextId(),
    role: 'assistant',
    type: 'coach',
    at: Date.now(),
    segments: [{ lang: 'ar', text: ar, pronunciation: arz || ar }],
  };
}

/** First wrong attempt: clear “say it again” with the target phrase once. */
export function makeRetryCoach(targetPt: string): TypedMessage {
  const target = targetPt.trim() || '…';
  const ar = `الإجابة مش صح. خلّينا نعيد: ${target}. جرّب تاني.`;
  const arz = `الإِجابَة مِش صَح. خَلِّينا نِعيد: ${target}. جَرِّب تاني.`;
  return makeCoachTip(ar, arz);
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

/** Narration when the scene changes, the character line, and a coach pre-hint (guided/supported). */
export function presentBeat(
  pack: LessonPack,
  index: number,
  opts?: { alt?: boolean },
): TypedMessage[] {
  const beat = currentBeat(pack, index);
  if (!beat) return [];
  const out: TypedMessage[] = [];
  const prev = index > 0 ? pack.beats[index - 1] : null;
  const sceneChanged = !prev || prev.sceneId !== beat.sceneId;
  if (!opts?.alt && sceneChanged && beat.narrationAr) {
    out.push(makeNarration(beat.narrationAr));
  }
  out.push(makeCharacterLine(beat.speaker, opts?.alt ? beat.altLine : beat.line));
  if (beatShowsPreHint(beat, opts?.alt) && beat.coachTip) {
    out.push(makeCoachTip(beat.coachTip.ar, beat.coachTip.arz));
  }
  return out;
}

export function presentClosing(pack: LessonPack): TypedMessage {
  return makeCharacterLine(pack.character.name, pack.closingHook);
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
