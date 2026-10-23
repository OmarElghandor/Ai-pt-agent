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

/** Short list of say/hear phrases for R1 WORDS. */
export function wordsForReaction(pack: LessonPack | undefined | null): string {
  if (!pack) return '(none)';
  const phrases = new Set<string>();
  for (const beat of pack.beats) {
    if (beat.line.pt) phrases.add(beat.line.pt);
    if (beat.kind === 'known') {
      for (const answer of beat.acceptedAnswers.slice(0, 3)) phrases.add(answer);
    }
  }
  for (const word of pack.requirements?.words ?? []) {
    if (word) phrases.add(word);
  }
  return [...phrases].slice(0, 40).join(' · ') || '(none)';
}

/** R1 — character reaction after a code-graded correct / near-miss. */
export function buildR1CharacterReaction(input: {
  reaction: LessonReactionContext;
  userText: string;
}): string {
  const r = input.reaction;
  const name = r.characterName || 'Colleague';
  const role = r.characterRole || 'in Portugal';
  const slotNote = r.slotNote?.trim() || '';
  const nextLine = r.nextLine?.trim() || '';
  const nextSpeaker = r.nextSpeaker?.trim() || '';
  // Prefer the corrected form after a near-miss so we never echo his slip.
  const answered = (r.answerForReaction ?? input.userText).trim() || input.userText;
  return [
    `You are ${name}, ${role}, in a short everyday scene in Portugal.`,
    `You just said: "${r.beatLine || r.currentPromptPlain}"`,
    `The learner, an Egyptian beginner in European Portuguese, answered: "${answered}"`,
    'His answer is right.',
    'If his answer had a small slip, the app corrects it separately; your sentence never repeats the slip.',
    '',
    `Write the ONE short sentence ${name} says back.`,
    `Feeling and intent: ${r.reactionCue || 'warm and natural'}`,
    slotNote,
    nextLine
      ? `Right after your sentence, ${nextSpeaker || 'someone'} will say: "${nextLine}". Your sentence must lead into it naturally and must not say, ask or answer the same thing.`
      : '',
    '',
    'Rules:',
    '- European Portuguese, informal tu, very simple (A0–A1), at most 8 words.',
    '- A statement. No question mark. No invitation, no offer, no new topic.',
    '- Do not repeat or echo his sentence. React the way a real person in this role would (a short acknowledgement, handing something over, a reaction to his news).',
    '- If he gave an opinion about your own things (caro, barato), do not agree or argue; react as your role would.',
    `- Stay inside this scene: no nationality, name, place or thing that is not in the line, his answer, or these words: ${r.words || '(none)'}`,
    '- React only to what he said. Do not add facts about yourself (your age, where you are from, comparisons).',
    `- Never say your own name (${name}); you are talking TO him.`,
    `- Do not reuse these recent sentences: ${(r.recentCharacterReactions ?? r.recentPraise).slice(-3).join(' | ') || '(none)'}`,
    '- Then the same sentence in Egyptian Arabic (عايز، إزاي، فين، دلوقتي، مش), never formal Arabic, never English.',
    '',
    'Output exactly this and nothing else:',
    `<character name="${name}"><pt>Portuguese sentence</pt><ar>Egyptian translation</ar></character>`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** R2 — judge (and react if right). Assessment omits the character part. */
export function buildR2Judge(input: {
  reaction: LessonReactionContext;
  userText: string;
}): string {
  const r = input.reaction;
  const name = r.characterName || 'Colleague';
  const role = r.characterRole || 'in Portugal';
  const assessment = r.mode === 'assessment';
  const slotRule = r.slotPattern
    ? `The answer is the pattern "${r.slotPattern}" with his own real name, number, city or place in place of the brackets. Any real value is correct. Never ask him to say the brackets.`
    : '';

  const reactPart = assessment
    ? ''
    : [
        `If correct or near_miss, line 2: the sentence ${name} (${role}) says back, reacting to what he actually said. Feeling: ${r.reactionCue || 'warm'}. European Portuguese, informal tu, at most 8 words, a statement, no question.`,
        `<character name="${name}"><pt>…</pt><ar>Egyptian translation</ar></character>`,
        'If near_miss, line 3: his sentence corrected, keeping his own words and value, with one short Egyptian sentence that states the rule as how WE say it ("بنكتب muito بالـ i"، "بعد الرقم بنقول anos"), not "قول كذا":',
        '<fix><ar>Egyptian: the rule</ar><pt>corrected sentence</pt></fix>',
        'If wrong, write nothing after line 1.',
      ].join('\n');

  return [
    'A learner of European Portuguese is answering one line in a lesson.',
    '',
    `Line: "${r.beatLine || r.currentPromptPlain}" (${r.lineAr || ''})`,
    `Learner: "${input.userText}"`,
    `A correct answer must: ${r.criterion || 'answer the line naturally'}`,
    `It must contain: ${r.guard || '(no specific words)'}`,
    slotRule,
    '',
    'Decide:',
    '- correct: it answers the line and meets the requirement. Other wording, capital or small letters, a missing accent, "sim" in front or "por favor" are fine.',
    '- near_miss: it meets the requirement with one small slip (one wrong letter, a missing article, the wrong ending on one word).',
    '- wrong: it does not answer the line, or it misses the required words.',
    '',
    'Line 1, exactly: VERDICT: correct  |  VERDICT: near_miss  |  VERDICT: wrong',
    reactPart,
    'Nothing else.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** R3 — coach answer to an Arabic-only side message (WHY / HOW / OTHER). */
export function buildR3CoachArabic(input: {
  reaction: LessonReactionContext;
  userText: string;
}): string {
  const r = input.reaction;
  const name = r.characterName || 'Colleague';
  const grammarPoint = r.grammarPoint?.trim() || r.criterion?.trim() || '(this lesson tool)';
  return [
    'You are the coach: a warm Egyptian friend helping an Egyptian adult practise European Portuguese.',
    `He is in a short scene. ${name} just said: "${r.beatLine || r.currentPromptPlain}" (${r.lineAr || ''}).`,
    `This lesson's tool: ${grammarPoint}`,
    `He wrote: "${input.userText}"`,
    '',
    'Decide which one it is, then answer:',
    '- WHY: he asks why we say something, or the difference between two forms ("ليه queria مش quero؟").',
    '  Give the reason in 1–2 short Egyptian sentences, then ONE short example in Portuguese with its Egyptian meaning, then "يلا نستخدمها".',
    '- HOW: he asks how to say something from this scene.',
    '  Give the tool as how WE say it ("عشان نقول … بنقول …"), then "جرّب تقولها".',
    '- OTHER: anything else. One short line of answer, then say you\'ll come back to it after the scene.',
    `Never give the whole answer to ${name}'s line. Egyptian Arabic only (عايز، إزاي، فين، دلوقتي، مش), Portuguese words inline. No English. Do not speak as ${name}.`,
    '',
    'Output exactly:',
    '<coach><ar>Egyptian text</ar><arz>the same with Egyptian harakat</arz></coach>',
    'and, for WHY only, after it:',
    '<example><pt>Portuguese example</pt><ar>Egyptian meaning</ar></example>',
  ].join('\n');
}

/** Pick R1 / R2 / R3 from reaction context (legacy `/api/chat`). */
export function buildLessonReactionInstruction(input: {
  level: CefrLevel;
  reaction: LessonReactionContext;
  userText: string;
}): string {
  void input.level;
  const kind = input.reaction.reactionKind ?? inferReactionKind(input.reaction);
  if (kind === 'r1') return buildR1CharacterReaction(input);
  if (kind === 'r3') return buildR3CoachArabic(input);
  return buildR2Judge(input);
}

/** v2 reactor builder — re-export for Langify callers and tests. */
export { buildV2ReactorPrompt } from '@/lib/reactor/buildReactPrompt';

function inferReactionKind(r: LessonReactionContext): 'r1' | 'r2' | 'r3' {
  if (r.mode === 'side') return 'r3';
  if (r.source === 'you') return 'r2';
  return 'r1';
}

/** @deprecated Use buildR3CoachArabic / buildLessonReactionInstruction */
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
      reactionKind: 'r3',
      currentPromptPlain: input.currentPromptPlain,
      recentPraise: [],
    },
  });
}

/** @deprecated Use buildR2Judge / buildLessonReactionInstruction */
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
      reactionKind: 'r2',
      criterion: input.successCriterion,
      currentPromptPlain: '',
      recentPraise: [],
    },
  });
}
