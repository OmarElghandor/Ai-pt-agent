import { generateText } from 'ai';
import { getClassifierModel } from '@/lib/model';
import type { RoleplayExchange } from './session';
import type { RoleplaySituation, RoleplayStep } from './types';

export type RoleplayModelReactionInput = {
  situation: RoleplaySituation;
  step: RoleplayStep;
  learnerText: string;
  lastExchanges: RoleplayExchange[];
};

/**
 * Constant-size prompt: character, current step, last 2 exchanges.
 * Used only when V2_ROLEPLAY_MODEL_REACTIONS is on (tier 3 off-script).
 */
export function buildRoleplayReactionPrompt(
  input: RoleplayModelReactionInput,
): string {
  const char =
    'id' in input.situation.character && input.situation.character.id
      ? String(input.situation.character.id)
      : 'name' in input.situation.character
        ? String(input.situation.character.name)
        : 'character';
  const says = input.step.says?.tl ?? '(waiting for learner)';
  const intent = input.step.expects.intent_eg;
  const lastTwo = input.lastExchanges
    .filter((e) => e.role === 'learner' || e.role === 'character')
    .slice(-2)
    .map((e) => `${e.role}: ${e.tl ?? e.eg ?? ''}`)
    .join('\n');

  return [
    `You are ${char} in a Lisbon role-play.`,
    `Place: ${input.situation.place_eg}`,
    `Current step intent (EG): ${intent}`,
    `Your last line: ${says}`,
    `Recent:`,
    lastTwo || '(none)',
    `Learner just said (off-script): ${input.learnerText}`,
    `Reply in ONE short Portuguese line in character. No Arabic. No coaching.`,
  ].join('\n');
}

export type RoleplayModelReactionFn = (
  input: RoleplayModelReactionInput,
) => Promise<string | null>;

/** Stub for tests — increments nothing; returns fixed line. */
export function createStubRoleplayModelReaction(
  line = 'Desculpe, não percebi.',
): RoleplayModelReactionFn {
  return async () => line;
}

/** Live caller via the shared classifier model (constant prompt). */
export function createLiveRoleplayModelReaction(): RoleplayModelReactionFn {
  return async (input) => {
    const prompt = buildRoleplayReactionPrompt(input);
    try {
      const { text } = await generateText({
        model: getClassifierModel(),
        prompt,
        maxOutputTokens: 60,
      });
      const line = text?.trim().split('\n')[0]?.trim() ?? '';
      return line || null;
    } catch {
      return null;
    }
  };
}
