/**
 * Deterministic pt-PT → Arabic-letters pronunciation (`say`).
 * Mapping: docs/langify-v2/00-decisions.md §2 and 03-generation-and-learning.md.
 *
 * g → ج · j / g before e|i → چ · sh-sound → ش · initial r / rr → غ
 * v → ڤ · p → پ · lh → لي · nh → ني · final e dropped · final o → و
 */

function isVowel(c: string): boolean {
  return /[aeiouáàâãéêíóôõúü]/i.test(c);
}

function normalize(tl: string): string {
  return tl
    .normalize('NFC')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function transliterateWord(raw: string): string {
  let w = normalize(raw);
  if (!w) return '';

  const trail = w.match(/([!?.,;:…]+)$/);
  const trailing = trail ? trail[1]! : '';
  if (trailing) w = w.slice(0, -trailing.length);

  const mapTrail = (t: string) =>
    t.replace(/\?/g, '؟').replace(/,/g, '،');
  const trailingAr = mapTrail(trailing);

  const lower = w.toLowerCase();
  if (lower === 'um') return 'أون' + trailingAr;
  if (lower === 'uma') return 'أوما' + trailingAr;
  if (lower === 'uns') return 'أونش' + trailingAr;
  if (lower === 'umas') return 'أوماش' + trailingAr;
  if (lower === 'e') return 'إي' + trailingAr;
  if (lower === 'é') return 'إيه' + trailingAr;
  if (lower === 'café' || lower === 'cafe') return 'كَفيه' + trailingAr;

  let i = 0;
  let out = '';
  let atWordStart = true;

  const peek = (n = 0) => lower[i + n] ?? '';
  const take = (n = 1) => {
    const s = lower.slice(i, i + n);
    i += n;
    return s;
  };

  // Drop silent final -e (leite → لايت) unless it's the whole word.
  const dropFinalE =
    lower.length > 2 &&
    lower.endsWith('e') &&
    !/[áàâãéêíóôõúü]/.test(lower[lower.length - 1]!) &&
    lower[lower.length - 1] === 'e';

  while (i < lower.length) {
    if (dropFinalE && i === lower.length - 1 && peek() === 'e') {
      take(1);
      break;
    }

    const c = peek();
    const next = peek(1);
    const next2 = peek(2);

    if (c === 'l' && next === 'h') {
      out += 'لي';
      take(2);
      atWordStart = false;
      continue;
    }
    if (c === 'n' && next === 'h') {
      out += 'ني';
      take(2);
      atWordStart = false;
      continue;
    }
    if (c === 'c' && next === 'h') {
      out += 'ش';
      take(2);
      atWordStart = false;
      continue;
    }
    if (c === 'r' && next === 'r') {
      out += 'غ';
      take(2);
      atWordStart = false;
      continue;
    }

    // quei / quoi-style: qu + ei → كاي (queijo → كايچو)
    if (
      c === 'q' &&
      next === 'u' &&
      (next2 === 'e' || next2 === 'é' || next2 === 'ê') &&
      peek(3) === 'i'
    ) {
      out += 'كاي';
      take(4);
      atWordStart = false;
      continue;
    }
    // que / qui → كِ (+ following vowel absorbed into kasra)
    if (c === 'q' && next === 'u' && /[eiéêí]/.test(next2)) {
      out += 'كِ';
      take(3); // qu + e|i
      atWordStart = false;
      continue;
    }
    if (c === 'g' && next === 'u' && /[eiéêí]/.test(next2)) {
      // hard g before e/i spelled gu: guerra-style → ج
      out += 'ج';
      take(2);
      atWordStart = false;
      continue;
    }

    if (c === 'ã' && next === 'o') {
      out += 'اون';
      take(2);
      atWordStart = false;
      continue;
    }
    if (c === 'ã' && next === 'e') {
      out += 'اين';
      take(2);
      atWordStart = false;
      continue;
    }
    if (c === 'õ' && next === 'e') {
      out += 'وين';
      take(2);
      atWordStart = false;
      continue;
    }
    if (c === 'ã') {
      out += 'ان';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'õ') {
      out += 'ون';
      take(1);
      atWordStart = false;
      continue;
    }

    // diphthong ei → اي (leite)
    if ((c === 'e' || c === 'é' || c === 'ê') && next === 'i') {
      if (atWordStart) out += 'أ';
      out += 'اي';
      take(2);
      atWordStart = false;
      continue;
    }

    if (
      (c === 'i' || c === 'í') &&
      next === 'm' &&
      (i + 2 >= lower.length || !isVowel(next2))
    ) {
      out += 'ين';
      take(2);
      atWordStart = false;
      continue;
    }
    if (
      (c === 'o' || c === 'ó' || c === 'ô') &&
      next === 'm' &&
      (i + 2 >= lower.length || !isVowel(next2))
    ) {
      out += 'ون';
      take(2);
      atWordStart = false;
      continue;
    }
    if (
      (c === 'u' || c === 'ú') &&
      next === 'm' &&
      (i + 2 >= lower.length || !isVowel(next2))
    ) {
      out += 'ون';
      take(2);
      atWordStart = false;
      continue;
    }
    if (
      (c === 'e' || c === 'é' || c === 'ê') &&
      next === 'm' &&
      (i + 2 >= lower.length || !isVowel(next2))
    ) {
      out += 'ين';
      take(2);
      atWordStart = false;
      continue;
    }
    if (
      (c === 'a' || c === 'á' || c === 'à' || c === 'â') &&
      next === 'm' &&
      (i + 2 >= lower.length || !isVowel(next2))
    ) {
      out += 'ان';
      take(2);
      atWordStart = false;
      continue;
    }

    if (c === 's' && next === 's') {
      out += 'س';
      take(2);
      atWordStart = false;
      continue;
    }
    if (c === 's') {
      const prev = lower[i - 1] ?? '';
      if (i + 1 >= lower.length) out += 'ش';
      else if (isVowel(prev) && isVowel(next)) out += 'ز';
      else if (atWordStart) out += 'س';
      else if (!isVowel(next)) out += 'ش';
      else out += 'س';
      take(1);
      atWordStart = false;
      continue;
    }

    if (c === 'r') {
      out += atWordStart ? 'غ' : 'ر';
      take(1);
      atWordStart = false;
      continue;
    }

    // g: soft (ge/gi) → چ; hard → ج (Egyptian jim — never غ)
    if (c === 'g') {
      out += /[eiéêí]/.test(next) ? 'چ' : 'ج';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'j') {
      out += 'چ';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'v') {
      out += 'ڤ';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'p') {
      out += 'پ';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'b') {
      out += 'ب';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 't') {
      out += 'ت';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'd') {
      out += 'د';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'f') {
      out += 'ف';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'm') {
      out += 'م';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'n') {
      out += 'ن';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'l') {
      out += 'ل';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'k' || (c === 'c' && !/[eiéêí]/.test(next))) {
      out += 'ك';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'c' && /[eiéêí]/.test(next)) {
      out += 'س';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'ç') {
      out += 'س';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'x') {
      out += 'ش';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'z') {
      out += i + 1 >= lower.length ? 'ش' : 'ز';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'h') {
      take(1);
      continue;
    }
    if (c === 'q') {
      out += 'ك';
      take(1);
      atWordStart = false;
      continue;
    }
    if (c === 'w' || c === 'y') {
      out += c === 'w' ? 'و' : 'ي';
      take(1);
      atWordStart = false;
      continue;
    }

    if (isVowel(c)) {
      // Final é → يه (café → كَفيه)
      if (c === 'é' && i === lower.length - 1) {
        out += atWordStart ? 'إيه' : 'يه';
        take(1);
        atWordStart = false;
        continue;
      }
      // á / à / â at start → آ (água)
      if (atWordStart && (c === 'á' || c === 'à' || c === 'â')) {
        out += 'آ';
        take(1);
        atWordStart = false;
        continue;
      }
      let ar = '';
      if (c === 'a' || c === 'á' || c === 'à' || c === 'â') ar = 'ا';
      else if (c === 'e' || c === 'ê') ar = 'ي';
      else if (c === 'é') ar = 'ي';
      else if (c === 'i' || c === 'í') ar = 'ي';
      else if (c === 'o' || c === 'ó' || c === 'ô') ar = 'و';
      else if (c === 'u' || c === 'ú' || c === 'ü') ar = 'و';
      else ar = 'ا';

      if (atWordStart) {
        out += 'أ' + (ar === 'ا' ? '' : ar);
      } else {
        out += ar;
      }
      take(1);
      atWordStart = false;
      continue;
    }

    if (c === "'" || c === '-' || c === '’') {
      take(1);
      continue;
    }

    take(1);
  }

  return out + trailingAr;
}

/** Transliterate a full `tl` string (phrase with spaces/punctuation). */
export function transliteratePtToSay(tl: string): string {
  const text = normalize(tl);
  if (!text) return '';

  return text
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      const lead = part.match(/^([¿¡"'(]+)/);
      const leadStr = lead ? lead[1]! : '';
      const rest = lead ? part.slice(leadStr.length) : part;
      return leadStr + transliterateWord(rest);
    })
    .join('');
}
