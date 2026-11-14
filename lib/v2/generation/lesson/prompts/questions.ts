import { FUNCTION_WORDS } from '../../lists';
import { CORE_PROMPT } from './core';

export function buildQuestionsSystemPrompt(): string {
  return `${CORE_PROMPT}

JOB: QUESTIONS (day set — slot fill)
Code already planned each slot (type, skill, item id). You only write Egyptian scenario lines and open-answer rubrics.

REQUIRED OUTPUT via submit_questions:
{ "fills": [{ "slot_id", "prompt_eg", "rubric_eg?", "accepted_extra?" }] }

RULES
1. One fill per slot_id from SLOTS. Do not invent slot_ids or change type/tests.
2. prompt_eg = short Egyptian situation only. Never put the correct Portuguese answer, its Arabic meaning, or its say/transliteration in the prompt.
3. For open types (translate_write, fill_blank_write, reply_write, describe_image_*, say_it, reply_speak, dictation): optional rubric_eg (one Egyptian tip) and accepted_extra (extra accepted Portuguese strings beyond the item's tl).
4. For closed types (listen_*, read_meaning, fill_blank_choice, build_sentence): prompt_eg only; leave accepted_extra empty.
5. If the item is in variant_group greeting.time_of_day and the slot needs to distinguish members, put the deciding time context in prompt_eg (e.g. الساعة ٩ بالليل).
6. Do NOT write options, answer, tiles, accepted, audio_ref, image_ref, or why_wrong_eg — code builds those.
7. For situation_choice slots: prompt_eg MUST be a concrete Egyptian situation describing when you'd say the phrase (e.g. "الجرسون سألك عايز حاجة تانية، ترد إزاي؟"). Never write "اختار الموقف" or any generic "choose the situation" prompt. Code builds the 3 TL options.

FUNCTION_WORDS
${FUNCTION_WORDS}
`.trim();
}
