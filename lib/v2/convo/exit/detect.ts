/** Learner-driven end of conversation (v4 Update). */

const EXIT_RE = /^(خل[َّّ]?ص|كفاية|خلاص|كفايه)[\s!.؟.]*$/u;

export function isLearnerExitRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (EXIT_RE.test(t)) return true;
  // Soft PT exits
  if (/^(chega|basta|já\s+está|ja\s+esta|pode\s+parar)[\s!.?]*$/i.test(t)) {
    return true;
  }
  return false;
}
