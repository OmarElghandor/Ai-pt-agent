import type { ConvoGoal, ConvoGoalBank } from '@/lib/v2/convo/goals/types';
import { getCharacter } from '@/lib/v2/characters/registry';

function askHasNumber(ask: string | undefined): boolean {
  if (!ask?.trim()) return false;
  return /\d|[€$]|euro|euros|cento|meia|hora|horas|minuto/i.test(ask);
}

/** Scene facts for the model: all facts_tl + ask_tl lines that contain a number. */
export function collectSceneFacts(bank: ConvoGoalBank): string[] {
  const out: string[] = [];
  for (const g of bank.goals) {
    for (const f of g.facts_tl ?? []) {
      const t = f.trim();
      if (t) out.push(t);
    }
    if (askHasNumber(g.ask_tl)) out.push(g.ask_tl!.trim());
    if (askHasNumber(g.ask_tl_f)) out.push(g.ask_tl_f!.trim());
    for (const a of g.ask ?? []) {
      if (askHasNumber(a.tl)) out.push(a.tl.trim());
    }
  }
  return [...new Set(out)];
}

/** Extra allowed surfaces for the level guard (§C). */
export function sceneLevelExtraAllowed(bank: ConvoGoalBank): string[] {
  const out: string[] = [...(bank.new_items_tl ?? [])];
  for (const g of bank.goals) {
    if (g.ask_tl) out.push(g.ask_tl);
    if (g.ask_tl_f) out.push(g.ask_tl_f);
    out.push(...(g.examples_tl ?? []));
    out.push(...(g.facts_tl ?? []));
  }
  return out;
}

/** Step C example reactions from the scene prompt (also §8.3 allowlist aides). */
export const SCENE_EXAMPLE_REACTIONS = [
  'Um café? Claro! 😊',
  'Com cartão, muito bem.',
  'Ah, do Egito!',
] as const;

/**
 * Tiny constant-size Step C prompt (FINAL SPEC §3).
 */
export function buildSceneReactionPrompt(opts: {
  bank: ConvoGoalBank;
  current: ConvoGoal;
  next: ConvoGoal | null;
  lastCharacterTl: string;
  learnerText: string;
}): { system: string; prompt: string } {
  const place = opts.bank.scene?.place?.trim() || 'a role-play scene';
  const charId = opts.bank.scene?.character_id ?? 'character';
  const char = getCharacter(charId);
  const name = char?.name?.trim() || charId;
  const address =
    opts.bank.scene?.address === 'tu'
      ? 'tu (informal)'
      : 'o senhor / a senhora (formal)';
  const facts = collectSceneFacts(opts.bank);
  const factsBlock = facts.length
    ? facts.map((f) => `- ${f}`).join('\n')
    : '(none)';
  const nextLine = opts.next
    ? `${opts.next.id} — ${opts.next.intent_en ?? opts.next.intent_eg}`
    : '(none)';

  const system = `You are ${name} in a Portuguese (pt-PT) role-play.
Place/role: ${place}.
Address: ${address}.

Write ONE short reaction in pt-PT, at most 12 words, that does not end with a question (a short recast like «Um café?» inside it is fine).
If the learner made a mistake, use the correct form inside the reaction.
Never repeat the learner's whole sentence.
If the learner asked something about the scene, answer in one sentence using only the facts; if the facts don't cover it, say «Isso não sei, desculpe.»
Never invent prices, times or places.

Output exactly 3 lines:
PT: <reaction>
AR: <the Arabic of the reaction>
GOAL: <one value only — the current goal id, OR the next goal id, OR side, OR none>

Do not copy the whole template. Pick exactly one GOAL value.

Example reactions:
Um café? Claro! 😊
Com cartão, muito bem.
Ah, do Egito!`;

  const prompt = `Character's last line: «${opts.lastCharacterTl || '(none)'}»
Learner said: «${opts.learnerText}»
Current goal: ${opts.current.id} — ${opts.current.intent_en ?? opts.current.intent_eg}
Next goal: ${nextLine}
Scene facts:
${factsBlock}`;

  return { system, prompt };
}
