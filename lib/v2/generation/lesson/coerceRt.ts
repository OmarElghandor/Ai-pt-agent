import type { Rt, RtLang, RtSegment } from '@/lib/v2/content/rt';

const ARABIC_RE = /[\u0600-\u06FF]/;
const LATIN_RE = /[A-Za-zÀ-ÿ]/;

export type FieldKind = 'eg' | 'ar' | 'tl' | 'mixed';

function langForRun(
  text: string,
  fieldKind: FieldKind,
): RtLang {
  const hasAr = ARABIC_RE.test(text);
  const hasLat = LATIN_RE.test(text);
  if (fieldKind === 'tl') return 'tl';
  if (fieldKind === 'ar') return hasLat && !hasAr ? 'tl' : 'ar';
  if (fieldKind === 'eg') return hasLat && !hasAr ? 'tl' : 'eg';
  // mixed: pick by dominant script of this run
  if (hasAr && !hasLat) return 'eg';
  if (hasLat && !hasAr) return 'tl';
  return 'eg';
}

/**
 * Split a plain model string into rt segments by script runs.
 * Arabic → eg or ar by fieldKind; Latin → tl.
 */
export function splitPlainToRt(
  text: string,
  fieldKind: FieldKind = 'mixed',
): Rt {
  const raw = String(text ?? '').trim();
  if (!raw) return [{ text: '', lang: fieldKind === 'tl' ? 'tl' : fieldKind === 'ar' ? 'ar' : 'eg' }];

  const segments: RtSegment[] = [];
  let buf = '';
  let bufKind: 'ar' | 'lat' | 'other' | null = null;

  const flush = () => {
    if (!buf) return;
    const lang =
      bufKind === 'lat'
        ? 'tl'
        : bufKind === 'ar'
          ? fieldKind === 'ar'
            ? 'ar'
            : 'eg'
          : langForRun(buf, fieldKind);
    const last = segments[segments.length - 1];
    if (last && last.lang === lang) {
      last.text += buf;
    } else {
      segments.push({ text: buf, lang });
    }
    buf = '';
    bufKind = null;
  };

  for (const ch of raw) {
    const kind: 'ar' | 'lat' | 'other' = ARABIC_RE.test(ch)
      ? 'ar'
      : LATIN_RE.test(ch)
        ? 'lat'
        : 'other';
    if (bufKind == null) {
      bufKind = kind === 'other' ? null : kind;
      buf += ch;
      if (kind !== 'other') bufKind = kind;
      continue;
    }
    if (kind === 'other' || kind === bufKind) {
      buf += ch;
      continue;
    }
    // script switch
    flush();
    buf = ch;
    bufKind = kind;
  }
  flush();

  if (!segments.length) {
    return [{ text: raw, lang: langForRun(raw, fieldKind) }];
  }
  return segments;
}

/** Coerce string | rt | unknown → Rt. Arrays of strings become segments. */
export function coerceToRt(value: unknown, fieldKind: FieldKind = 'mixed'): Rt {
  if (value == null) return [{ text: '', lang: fieldKind === 'tl' ? 'tl' : 'eg' }];
  if (typeof value === 'string') return splitPlainToRt(value, fieldKind);
  if (Array.isArray(value)) {
    if (
      value.length &&
      value.every(
        (s) => s && typeof s === 'object' && 'text' in s && 'lang' in s,
      )
    ) {
      return value as Rt;
    }
    const joined = value
      .map((s) =>
        typeof s === 'string'
          ? s
          : s && typeof s === 'object' && 'text' in s
            ? String((s as { text: unknown }).text)
            : '',
      )
      .join('');
    return splitPlainToRt(joined, fieldKind);
  }
  return splitPlainToRt(String(value), fieldKind);
}

/** Deep-walk object: coerce known learner-facing string fields to rt. */
export function coercePlainFieldsToRt(
  value: unknown,
  path = '',
): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((v, i) => coercePlainFieldsToRt(v, `${path}[${i}]`));
  }
  if (typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      if (
        k === 'title' ||
        k === 'subtitle' ||
        k === 'tip' ||
        k === 'hint' ||
        k === 'question' ||
        k === 'why' ||
        k === 'label' ||
        k === 'text' ||
        k === 'body' ||
        k === 'head' ||
        k.endsWith('_eg') ||
        k === 'feedback_eg'
      ) {
        const kind: FieldKind = k.endsWith('_eg') || k === 'feedback_eg' ? 'eg' : 'mixed';
        out[k] = coerceToRt(v, kind);
        continue;
      }
    }
    out[k] = coercePlainFieldsToRt(v, `${path}.${k}`);
  }
  return out;
}

export function stripAccentsPunct(tl: string): string {
  return tl
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Accent-fold for writing accepted[] — keeps hyphens (clitics like Chamo-me).
 * Hyphen-less forms must go to near_miss, never accepted.
 */
export function stripAccentsKeepHyphen(tl: string): string {
  return tl
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Grammar-breaking hyphenless form of a clitic (Chamo-me → Chamome). */
export function hyphenlessNearMiss(tl: string): string | null {
  if (!tl.includes('-')) return null;
  const stripped = stripAccentsPunct(tl);
  const kept = stripAccentsKeepHyphen(tl);
  if (stripped && stripped !== kept.replace(/-/g, '')) {
    // still useful as candidate
  }
  const noHyphen = kept.replace(/-/g, '');
  if (!noHyphen || noHyphen === kept) return null;
  return noHyphen;
}
