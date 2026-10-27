import type { Issue } from '@/lib/v2/content/validate';
import type { LessonPack } from '@/lib/v2/content/lesson';

const BRAZILIAN = [
  'ônibus',
  'onibus',
  'trem',
  'celular',
  'banheiro',
  'café da manhã',
  'cafe da manha',
];

/** MSA markers that must not appear in Egyptian (eg) fields. */
const MSA_IN_EG = [
  'أريد',
  'ماذا',
  'لماذا',
  'هذا',
  'هذه',
  'الذي',
  'سوف',
  'ليس',
  'عاوز',
];

/** Egyptian markers that must not appear in MSA meaning (ar/ar_f) fields. */
const EG_IN_AR = [
  'عايز',
  'إزاي',
  'ليه',
  'ده',
  'دي',
  'مش',
  'بحب',
  'بس',
  'كده',
  'لو سمحت',
  'إيه',
];

/**
 * Pedagogical checks. arabic_register is an error (blocks publish / flags assemble).
 * Brazilian / sentence_length stay warnings.
 */
export function runGenerationChecks(pack: LessonPack, phase = 1): Issue[] {
  const issues: Issue[] = [];
  const maxWords = phase === 1 ? 7 : phase === 2 ? 10 : 14;

  const walk = (path: string, value: unknown, kind: 'tl' | 'eg' | 'ar' | 'other') => {
    if (value == null) return;
    if (typeof value === 'string') {
      checkString(path, value, kind, maxWords, issues);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        // rt segment: respect lang field
        if (v && typeof v === 'object' && 'text' in v && 'lang' in v) {
          const seg = v as { text?: unknown; lang?: string };
          const lang = seg.lang;
          let segKind: 'tl' | 'eg' | 'ar' | 'other' = kind;
          if (lang === 'tl') segKind = 'tl';
          else if (lang === 'eg') segKind = 'eg';
          else if (lang === 'ar') segKind = 'ar';
          const text = String(seg.text ?? '');
          checkString(`${path}[${i}]`, text, segKind, maxWords, issues);
          if (lang === 'tl' && /[\u0600-\u06FF]/.test(text)) {
            issues.push({
              path: `${path}[${i}]`,
              rule: 'rt_segment_lang',
              message: 'Arabic characters in lang=tl segment',
              severity: 'error',
            });
          }
          if (
            (lang === 'eg' || lang === 'ar') &&
            /[A-Za-zÀ-ÿ]/.test(text)
          ) {
            issues.push({
              path: `${path}[${i}]`,
              rule: 'rt_segment_lang',
              message: `Latin characters in lang=${lang} segment`,
              severity: 'error',
            });
          }
          return;
        }
        walk(`${path}[${i}]`, v, kind);
      });
      return;
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        let next: 'tl' | 'eg' | 'ar' | 'other' = kind;
        if (k === 'tl' || k === 'tl_f') next = 'tl';
        else if (k === 'eg' || k === 'context_eg' || k.endsWith('_eg')) next = 'eg';
        else if (k === 'ar' || k === 'ar_f') next = 'ar';
        walk(`${path}.${k}`, v, next);
      }
    }
  };

  walk('pack', pack, 'other');
  return issues;
}

function checkString(
  path: string,
  value: string,
  kind: 'tl' | 'eg' | 'ar' | 'other',
  maxWords: number,
  issues: Issue[],
): void {
  const lower = value.toLowerCase();
  if (kind === 'tl' || kind === 'other') {
    for (const banned of BRAZILIAN) {
      if (lower.includes(banned)) {
        issues.push({
          path,
          rule: 'brazilian',
          message: `Possible Brazilian form "${banned}"`,
          severity: 'warning',
        });
      }
    }
    if (/\bvocê\b/i.test(value) && /^você\b/i.test(value.trim())) {
      issues.push({
        path,
        rule: 'brazilian',
        message: 'Sentence-initial você (prefer tu / o senhor)',
        severity: 'warning',
      });
    }
    if (kind === 'tl') {
      const words = value.trim().split(/\s+/).filter(Boolean);
      if (words.length > maxWords) {
        issues.push({
          path,
          rule: 'sentence_length',
          message: `${words.length} words > phase max ${maxWords}`,
          severity: 'warning',
        });
      }
    }
  }
  if (kind === 'eg') {
    for (const m of MSA_IN_EG) {
      if (value.includes(m)) {
        issues.push({
          path,
          rule: 'arabic_register',
          message: `MSA marker "${m}" in Egyptian field`,
          severity: 'error',
        });
      }
    }
  }
  if (kind === 'ar') {
    for (const e of EG_IN_AR) {
      if (value.includes(e)) {
        issues.push({
          path,
          rule: 'arabic_register',
          message: `Egyptian marker "${e}" in MSA meaning field`,
          severity: 'error',
        });
      }
    }
  }
}
