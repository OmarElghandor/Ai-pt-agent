import { normalizeSceneText } from './weak';

/**
 * ≥ 80% similar (§3): shared-token ratio vs the longer token list.
 * Containment only counts when the shorter side is ≥80% as long (tokens),
 * so «sim» never matches «Sim, por favor.».
 */
export function sceneExampleSimilarity(
  learnerText: string,
  example: string,
): number {
  const a = normalizeSceneText(learnerText);
  const b = normalizeSceneText(example);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aw = a.split(/\s+/).filter(Boolean);
  const bw = b.split(/\s+/).filter(Boolean);
  if (!aw.length || !bw.length) return 0;

  const short = Math.min(aw.length, bw.length);
  const long = Math.max(aw.length, bw.length);
  if ((a.includes(b) || b.includes(a)) && short / long >= 0.8) {
    return 1;
  }

  const setB = new Set(bw);
  const hits = aw.filter((w) => setB.has(w)).length;
  return hits / long;
}

export function isAtLeast80Similar(
  learnerText: string,
  example: string,
): boolean {
  return sceneExampleSimilarity(learnerText, example) >= 0.8;
}
