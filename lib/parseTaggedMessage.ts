export type Segment = {
  lang: 'pt' | 'ar';
  /** Screen text (Arabic without tashkeel). */
  text: string;
  /** Optional Egyptian vocalized text for TTS only. */
  ttsText?: string;
  pending?: boolean;
};

type TagName = 'pt' | 'ar' | 'arz';

type RawSegment = {
  tag: TagName;
  text: string;
  pending?: boolean;
};

const ARABIC_LETTER_RE = /[\u0600-\u06FF]/;
const LATIN_LETTER_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]/;
const OPEN_RE = /<\s*(pt|ar|arz)\s*>/i;
const CLOSE_RE = /<\s*\/\s*(pt|ar|arz)\s*>/i;
/** Arabic combining marks (tashkeel / harakat). */
const TASHKEEL_RE = /[\u064B-\u065F\u0670]/g;
/** Leftover / streaming tag debris that must never reach the UI or TTS. */
const TAG_DEBRIS_RE =
  /<\/?\s*(?:pt|ar|arz)\s*>|<\s*(?:pt|ar|arz)\s*$|<\s*(?:p|a|pt|ar|arz)?\s*$/gi;

/**
 * Parse bilingual tagged text.
 * <ar> = Egyptian display (no tashkeel)
 * <arz> = Egyptian TTS vocalization (paired with previous <ar>)
 * <pt> = Portuguese
 * Latin leaked inside <ar>/<arz> is extracted into pt segments.
 */
export function parseTaggedMessage(raw: string): Segment[] {
  const { segments } = parseRange(raw, 0, null, false);
  const folded = foldArz(segments.filter((s) => s.text.length > 0));
  // Merge first, then dedupe PT — so dropping a duplicate <pt> does not glue the Arabic on both sides.
  return dedupeAdjacentPt(
    mergeAdjacent(tidyBoundaries(extractArabicFromPortuguese(extractLatinFromArabic(folded)))),
  );
}

/** Text sent to the TTS API for a segment. */
export function segmentTtsText(seg: Segment): string {
  if (seg.lang === 'ar') return (seg.ttsText ?? seg.text).trim();
  return seg.text.trim();
}

/** Strip harakat so the bubble stays readable Egyptian. */
export function stripTashkeel(text: string): string {
  return text.replace(TASHKEEL_RE, '');
}

function foldArz(raw: RawSegment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of raw) {
    if (s.tag === 'arz') {
      const prev = out[out.length - 1];
      if (prev && prev.lang === 'ar') {
        prev.ttsText = `${prev.ttsText ?? ''}${s.text}`;
      } else {
        // Orphan <arz>: show undiacritized, speak vocalized
        out.push({
          lang: 'ar',
          text: stripTashkeel(s.text),
          ttsText: s.text,
          pending: s.pending,
        });
      }
      continue;
    }

    if (s.tag === 'ar') {
      out.push({
        lang: 'ar',
        text: stripTashkeel(s.text),
        pending: s.pending,
      });
      continue;
    }

    out.push({ lang: 'pt', text: s.text, pending: s.pending });
  }
  return out;
}

/**
 * Pull Latin/Portuguese runs out of Arabic segments (feedback quotes, etc.)
 * so they render green and use Portuguese TTS.
 */
export function extractLatinFromArabic(segments: Segment[]): Segment[] {
  const out: Segment[] = [];

  for (const seg of segments) {
    if (seg.lang !== 'ar') {
      out.push(seg);
      continue;
    }

    const displayParts = splitByScript(seg.text);
    const hasLatin = displayParts.some((p) => p.lang === 'pt' && LATIN_LETTER_RE.test(p.text));
    if (!hasLatin) {
      out.push(seg);
      continue;
    }

    // The pronunciation twin may be Portuguese spelled in Arabic letters.
    // Drop it and speak the plain Arabic pieces.
    for (const part of displayParts) {
      if (part.lang === 'pt') {
        if (!LATIN_LETTER_RE.test(part.text)) {
          if (out.length && out[out.length - 1].lang === 'ar') {
            out[out.length - 1].text += part.text;
          } else {
            out.push({ lang: 'ar', text: part.text, pending: seg.pending });
          }
          continue;
        }
        out.push({
          lang: 'pt',
          text: cleanExtractedPt(part.text),
          pending: seg.pending,
        });
        continue;
      }

      out.push({
        lang: 'ar',
        text: part.text,
        pending: seg.pending,
      });
    }
  }

  return out;
}

/**
 * Pull Arabic runs out of Portuguese segments so a gloss inside <pt>
 * renders as Arabic instead of green Portuguese.
 */
export function extractArabicFromPortuguese(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    if (seg.lang !== 'pt') {
      out.push(seg);
      continue;
    }
    const parts = splitByScript(seg.text);
    const hasArabic = parts.some((part) => part.lang === 'ar' && ARABIC_LETTER_RE.test(part.text));
    if (!hasArabic) {
      out.push(seg);
      continue;
    }
    for (const part of parts) {
      if (part.lang === 'ar' && ARABIC_LETTER_RE.test(part.text)) {
        const text = part.text.replace(/^[\s\u2010-\u2015\u2212\-–—:]+/, '').trim();
        if (text) out.push({ lang: 'ar', text, pending: seg.pending });
        continue;
      }
      const text = part.text.replace(/[\s\u2010-\u2015\u2212\-–—:]+$/g, '').trim();
      if (text) out.push({ lang: 'pt', text, pending: seg.pending });
    }
  }
  return out;
}

/** Normalize PT for duplicate detection (quotes / trailing punct). */
function normalizePtKey(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u201C\u201D\u2018\u2019"«»]/g, '')
    .replace(/[.!?؟,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Colon stays with the Arabic that introduces an example.
 * A full stop stays with the Portuguese sentence.
 * A stranded ":." on the Arabic side is just a colon.
 */
export function tidyBoundaries(segments: Segment[]): Segment[] {
  const out = segments.map((seg) => ({ ...seg }));
  for (let i = 0; i < out.length; i++) {
    const seg = out[i];
    const next = out[i + 1];
    if (seg.lang === 'pt') {
      seg.text = cleanExtractedPt(seg.text);
    }
    if (seg.lang === 'ar' && next?.lang === 'pt') {
      seg.text = seg.text.replace(/[\s\u201C\u201D\u2018\u2019"«»]+$/g, '');
      seg.text = seg.text.replace(/:\s*\.$/, ':');
      if (seg.ttsText) {
        seg.ttsText = seg.ttsText.replace(/[\s\u201C\u201D\u2018\u2019"«»]+$/g, '').replace(/:\s*\.$/, ':');
      }
    }
    if (seg.lang === 'pt' && next?.lang === 'ar') {
      // A question mark stays on the Arabic question. Only a stranded full stop or bang
      // belongs to the Portuguese sentence before it.
      const moved = next.text.match(/^[.!]+/);
      if (moved && !/[.!?؟]$/.test(seg.text)) {
        seg.text += moved[0];
        next.text = next.text.slice(moved[0].length).replace(/^\s+/, '');
        if (next.ttsText) next.ttsText = next.ttsText.replace(/^[.!]+\s*/, '');
      }
    }
  }
  return out.filter((seg) => seg.text.length > 0 || seg.ttsText);
}

function cleanExtractedPt(text: string): string {
  return text
    .replace(/^[\s\u201C\u201D\u2018\u2019"«»]+/, '')
    .replace(/[\s\u201C\u201D\u2018\u2019"«»]+$/, '')
    .trim();
}

/** Drop later PT when an earlier PT is the same sentence (keep inline quote for display). */
export function dedupeAdjacentPt(segments: Segment[]): Segment[] {
  const drop = new Set<number>();
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].lang !== 'pt' || drop.has(i)) continue;
    const key = normalizePtKey(segments[i].text);
    if (!key) continue;
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[j].lang !== 'pt' || drop.has(j)) continue;
      if (normalizePtKey(segments[j].text) === key) {
        drop.add(j); // keep earlier (inline in feedback), skip later duplicate
      }
    }
  }
  return segments.filter((_, i) => !drop.has(i));
}

function parseRange(
  raw: string,
  start: number,
  untilTag: TagName | null,
  pendingOuter: boolean,
): { segments: RawSegment[]; end: number } {
  const segments: RawSegment[] = [];
  let i = start;
  let buf = '';

  const flushBuf = (tag: TagName | null, pending = false) => {
    if (!buf) return;
    const text = scrubTagDebris(buf);
    buf = '';
    if (!text) return;

    if (tag) {
      segments.push(pending ? { tag, text, pending: true } : { tag, text });
      return;
    }

    pushFallback(segments, text, pending);
  };

  while (i < raw.length) {
    const slice = raw.slice(i);
    const open = slice.match(OPEN_RE);
    const close = slice.match(CLOSE_RE);
    const openIdx = open?.index ?? -1;
    const closeIdx = close?.index ?? -1;

    if (
      untilTag &&
      close &&
      closeIdx >= 0 &&
      (openIdx < 0 || closeIdx <= openIdx)
    ) {
      buf += raw.slice(i, i + closeIdx);
      flushBuf(untilTag, false);
      return { segments, end: i + closeIdx + close[0].length };
    }

    if (open && openIdx >= 0 && (closeIdx < 0 || openIdx < closeIdx)) {
      buf += raw.slice(i, i + openIdx);
      flushBuf(untilTag, false);

      const nestedTag = open[1].toLowerCase() as TagName;
      const afterOpen = i + openIdx + open[0].length;
      const nested = parseRange(raw, afterOpen, nestedTag, true);

      if (nested.segments.length === 0 && nested.end >= raw.length) {
        const rest = scrubTagDebris(raw.slice(afterOpen));
        if (rest) {
          segments.push({ tag: nestedTag, text: rest, pending: true });
        }
        return { segments, end: raw.length };
      }

      segments.push(...nested.segments);
      i = nested.end;
      continue;
    }

    if (untilTag) {
      buf += raw.slice(i);
      flushBuf(untilTag, true);
      return { segments, end: raw.length };
    }

    buf += raw.slice(i);
    flushBuf(null, pendingOuter);
    return { segments, end: raw.length };
  }

  if (buf) flushBuf(untilTag, Boolean(untilTag) || pendingOuter);
  return { segments, end: i };
}

function pushFallback(
  segments: RawSegment[],
  raw: string,
  pending = false,
): void {
  const cleaned = scrubTagDebris(raw);
  if (!cleaned.trim()) return;
  for (const part of splitByScript(cleaned)) {
    const tag: TagName = part.lang;
    segments.push(pending ? { tag, text: part.text, pending: true } : { tag, text: part.text });
  }
}

/** Remove any visible language markup (complete or partial). */
export function scrubTagDebris(text: string): string {
  return text.replace(TAG_DEBRIS_RE, '');
}

/**
 * Split untagged bilingual runs so PT → Portuguese TTS and AR → Arabic TTS.
 */
export function splitByScript(text: string): { lang: 'pt' | 'ar'; text: string }[] {
  const parts: { lang: 'pt' | 'ar'; text: string }[] = [];
  let buf = '';
  let lang: 'pt' | 'ar' | null = null;

  const flush = () => {
    if (!buf) return;
    const resolved = lang ?? (ARABIC_LETTER_RE.test(buf) ? 'ar' : 'pt');
    parts.push({ lang: resolved, text: buf });
    buf = '';
  };

  for (const ch of text) {
    const chLang = ARABIC_LETTER_RE.test(ch)
      ? 'ar'
      : LATIN_LETTER_RE.test(ch)
        ? 'pt'
        : null;

    if (chLang && lang && chLang !== lang) {
      flush();
      lang = chLang;
      buf = ch;
      continue;
    }

    if (chLang) lang = chLang;
    buf += ch;
  }
  flush();

  return parts.filter((p) => p.text.length > 0);
}

/** Space between merged same-lang chunks unless one side already has boundary space/punct. */
function mergeGap(prevText: string, nextText: string): string {
  if (!prevText || !nextText) return '';
  if (/\s$/.test(prevText) || /^\s/.test(nextText)) return '';
  if (/^[,.;:!?…)]/.test(nextText)) return '';
  return ' ';
}

function mergeAdjacent(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    if (!seg.text && !seg.ttsText) continue;
    const prev = out[out.length - 1];
    if (prev && prev.lang === seg.lang && !prev.pending && !seg.pending) {
      const gap = mergeGap(prev.text, seg.text);
      prev.text += gap + seg.text;
      if (prev.ttsText || seg.ttsText) {
        const ttsGap = mergeGap(prev.ttsText ?? prev.text, seg.ttsText ?? seg.text);
        prev.ttsText = `${prev.ttsText ?? ''}${ttsGap}${seg.ttsText ?? seg.text}`;
      }
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

/**
 * Truncate to the last complete top-level tag end before persisting history.
 */
export function trimToLastCompleteSegment(raw: string): string {
  let depth = 0;
  let lastCompleteEnd = 0;
  let i = 0;

  while (i < raw.length) {
    const slice = raw.slice(i);
    const open = slice.match(OPEN_RE);
    const close = slice.match(CLOSE_RE);
    const openIdx = open?.index ?? -1;
    const closeIdx = close?.index ?? -1;

    if (openIdx < 0 && closeIdx < 0) break;

    if (openIdx >= 0 && (closeIdx < 0 || openIdx < closeIdx)) {
      depth += 1;
      i += openIdx + open![0].length;
      continue;
    }

    if (closeIdx >= 0) {
      if (depth > 0) depth -= 1;
      i += closeIdx + close![0].length;
      if (depth === 0) lastCompleteEnd = i;
      continue;
    }

    break;
  }

  return lastCompleteEnd > 0 ? raw.slice(0, lastCompleteEnd) : raw;
}

/** Strip accidental thinking blocks if any leak through. */
export function stripThinkBlocks(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/** Plain text for clipboard / display — no tags, no <arz>, no tashkeel. */
export function stripLanguageTags(raw: string): string {
  return stripTashkeel(
    scrubTagDebris(
      raw
        .replace(/<\s*arz\s*>[\s\S]*?<\s*\/\s*arz\s*>/gi, '')
        .replace(/<\s*\/?\s*(?:pt|ar|arz)\s*>/gi, ''),
    ),
  ).trim();
}
