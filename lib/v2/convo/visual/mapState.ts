import type { ConvoPackData } from '@/lib/v2/convo/pack';
import type { ConvoRung } from '@/lib/v2/convo/session';

/**
 * Map route steps unlocked by items already at understood+ (09 §4.3).
 * First route step is always unlocked.
 */
export function unlockedMapSteps(
  pack: ConvoPackData,
  rungs: Record<string, ConvoRung>,
): Set<string> | null {
  if (pack.visual.type !== 'map') return null;
  const unlocked = new Set<string>();
  const route = pack.visual.route;
  for (let i = 0; i < route.length; i++) {
    const step = route[i];
    if (i === 0) {
      unlocked.add(step.step_id);
      continue;
    }
    const prev = route[i - 1];
    const prevRung = rungs[prev.item_id] ?? 'taught';
    if (
      prevRung === 'understood' ||
      prevRung === 'said' ||
      prevRung === 'assisted'
    ) {
      unlocked.add(step.step_id);
    } else {
      break;
    }
  }
  return unlocked;
}

/**
 * Character node: last unlocked step's `to`, else the first node.
 */
export function mapCharacterNode(
  pack: ConvoPackData,
  rungs: Record<string, ConvoRung>,
): string | null {
  if (pack.visual.type !== 'map') return null;
  const unlocked = unlockedMapSteps(pack, rungs);
  if (!unlocked) return pack.visual.nodes[0]?.id ?? null;

  let lastTo: string | null = null;
  for (const step of pack.visual.route) {
    if (!unlocked.has(step.step_id)) break;
    const rung = rungs[step.item_id] ?? 'taught';
    // Character has completed a step once its item is understood+.
    if (
      rung === 'understood' ||
      rung === 'said' ||
      rung === 'assisted'
    ) {
      lastTo = step.to;
    } else {
      // Standing at the start of this unlocked step.
      return step.from;
    }
  }
  if (lastTo) return lastTo;
  return pack.visual.route[0]?.from ?? pack.visual.nodes[0]?.id ?? null;
}

/**
 * Wrong-way flash when a listed direction mistake fires on a map step.
 * From = step.from; toward = previous route node's from (or same node).
 */
export function deriveWrongWay(input: {
  pack: ConvoPackData;
  mapStepId: string | undefined;
  mistakeId: string | undefined;
}): { from: string; toward: string } | null {
  const { pack, mapStepId, mistakeId } = input;
  if (!mistakeId || !mapStepId || pack.visual.type !== 'map') return null;
  const route = pack.visual.route;
  const idx = route.findIndex((s) => s.step_id === mapStepId);
  if (idx < 0) return null;
  const step = route[idx];
  const toward =
    idx > 0 ? route[idx - 1].from : step.from;
  return { from: step.from, toward };
}

/** Hide the map during recap and closing (09 §10). */
export function mapHiddenForPhase(phase: string): boolean {
  return phase === 'recap' || phase === 'closing';
}
