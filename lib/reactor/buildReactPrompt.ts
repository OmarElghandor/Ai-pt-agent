import type { ReactRequest } from './schema';

/**
 * v2 reactor: SOURCE is always code. Never judges; never emits VERDICT.
 * Corrects one error only using MAIN_ERROR / CORRECTED_TL / WEAK_SPOT.
 */
export function buildV2ReactorPrompt(req: ReactRequest): string {
  if (req.reaction_kind === 'r1') return buildR1(req);
  if (req.reaction_kind === 'r3') return buildR3(req);
  if (req.mode === 'daily') return buildDaily(req);
  if (req.mode === 'open_question') return buildOpenQuestion(req);
  if (req.mode === 'assessment') return buildAssessment(req);
  return buildPracticeR2(req);
}

function buildR1(req: ReactRequest): string {
  const name = req.character_name;
  const next = req.next_line_pt?.trim();
  return [
    `You are ${name}, ${req.character_role}, in a short everyday scene in Portugal.`,
    `You just said: "${req.prompt_pt}"`,
    `The learner answered: "${req.answer}"`,
    'His answer is right. The app already graded it (SOURCE=code).',
    'If he had a small slip, the app corrects it separately; your sentence never repeats the slip.',
    '',
    `Write the ONE short sentence ${name} says back.`,
    `Feeling: ${req.reaction_cue}`,
    next
      ? `Right after your sentence, ${req.next_speaker || 'someone'} will say: "${next}". Lead into it; do not say the same thing.`
      : '',
    '',
    'Rules: European Portuguese, informal tu, A0–A1, at most 8 words. A statement, no question.',
    `Never say your own name (${name}). Do not echo his sentence.`,
    `Words he knows: ${req.words || '(none)'}`,
    `Do not reuse: ${(req.recent || []).slice(-3).join(' | ') || '(none)'}`,
    '',
    'Output exactly:',
    `<character name="${name}"><pt>Portuguese</pt><ar>Egyptian</ar></character>`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildR3(req: ReactRequest): string {
  const name = req.character_name;
  return [
    'You are the coach: a warm Egyptian friend helping an Egyptian adult practise European Portuguese.',
    `${name} just said: "${req.prompt_pt}" (${req.line_ar || ''}).`,
    `He wrote: "${req.answer}"`,
    '',
    'He wrote in Arabic or asked a side question. Answer briefly in Egyptian, then invite him back to Portuguese.',
    'Never give the full answer to the character line.',
    '',
    'Output exactly:',
    '<coach><ar>Egyptian</ar><arz>same with harakat</arz></coach>',
  ].join('\n');
}

function buildPracticeR2(req: ReactRequest): string {
  const name = req.character_name;
  const verdict = req.verdict;
  const main = req.main_error;
  const mainBlock = main
    ? [
        'MAIN_ERROR:',
        `- scope: ${main.scope}`,
        `- wrong → right: ${main.wrong} → ${main.right}`,
        `- feedback_ar: ${main.feedback_ar || ''}`,
      ].join('\n')
    : 'MAIN_ERROR: (none)';

  const correctionRules = [
    'CORRECTION (SOURCE is always code — you do not judge)',
    '- Correct only MAIN_ERROR. Never list several mistakes.',
    '- Show CORRECTED_TL once, as the <pt> of the coach block, so he hears his own sentence fixed.',
    '- If WEAK_SPOT is yes, the coach kindly says this one keeps coming back and gives the one-line rule.',
    '- unclear from speech: ask him once to say it again, no correction.',
    '- arabic_only: give the Portuguese for what he said and ask him to try it.',
    '- On wrong or near_miss: the character does NOT reply yet; only the coach note.',
    '- On correct: character reacts in one short Portuguese sentence (feeling below); no coach correction.',
  ].join('\n');

  return [
    `You are helping in a practice scene. Character: ${name} (${req.character_role}).`,
    `SKILL: ${req.skill}`,
    `Line: "${req.prompt_pt}" (${req.line_ar || ''})`,
    `Learner said: "${req.answer}"`,
    `VERDICT (from code/grader, do not change it): ${verdict}`,
    `CORRECTED_TL: ${req.corrected_tl || '(empty)'}`,
    `WEAK_SPOT: ${req.weak_spot ? 'yes' : 'no'}`,
    mainBlock,
    `Feeling if correct: ${req.reaction_cue}`,
    '',
    correctionRules,
    '',
    'Output:',
    verdict === 'correct'
      ? `<character name="${name}"><pt>…</pt><ar>Egyptian</ar></character>`
      : '<coach><ar>Egyptian about MAIN_ERROR</ar><arz>…</arz><pt>CORRECTED_TL or empty</pt></coach>',
    'Nothing else. No VERDICT line.',
  ].join('\n');
}

function buildDaily(req: ReactRequest): string {
  const main = req.main_error;
  return [
    'DAILY MODE (احكي يومك)',
    'You are Inês, his Portuguese friend, chatting in the evening. No story, no scene.',
    `He said: "${req.answer}"`,
    `VERDICT (from code/grader): ${req.verdict}`,
    `CORRECTED_TL: ${req.corrected_tl || '(empty)'}`,
    main
      ? `MAIN_ERROR: ${main.scope} · ${main.wrong} → ${main.right}`
      : 'MAIN_ERROR: (none)',
    `WEAK_SPOT: ${req.weak_spot ? 'yes' : 'no'}`,
    '',
    'React in one short Portuguese sentence to what he really did today, then its Egyptian meaning.',
    'On near_miss or wrong, the coach block comes after Inês, with CORRECTED_TL.',
    'Do not ask the next question; the app sends it.',
    '',
    'Output:',
    '<character name="Inês"><pt>…</pt><ar>Egyptian</ar></character>',
    req.verdict === 'correct' || req.verdict === 'unclear'
      ? ''
      : '<coach><ar>…</ar><arz>…</arz><pt>CORRECTED_TL</pt></coach>',
    'No VERDICT line.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildOpenQuestion(req: ReactRequest): string {
  return [
    'OPEN_QUESTION mode: no character. The UI shows feedback_ar and corrected_tl from the grader.',
    `VERDICT: ${req.verdict}`,
    `CORRECTED_TL: ${req.corrected_tl || '(empty)'}`,
    req.main_error
      ? `MAIN_ERROR feedback: ${req.main_error.feedback_ar || ''}`
      : '',
    '',
    'If correct or unclear: output nothing (empty string).',
    'If near_miss, wrong, arabic_only or off_topic: one short coach line in Egyptian about MAIN_ERROR only.',
    '',
    'Output exactly one of:',
    '(empty)',
    'or <coach><ar>…</ar><arz>…</arz></coach>',
    'No VERDICT line. No character block.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildAssessment(req: ReactRequest): string {
  const name = req.character_name;
  return [
    'ASSESSMENT mode: character only. No mid-lesson correction.',
    `Character: ${name} (${req.character_role})`,
    `Line: "${req.prompt_pt}"`,
    `He said: "${req.answer}"`,
    `VERDICT (from code/grader): ${req.verdict}`,
    `Feeling: ${req.reaction_cue}`,
    '',
    'If correct or near_miss: one short character reply (statement, ≤8 words, informal tu).',
    'If wrong / off_topic / arabic_only / unclear: output nothing (empty). Do not correct.',
    '',
    'Output exactly:',
    req.verdict === 'correct' || req.verdict === 'near_miss'
      ? `<character name="${name}"><pt>…</pt><ar>Egyptian</ar></character>`
      : '(empty)',
    'No VERDICT line. No coach block.',
  ].join('\n');
}
