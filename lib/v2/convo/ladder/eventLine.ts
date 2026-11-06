import type { ConvoEventFacts } from './types';

/**
 * One-sentence event line for prompt part 3 (09 §5.1).
 * Produced entirely by code — never by the model.
 */
export function formatConvoEventLine(event: ConvoEventFacts): string {
  const taught =
    event.taught_tls && event.taught_tls.length > 0
      ? `taught: ${event.taught_tls.join(', ')}`
      : null;
  const forbid = event.forbid_answer_tl
    ? `never say: ${event.forbid_answer_tl}`
    : null;

  if (event.verdict === 'unclear') {
    return ['answer unclear', taught, forbid].filter(Boolean).join('; ');
  }

  if (event.verdict === 'wrong') {
    const bits: string[] = ['answer wrong'];
    if (event.mistake_id) {
      bits.push(`mistake ${event.mistake_id}`);
    }
    if (event.help_step) {
      bits.push(`help step ${event.help_step}`);
    }
    if (event.consequence_tl) {
      bits.push(`consequence: ${event.consequence_tl}`);
    }
    if (taught) bits.push(taught);
    if (forbid) bits.push(forbid);
    return bits.join('; ');
  }

  const bits: string[] = [
    event.near_miss ? 'answer near miss (counts correct)' : 'answer correct',
  ];
  if (event.after_misses && event.after_misses > 0) {
    bits.push(
      `after ${event.after_misses} miss${event.after_misses === 1 ? '' : 'es'}`,
    );
  }
  if (event.first_without_help) {
    bits.push('first time without help');
  }
  if (event.phase === 'recap') {
    bits.push('recap');
  }
  if (event.phase === 'closing') {
    bits.push('closing');
  }
  if (taught) bits.push(taught);
  if (forbid) bits.push(forbid);
  return bits.join(', ');
}
