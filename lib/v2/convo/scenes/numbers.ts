/**
 * Number / price / time tokens that must survive from ask_tl into the model turn.
 */

const PT_NUMBER_TOKEN =
  /^(?:\d+(?:[.,]\d+)?|zero|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quinze|dezasseis|dezassete|dezoito|dezanove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil|meio|meia|euro|euros|minuto|minutos|hora|horas)$/i;

function normalizeToken(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Distinct number/price/time tokens present in ask_tl. */
export function numberWordsInAsk(askTl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tokens(askTl)) {
    const n = normalizeToken(raw);
    if (!PT_NUMBER_TOKEN.test(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** True when ask_tl has no price/time numbers, or reply keeps all of them. */
export function replyKeepsAskNumbers(replyPt: string, askTl: string): boolean {
  const needed = numberWordsInAsk(askTl);
  if (!needed.length) return true;
  const replySet = new Set(tokens(replyPt).map(normalizeToken));
  return needed.every((n) => replySet.has(n));
}

export function askTlHasPriceOrTime(askTl: string): boolean {
  return numberWordsInAsk(askTl).length > 0;
}
