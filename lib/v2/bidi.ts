import type { RtLang, RtSegment } from '@/lib/v2/rt';

/** Latin letters/digits with attached hyphens or trailing punctuation: -ar, ESTAR., nós */
export const LATIN_IN_ARABIC_RE =
  /-?[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:[-''][A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*[.,!?…]?/g;

export type BidiPart = { text: string; latin: boolean };

/** Split Arabic/Egyptian text so Latin runs can be LTR-isolated. */
export function splitLatinInArabic(text: string): BidiPart[] {
  const parts: BidiPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LATIN_IN_ARABIC_RE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), latin: false });
    parts.push({ text: match[0]!, latin: true });
    last = start + match[0]!.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), latin: false });
  return parts.filter((p) => p.text.length > 0);
}

/** Punctuation/equals separators between RTL and TL (e.g. " = "). */
export function isTlSeparator(seg: RtSegment): boolean {
  return seg.lang === 'tl' && /^[\s=·•\-–—]+$/.test(seg.text);
}

export function segmentDir(lang: RtLang): 'ltr' | 'rtl' {
  return lang === 'tl' ? 'ltr' : 'rtl';
}

export type DirectionRun = {
  dir: 'ltr' | 'rtl';
  separator: boolean;
  segments: { seg: RtSegment; index: number }[];
};

/**
 * Group consecutive same-dir segments, but keep punctuation separators
 * (e.g. " = ") as their own isolate so they sit between RTL and Latin.
 */
export function directionRuns(segments: RtSegment[]): DirectionRun[] {
  const runs: DirectionRun[] = [];
  segments.forEach((seg, index) => {
    const dir = segmentDir(seg.lang);
    const separator = isTlSeparator(seg);
    const last = runs[runs.length - 1];
    if (
      !separator &&
      last &&
      !last.separator &&
      last.dir === dir
    ) {
      last.segments.push({ seg, index });
    } else {
      runs.push({ dir, separator, segments: [{ seg, index }] });
    }
  });
  return runs;
}

export type FlattenedBidiRun = {
  dir: 'ltr' | 'rtl';
  text: string;
  lang: RtLang;
  group?: RtSegment['group'];
  bold?: boolean;
  wrong?: boolean;
};

/** Flatten segments for tests: Latin inside eg/ar becomes LTR isolates. */
export function flattenBidiRuns(segments: RtSegment[]): FlattenedBidiRun[] {
  const out: FlattenedBidiRun[] = [];
  for (const run of directionRuns(segments)) {
    for (const { seg } of run.segments) {
      if (seg.lang === 'tl') {
        out.push({
          dir: 'ltr',
          text: seg.text,
          lang: 'tl',
          group: seg.group,
          bold: seg.bold,
          wrong: seg.wrong,
        });
        continue;
      }
      for (const part of splitLatinInArabic(seg.text)) {
        out.push({
          dir: part.latin ? 'ltr' : 'rtl',
          text: part.text,
          lang: part.latin ? 'tl' : seg.lang,
          group: part.latin ? undefined : seg.group,
          bold: seg.bold,
          wrong: seg.wrong,
        });
      }
    }
  }
  return out;
}
