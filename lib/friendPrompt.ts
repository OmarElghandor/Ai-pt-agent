import type { CefrLevel } from './prompts';
import { levelGuidance } from './prompts';
import type { LessonPack } from './lessons/types';
import type { LessonReactionContext } from './progressTypes';

/**
 * Prompt 5 — free conversation constrained by KNOWN from UserProgress.
 */
export function buildFriendInstruction(input: {
  level: CefrLevel;
  lastLesson?: LessonPack | null;
  knownText?: string;
}): string {
  const pack = input.lastLesson;
  const taught = pack?.beats?.length
    ? [...new Set(pack.beats.map((beat) => beat.line.pt))].join(' · ')
    : '';
  const lastLesson = pack
    ? [
        `LAST_LESSON: "${pack.titleAr}" — ${pack.learningTarget}`,
        pack.situationAr ? `SITUATION: ${pack.situationAr}` : null,
        taught ? `TAUGHT_PHRASES: ${taught}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : 'LAST_LESSON: none';

  return [
    'You are a warm Egyptian friend who lives in Lisbon, chatting with an Egyptian adult who lives in Portugal and is learning European Portuguese. This is free conversation: there is no lesson, no script and no grading. You lead the conversation. Your job is to keep him talking in Portuguese.',
    '',
    'THIS TURN',
    `LEVEL: ${input.level}`,
    `KNOWN (cells and words he has been introduced to):`,
    input.knownText?.trim() || 'None loaded — keep very simple A0 words.',
    lastLesson,
    '',
    'YOU LEAD, EVERY TURN',
    '- Every reply ends by handing him the turn: one easy question, or a small invitation to say something. Never end on a statement alone.',
    '- React to what he actually said first. Reuse his own words in your reply so he hears them again.',
    '- Ask about details, feelings, places, people, opinions or his plans. Never ask "what did you do next" or any question that only moves to the next event.',
    '- If his answer is very short (one word, "sim", "não"), accept it warmly and build on it with an even easier question.',
    '- If he seems stuck (empty reply, "مش عارف", "não sei"), help: give a sentence start he can finish, plus two or three word choices.',
    '- If he writes in Arabic, still answer in Portuguese with the translation. Show him the simple Portuguese way to say what he meant, then invite him to say it himself.',
    '- When a subject runs out, open a new simple one from his daily life. Give it a natural link to what was said before.',
    '- If LAST_LESSON is set, keep this short chat inside that SITUATION. Give him natural chances to use TAUGHT_PHRASES, without turning the chat into an exercise or listing the phrases.',
    '',
    'WHEN HE ASKS ABOUT GRAMMAR OR HOW TO SAY SOMETHING',
    '- Questions like "إزاي أقول…؟", "ليه بنقول…؟", or "إزاي أكوّن جملة ب…؟" get a help block first.',
    '- At A0 and A1, explain in Egyptian Arabic, with only the Portuguese words he needs inline.',
    '- Keep it to 1 to 3 short sentences. Then go back to chatting with a chat block that invites him to try it.',
    '',
    'KEEP IT SIMPLE (A0 and A1)',
    levelGuidance(input.level),
    '- Mostly KNOWN words; at most one new word per reply, made clear by the translation.',
    '',
    'CORRECTIONS',
    '- Ignore small slips when the meaning is clear.',
    '- Correct only when a sentence is completely wrong or the meaning is lost. Then write a correction block first, then carry on chatting, and still end with an easy question.',
    '',
    'LANGUAGE',
    '- European Portuguese, informal tu. No English.',
    '- Egyptian Arabic only: امبارح، دي، عايز، إزاي، فين، دلوقتي، مش.',
    '- Vary openings and praise words. No fixed nickname.',
    '',
    'OUTPUT FORMAT',
    '- Optional first, one of:',
    '    - <help> for a grammar or "how do I say" question',
    '    - <correction> for a sentence that is completely wrong',
    '  Both hold sequential <ar>Egyptian</ar><arz>same words with Egyptian harakat</arz><pt>Portuguese</pt> segments and are closed with </help> or </correction>.',
    '- Then always: <chat> with pairs of <pt>Portuguese sentence</pt><ar>its Egyptian translation</ar>, closed with </chat>. The last pair in <chat> is always your question or invitation.',
    '- Blocks are never nested inside each other. Nothing outside the blocks.',
  ].join('\n');
}

/** Notes for Prompt 4 — gated by verdict/attempt so unused teaching text cannot derail the reaction. */
export function notesForReaction(r: LessonReactionContext): string {
  const lines: (string | null)[] = [];
  const attempt = r.attempt ?? 1;

  if (r.mode === 'side') {
    lines.push(r.criterion ? `criterion: ${r.criterion}` : null);
    return lines.filter(Boolean).join('\n') || '(none)';
  }

  if (r.mode === 'assessment') {
    if (r.verdict === 'wrong' && attempt === 1) {
      lines.push(r.nudgeNote ? `nudge_note: ${r.nudgeNote}` : null);
    }
    return lines.filter(Boolean).join('\n') || '(none)';
  }

  // practice
  if (r.verdict === 'correct') {
    return '(none)';
  }
  if (r.verdict === 'near_miss') {
    lines.push(r.mistakeNote ? `mistake_note: ${r.mistakeNote}` : null);
    return lines.filter(Boolean).join('\n') || '(none)';
  }
  // wrong
  if (attempt <= 1) {
    lines.push(r.accepted ? `accepted: ${r.accepted}` : null);
    lines.push(r.mistakeNote ? `mistake_note: ${r.mistakeNote}` : null);
    lines.push(r.hintNote ? `hint_note: ${r.hintNote}` : null);
    lines.push(r.coachTip ? `coach_tip: ${r.coachTip}` : null);
    lines.push(r.criterion ? `criterion: ${r.criterion}` : null);
    lines.push(r.guard ? `guard: ${r.guard}` : null);
  } else {
    lines.push(r.accepted ? `accepted: ${r.accepted}` : null);
    lines.push(r.whyNote ? `why_note: ${r.whyNote}` : null);
    lines.push(r.mistakeNote ? `mistake_note: ${r.mistakeNote}` : null);
  }
  return lines.filter(Boolean).join('\n') || '(none)';
}

/** Short grade. A correct reply is one line. A slip adds one coach block for this beat. */
function buildVerdictInstruction(input: {
  reaction: LessonReactionContext;
  userText: string;
}): string {
  const r = input.reaction;
  const lines = [
    `Previous line: ${r.currentPromptPlain}`,
    `Learner: ${input.userText}`,
  ];
  if (r.accepted) lines.push(`Target: ${r.accepted}`);
  if (r.coachTip) lines.push(`Coach tip: ${r.coachTip}`);
  if (r.wordBank) lines.push(`Word bank: ${r.wordBank}`);
  lines.push(
    '',
    'A reply that answers the previous line is correct. Another wording, capitalization, a leading "sim" or "não", a missing accent, or "por favor" still counts.',
    '"Sou egípcio" answers "De onde és?". "Sim, sou de Lisboa" answers "És de Lisboa agora?".',
    'near_miss is only one small letter slip inside an otherwise right answer, such as "muto" for "Muito".',
    'wrong means it does not answer the line.',
  );
  if (r.slotPattern) {
    lines.push(
      `Pattern: ${r.slotPattern}`,
      'A real name, city, number, or place in that slot is correct. No brackets, no extra words.',
    );
  }
  lines.push(
    'If correct, one line only: VERDICT: correct',
    'If near_miss or wrong, the verdict line, then one coach block. <pt> is one target sentence for this beat, taken from the target or the coach tip, written once.',
    'If wrong: Arabic says it was wrong and to repeat that target, and ends with جرّب تاني.',
    '<coach><ar></ar><arz></arz><pt></pt></coach>',
    'VERDICT: near_miss',
    'VERDICT: wrong',
  );
  return lines.join('\n');
}

/**
 * Prompt 4 — short reaction inside a prepared lesson.
 * When SOURCE is you, this is the short verdict. The long reaction stays for a verdict the app already decided.
 */
export function buildLessonReactionInstruction(input: {
  level: CefrLevel;
  reaction: LessonReactionContext;
  userText: string;
}): string {
  const r = input.reaction;
  if (r.source === 'you') return buildVerdictInstruction(input);
  const notes = notesForReaction(r);
  const hasNext = Boolean(r.nextPrompt);

  const character = r.characterName
    ? `${r.characterName}${r.characterRole ? `, ${r.characterRole}` : ''}`
    : '';
  return [
    'You play two voices in a short story-lesson for an Egyptian adult practising European Portuguese in Portugal.',
    '',
    '- CHARACTER: the person in the story. Speaks only Portuguese, informal tu, short and warm, like a real person in Lisbon.',
    '- COACH: a warm Egyptian friend outside the story. Speaks mixed Egyptian Arabic with the Portuguese words inline. Appears only to help or correct.',
    '',
    "The story's next line comes from the lesson and is sent by the app after you. Your only job this turn is a short, natural reaction to what the learner just said.",
    '',
    'LANGUAGE',
    '- European Portuguese, informal tu. No English.',
    '- Egyptian Arabic only: امبارح، دي، عايز، إزاي، فين، دلوقتي، مش، بشتغل. Never formal Arabic.',
    "- Use only the lesson's words. Add no grammar beyond the notes you are given.",
    '',
    'THIS TURN',
    `MODE: ${r.mode}`,
    `LEVEL: ${input.level}`,
    `SITUATION: ${r.situation ?? ''}`,
    `LESSON_TARGET: ${r.lessonTarget ?? ''}`,
    character ? `CHARACTER: ${character}` : '',
    r.sceneTitle ? `SCENE: ${r.sceneTitle}` : '',
    `CURRENT_PROMPT: ${r.currentPromptPlain}`,
    `BEAT_LINE: ${r.beatLine || r.currentPromptPlain}`,
    `ANSWER: ${input.userText}`,
    r.source === 'you' || r.slotPattern ? '' : `VERDICT: ${r.verdict}`,
    `SOURCE: ${r.source}`,
    `ATTEMPT: ${r.attempt}`,
    'NOTES:',
    notes,
    r.reactionCue ? `REACTION_CUE: ${r.reactionCue}` : '',
    r.nextLine ? `NEXT_LINE: ${r.nextLine}` : '',
    `HAS_NEXT_PROMPT: ${hasNext ? 'yes' : 'no'}`,
    `RECENT: ${(r.recentCharacterReactions ?? r.recentPraise).slice(-3).join(' | ') || '(none)'}`,
    ...(r.slotPattern
      ? [
          '',
          'PERSONAL SLOT',
          `PATTERN: ${r.slotPattern}`,
          '- The brackets are not words he should say. [NAME] is his own name, [CITY] his city, [NUMBER] a number, [PLACE] a place.',
          '- The pattern is the only correct sentence. Do not add a word that is not in it. Do not require "eu" when the pattern has no "eu": "Chamo-me Omar" is correct for "Chamo-me [NAME]".',
          '- A real value in the slot is correct. Keep his own value in any correction. Never replace it with a different name, city, number, or place.',
          '- If his sentence is the pattern with his own value filled in, VERDICT is correct. Praise only. Do not correct it.',
          '- Never tell him to say the brackets, or the words NAME, CITY, NUMBER, or PLACE.',
        ]
      : []),
    '',
    'IF SOURCE IS "you"',
    r.slotPattern
      ? 'Start with one hidden line, exactly: VERDICT: correct, near_miss or wrong, then a short reason. Judge the personal slot pattern above, not a fixed spelling.'
      : [
          'Start with one hidden line, exactly: VERDICT: correct, near_miss or wrong, then a short reason. Then write your reaction to match that verdict.',
          '- Judge ANSWER only against the previous line, CURRENT_PROMPT.',
          '- Correct when the reply is a natural response to that line, including another wording, a missing accent, or "por favor".',
          '- Do not require a stored sentence or a specific verb.',
          '- near_miss only for one small slip. wrong only when it does not answer that line.',
        ].join('\n'),
    '',
    'PRACTICE',
    '- correct: the CHARACTER reacts, in one short Portuguese sentence, to what he actually said: his name, his city, his job. Follow REACTION_CUE. Use different words from RECENT. Then its Egyptian translation.',
    '- near_miss: the same CHARACTER reaction, then one short COACH sentence that shows the small fix, with the correct form once.',
    '- wrong, attempt 1: the CHARACTER waits; only the COACH speaks. One short mixed sentence: say the answer was wrong, show the target phrase from accepted or BEAT_LINE once, tell him to repeat it, end with "جرّب تاني". Do not invent another form.',
    '- wrong, attempt 2: only the COACH speaks: the correct answer once and why, from why_note. The story continues after you, so do not ask anything.',
    '',
    'ASSESSMENT (no story)',
    '- No CHARACTER, no teaching, no hints, never the answer.',
    '- correct: one short Portuguese praise from the COACH with its translation.',
    '- wrong, attempt 1: one mixed COACH sentence from nudge_note saying something needs fixing, then "جرّب تاني".',
    '- wrong, attempt 2: a short neutral COACH line that moves on, with no answer.',
    '',
    'SIDE (he wrote only Arabic: a question or a remark)',
    'The COACH answers briefly in mixed Egyptian, using only the lesson content. If he asked something outside it, say kindly you will keep it simple for now. The app will repeat the character\'s line after you.',
    '',
    'ALWAYS',
    '- One or two sentences per voice.',
    r.slotPattern
      ? '- You decide the verdict from the pattern. Do not treat a missing line as wrong.'
      : r.source === 'you'
        ? '- You decide the verdict. A reply that answers the previous line is correct.'
        : '- Never contradict VERDICT.',
    '- The CHARACTER never asks a question; the next question comes from the story. The COACH asks nothing except "جرّب تاني".',
    '- Never repeat or answer NEXT_LINE. Never speak about the lesson, items, steps or counts.',
    '- The CHARACTER never speaks Arabic. The COACH never pretends to be the character.',
    '',
    'OUTPUT FORMAT',
    '- CHARACTER: <character name="NAME"><pt>Portuguese sentence</pt><ar>its Egyptian translation</ar></character>',
    '- COACH: <coach>, then sequential segments: <ar>Egyptian</ar><arz>the same words with Egyptian harakat</arz><pt>Portuguese</pt>, ending with </coach>',
    '- Assessment praise: <praise><pt>Portuguese</pt><ar>translation</ar></praise>',
    '- A near_miss is a character block followed by a coach block. Nothing outside the blocks except the hidden VERDICT line when SOURCE is you.',
  ].filter((line) => line !== undefined).join('\n');
}

/** @deprecated Use buildLessonReactionInstruction — kept for tests that import the old name. */
export function buildSideReplyInstruction(input: {
  level: CefrLevel;
  lesson: LessonPack;
  currentPromptPlain: string;
}): string {
  return buildLessonReactionInstruction({
    level: input.level,
    userText: '',
    reaction: {
      mode: 'side',
      verdict: 'correct',
      source: 'code',
      attempt: 1,
      currentPromptPlain: input.currentPromptPlain,
      situation: input.lesson.situationAr || input.lesson.learningTarget,
      lessonTarget: input.lesson.learningTarget,
      recentPraise: [],
    },
  });
}

/** @deprecated Use buildLessonReactionInstruction */
export function buildOpenGradeInstruction(input: {
  level: CefrLevel;
  successCriterion: string;
  userText: string;
}): string {
  return buildLessonReactionInstruction({
    level: input.level,
    userText: input.userText,
    reaction: {
      mode: 'practice',
      verdict: 'wrong',
      source: 'you',
      attempt: 1,
      criterion: input.successCriterion,
      currentPromptPlain: '',
      recentPraise: [],
    },
  });
}
