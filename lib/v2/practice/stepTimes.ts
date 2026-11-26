/** Estimated seconds per step type (16 §2.2). */

export const STEP_SECONDS = {
  card: 18,
  micro_check: 18,
  choice: 18,
  listening_choice: 18,
  find_image_round: 15,
  fill_blank_choice: 20,
  build_sentence: 35,
  dictation: 35,
  fill_blank_write: 35,
  translate_write: 45,
  reply_write: 45,
  say_it: 30,
  reply_speak: 30,
} as const;

export type StepTimeKey = keyof typeof STEP_SECONDS;

export function estimatedSecondsForType(type: string): number {
  if (type in STEP_SECONDS) {
    return STEP_SECONDS[type as StepTimeKey];
  }
  if (
    type.startsWith('listen_') ||
    type === 'pick_meaning' ||
    type === 'pick_tl' ||
    type === 'choose_article' ||
    type === 'complete_phrase' ||
    type === 'situation_choice' ||
    type === 'read_meaning' ||
    type === 'image_pick_tl'
  ) {
    return STEP_SECONDS.choice;
  }
  if (type === 'image_write') return STEP_SECONDS.fill_blank_write;
  if (type === 'image_say') return STEP_SECONDS.say_it;
  if (type === 'listen_pick_image' || type === 'find_image') {
    return STEP_SECONDS.find_image_round;
  }
  return 25;
}
