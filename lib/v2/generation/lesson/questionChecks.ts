import type { Item } from '@/lib/v2/content/items';
import type { Issue } from '@/lib/v2/content/validate';
import { transliteratePtToSay } from '@/lib/v2/content/translit';
import { isMinimalPairOf } from './minimalPairs';
import { stripAccentsPunct } from './coerceRt';

const ARABIC_RE = /[\u0600-\u06FF]/
const LATIN_RE = /[A-Za-zÀ-ÿ]/

function issue(
  path: string,
  rule: string,
  message: string,
  severity: Issue['severity'] = 'error',
): Issue {
  return { path, rule, message, severity };
}

function optionText(opt: unknown): string {
  if (typeof opt === 'string') return opt;
  if (opt && typeof opt === 'object' && !Array.isArray(opt) && 'text' in opt) {
    return String((opt as { text: unknown }).text ?? '');
  }
  if (Array.isArray(opt)) {
    return opt
      .map((s) =>
        s && typeof s === 'object' && 'text' in s
          ? String((s as { text: unknown }).text)
          : '',
      )
      .join('');
  }
  return '';
}

function promptPlain(prompt: unknown): string {
  if (typeof prompt === 'string') return prompt;
  if (prompt && typeof prompt === 'object' && !Array.isArray(prompt)) {
    const p = prompt as { audio_ref?: string };
    if (typeof p.audio_ref === 'string') return `__audio:${p.audio_ref}`;
  }
  if (Array.isArray(prompt)) {
    return prompt
      .map((s) =>
        s && typeof s === 'object' && 'text' in s
          ? String((s as { text: unknown }).text)
          : '',
      )
      .join('');
  }
  return '';
}

function isAudioPrompt(prompt: unknown): boolean {
  return (
    !!prompt &&
    typeof prompt === 'object' &&
    !Array.isArray(prompt) &&
    typeof (prompt as { audio_ref?: unknown }).audio_ref === 'string'
  );
}

function optionsAreArabic(opts: unknown[]): boolean {
  const texts = opts.map(optionText).filter(Boolean);
  if (!texts.length) return false;
  return texts.every((t) => ARABIC_RE.test(t) && !LATIN_RE.test(t));
}

function optionsAreTl(opts: unknown[]): boolean {
  const texts = opts.map(optionText).filter(Boolean);
  if (!texts.length) return false;
  return texts.every((t) => LATIN_RE.test(t) && !ARABIC_RE.test(t));
}

function walkRtLang(
  path: string,
  value: unknown,
  issues: Issue[],
): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((seg, i) => {
      if (!seg || typeof seg !== 'object') return;
      const s = seg as { text?: string; lang?: string };
      const text = String(s.text ?? '');
      const lang = s.lang;
      if (!text) return;
      if (lang === 'tl' && ARABIC_RE.test(text)) {
        issues.push(
          issue(
            `${path}[${i}]`,
            'rt_segment_lang',
            'Arabic characters in lang=tl segment',
          ),
        );
      }
      if ((lang === 'eg' || lang === 'ar') && LATIN_RE.test(text)) {
        issues.push(
          issue(
            `${path}[${i}]`,
            'rt_segment_lang',
            `Latin characters in lang=${lang} segment`,
          ),
        );
      }
    });
  }
}

/**
 * Shape + pedagogy checks for crafted questions (after zod parse).
 */
export function validateQuestionShapes(
  questions: Array<Record<string, unknown>>,
  items: Item[],
): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const itemIds = new Set(items.map((i) => i.id));
  const bankTls = items
    .filter((i) => 'tl' in i && typeof i.tl === 'string')
    .map((i) => (i as { tl: string }).tl.toLowerCase());
  const seenAnswers = new Set<string>();

  for (const [qi, q] of questions.entries()) {
    const base = `questions[${qi}]`;
    const type = String(q.type ?? '');
    const skill = String(q.skill ?? '');
    const prompt = q.prompt;
    const tests = Array.isArray(q.tests) ? q.tests : [];
    const testedId = String(tests[0] ?? '');
    const tested = byId.get(testedId);

    if (prompt && typeof prompt === 'object' && !Array.isArray(prompt)) {
      const pref = prompt as { audio_ref?: string };
      if (typeof pref.audio_ref === 'string' && !itemIds.has(pref.audio_ref)) {
        issues.push(
          issue(
            `${base}.prompt.audio_ref`,
            'unknown_item_ref',
            `audio_ref "${pref.audio_ref}" not in item bank`,
          ),
        );
      }
    }

    walkRtLang(`${base}.prompt`, prompt, issues);
    if (Array.isArray(q.options)) {
      q.options.forEach((o, oi) => walkRtLang(`${base}.options[${oi}]`, o, issues));
    }
    walkRtLang(`${base}.feedback_eg`, q.feedback_eg, issues);

    const isMcq =
      type === 'read_meaning' ||
      type === 'recall_tl' ||
      type === 'listen' ||
      skill === 'listening' ||
      skill === 'reading';

    if (isMcq) {
      const opts = Array.isArray(q.options) ? q.options : [];
      if (opts.length < 2) {
        issues.push(
          issue(`${base}.options`, 'question_options', 'MCQ needs ≥2 options'),
        );
      }
      if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= opts.length) {
        issues.push(
          issue(
            `${base}.answer`,
            'question_answer_index',
            'MCQ answer must be a valid option index',
          ),
        );
      }

      // Stimulus must appear in prompt (tl for read_meaning, ar for recall_tl, audio for listen)
      if (tested && type === 'read_meaning' && 'tl' in tested) {
        const tl = String(tested.tl ?? '');
        if (tl && !promptPlain(prompt).includes(tl)) {
          issues.push(
            issue(
              `${base}.prompt`,
              'question_stimulus',
              'read_meaning prompt must show the tl stimulus',
            ),
          );
        }
        if (opts.length && !optionsAreArabic(opts)) {
          issues.push(
            issue(
              `${base}.options`,
              'question_direction',
              'read_meaning requires Arabic meaning options',
            ),
          );
        }
      }
      if (tested && type === 'recall_tl') {
        const ar =
          'ar' in tested && typeof tested.ar === 'string' ? tested.ar : '';
        const plain = promptPlain(prompt);
        if (ar && !plain.includes(ar) && !/\[[\w-]+\]/.test(plain)) {
          issues.push(
            issue(
              `${base}.prompt`,
              'question_stimulus',
              'recall_tl prompt must show ar stimulus or icon',
            ),
          );
        }
        if (opts.length && !optionsAreTl(opts)) {
          issues.push(
            issue(
              `${base}.options`,
              'question_direction',
              'recall_tl requires TL options',
            ),
          );
        }
      }
      if (type === 'listen' || skill === 'listening') {
        if (!isAudioPrompt(prompt)) {
          issues.push(
            issue(
              `${base}.prompt`,
              'question_stimulus',
              'listen prompt must be audio_ref',
            ),
          );
        }
        if (opts.length && !optionsAreArabic(opts)) {
          issues.push(
            issue(
              `${base}.options`,
              'question_direction',
              'listen requires Arabic meaning options',
            ),
          );
        }
      }

      const correctText = optionText(opts[q.answer as number] ?? '').trim();
      const promptText = promptPlain(prompt);
      if (
        correctText.length >= 2 &&
        promptText.replace(/\s+/g, '').includes(correctText.replace(/\s+/g, ''))
      ) {
        issues.push(
          issue(
            `${base}.prompt`,
            'answer_in_prompt',
            'correct answer text must not appear in the prompt',
          ),
        );
      }

      for (const [oi, opt] of opts.entries()) {
        if (oi === q.answer) continue;
        const text = optionText(opt).trim();
        if (!text) continue;
        const inBank = bankTls.some((tl) => tl === text.toLowerCase());
        const pairOk = isMinimalPairOf(correctText, text);
        if (!inBank && !pairOk && text.length > 1 && LATIN_RE.test(text)) {
          issues.push(
            issue(
              `${base}.options[${oi}]`,
              'bad_distractor',
              `distractor "${text.slice(0, 40)}" is not a bank form or minimal pair`,
              'warning',
            ),
          );
        }
      }
    }

    if (type === 'writing' || skill === 'writing') {
      const accepted = q.accepted ?? q.answer;
      const list = Array.isArray(accepted)
        ? accepted.filter((x) => typeof x === 'string' && x.trim())
        : typeof accepted === 'string'
          ? [accepted]
          : [];
      if (list.length === 0) {
        issues.push(
          issue(
            `${base}.accepted`,
            'question_accepted',
            'writing questions need non-empty accepted[]',
          ),
        );
      }
      const answerTl = String(list[0] ?? '');
      const say = transliteratePtToSay(answerTl).replace(/\s+/g, '');
      const promptText = promptPlain(prompt).replace(/\s+/g, '');
      if (say.length >= 3 && promptText.includes(say)) {
        issues.push(
          issue(
            `${base}.prompt`,
            'writing_say_leak',
            'writing prompt must not contain transliteration of the answer',
          ),
        );
      }
      const key = stripAccentsPunct(answerTl).toLowerCase();
      if (key) {
        if (seenAnswers.has(key)) {
          issues.push(
            issue(
              `${base}.accepted`,
              'duplicate_answer_tl',
              'two writing questions share the same answer_tl',
            ),
          );
        }
        seenAnswers.add(key);
      }
    }
  }

  return issues;
}
