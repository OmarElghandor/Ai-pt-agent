/**
 * Code-only short recast after a goal completes.
 * «À direita.» → «À direita, isso! 👍»
 * «Ao lado da farmácia.» → «Ao lado da farmácia, isso! 👍»
 */
export function recastFromExample(exampleTl: string | undefined | null): string | null {
  const raw = exampleTl?.trim();
  if (!raw) return null;
  const base = raw.replace(/[.!?…]+$/u, '').trim();
  if (!base) return null;
  return `${base}, isso! 👍`;
}
