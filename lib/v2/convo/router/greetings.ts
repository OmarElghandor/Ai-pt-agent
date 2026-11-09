/**
 * Greetings / small talk are not topics (v4 Update).
 * Detected in code before any router model call.
 */

const GREETING_RE =
  /^(ola|olá|oi|hey|hi|hello|bom\s*dia|boa\s*tarde|boa\s*noite|tudo\s*bem|tudo\s*bom|como\s*estas|como\s*está|e\s*ai|eai)[\s!.?]*$/i;

const ARABIC_GREETING_RE =
  /^(السلام\s*عليكم|سلام|أهلا|اهلا|مرحبا|صباح\s*الخير|مساء\s*الخير|ازيك|إزيك|عامل\s*ايه|عاملة\s*ايه|اهلاً?\s*و?\s*سهلاً?)[\s!.؟]*$/u;

/** Strip diacritics / normalize for PT greeting match. */
function normalizePt(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[!?.,:;]+$/g, '')
    .trim();
}

export function isGreetingOrSmallTalk(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  if (ARABIC_GREETING_RE.test(raw)) return true;
  const n = normalizePt(raw);
  if (!n) return false;
  if (GREETING_RE.test(n)) return true;
  // Short small-talk: "ola bom dia" / "ola, tudo bem"
  if (
    /^(ola|olá|oi)\b/.test(n) &&
    n.split(/\s+/).length <= 5 &&
    !/\b(quero|falar|sobre|aprender|trabalho|futebol|casa|comida)\b/.test(n)
  ) {
    return true;
  }
  return false;
}
