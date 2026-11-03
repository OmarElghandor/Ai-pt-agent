import type { Item } from '@/lib/v2/content/items';
import type { Issue } from '@/lib/v2/content/validate';
import { transliteratePtToSay } from '@/lib/v2/content/translit';
import { isMinimalPairOf } from './minimalPairs';
import { stripAccentsPunct } from './coerceRt';
import {
  arabicOptionsAreNearDupes,
  isClosedQuestionType,
  isOpenWriteType,
  isSpeakingType,
  promptHasVariantContext,
} from './questionTypes';

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
    const p = prompt as { audio_ref?: string; eg?: string };
    if (typeof p.audio_ref === 'string') {
      return `__audio:${p.audio_ref}${typeof p.eg === 'string' ? p.eg : ''}`;
    }
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

function itemVariantGroup(item: Item | undefined): string | undefined {
  if (!item) return undefined;
  return 'variant_group' in item && typeof item.variant_group === 'string'
    ? item.variant_group
    : undefined;
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

    if (
      testedId.startsWith('pattern.') &&
      !/^pattern\..+\.ex\.\d+$/.test(testedId) &&
      type !== 'fill_blank_choice' &&
      type !== 'build_sentence'
    ) {
      issues.push(
        issue(
          `${base}.tests`,
          'pattern_not_testable',
          `questions cannot test pattern root "${testedId}" — use derived .ex.N`,
        ),
      );
    }

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
      isClosedQuestionType(type) &&
      type !== 'build_sentence' &&
      (type !== 'listen_pick_image' || Array.isArray(q.options));

    if (type === 'build_sentence') {
      const tiles = Array.isArray(q.tiles) ? q.tiles : Array.isArray(q.options) ? q.options : [];
      if (tiles.length < 2) {
        issues.push(
          issue(`${base}.tiles`, 'question_options', 'build_sentence needs ≥2 tiles'),
        );
      }
      if (!Array.isArray(q.answer) && typeof q.answer !== 'number') {
        issues.push(
          issue(`${base}.answer`, 'question_answer_index', 'build_sentence needs answer indices'),
        );
      }
    } else if (isMcq) {
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

      // Substring / identical Arabic options
      const arTexts = opts.map(optionText).filter((t) => ARABIC_RE.test(t));
      for (let i = 0; i < arTexts.length; i++) {
        for (let j = i + 1; j < arTexts.length; j++) {
          if (arabicOptionsAreNearDupes(arTexts[i]!, arTexts[j]!)) {
            issues.push(
              issue(
                `${base}.options`,
                'duplicate_arabic_options',
                'Arabic options must not be identical or substrings',
              ),
            );
          }
        }
      }

      if (type === 'read_meaning' && tested && 'tl' in tested) {
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

      if (
        type === 'listen_meaning' ||
        type === 'listen_pick_tl' ||
        type === 'listen_pick_image' ||
        type === 'listen' ||
        skill === 'listening'
      ) {
        if (
          (type === 'listen_meaning' ||
            type === 'listen_pick_tl' ||
            type === 'listen_pick_image' ||
            type === 'listen') &&
          !isAudioPrompt(prompt)
        ) {
          issues.push(
            issue(
              `${base}.prompt`,
              'question_stimulus',
              'listen prompt must be audio_ref',
            ),
          );
        }
        if (
          (type === 'listen_meaning' || type === 'listen') &&
          opts.length &&
          !optionsAreArabic(opts)
        ) {
          issues.push(
            issue(
              `${base}.options`,
              'question_direction',
              'listen_meaning requires Arabic meaning options',
            ),
          );
        }
        if (type === 'listen_pick_tl' && opts.length && !optionsAreTl(opts)) {
          issues.push(
            issue(
              `${base}.options`,
              'question_direction',
              'listen_pick_tl requires TL options',
            ),
          );
        }
      }

      if (type === 'fill_blank_choice' || type === 'choose_article') {
        if (opts.length && !optionsAreTl(opts)) {
          issues.push(
            issue(
              `${base}.options`,
              'question_direction',
              'fill_blank_choice requires TL chip options',
            ),
          );
        }
      }

      if (type === 'situation_choice') {
        if (opts.length && !optionsAreTl(opts)) {
          issues.push(
            issue(
              `${base}.options`,
              'question_direction',
              'situation_choice requires TL options',
            ),
          );
        }
        if (opts.length > 0 && opts.length !== 3) {
          issues.push(
            issue(
              `${base}.options`,
              'option_count',
              'situation_choice expects exactly 3 TL options',
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

      // variant_group distractors without context
      const testedGroup = itemVariantGroup(tested);
      if (testedGroup && typeof q.answer === 'number') {
        const promptEg = promptPlain(prompt);
        for (const [oi, opt] of opts.entries()) {
          if (oi === q.answer) continue;
          const text = optionText(opt).trim();
          const peer = items.find((i) => {
            const tl =
              'tl' in i && typeof i.tl === 'string' ? i.tl : '';
            const ar =
              'ar' in i && typeof i.ar === 'string' ? i.ar : '';
            return tl === text || ar === text;
          });
          if (
            peer &&
            itemVariantGroup(peer) === testedGroup &&
            !promptHasVariantContext(promptEg)
          ) {
            issues.push(
              issue(
                `${base}.options[${oi}]`,
                'variant_group_distractor',
                'variant_group distractor without deciding context in prompt',
              ),
            );
          }
        }
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

    if (isOpenWriteType(type) || isSpeakingType(type) || skill === 'writing') {
      const accepted = q.accepted ?? q.answer;
      const list = Array.isArray(accepted)
        ? accepted.filter((x) => typeof x === 'string' && x.trim())
        : typeof accepted === 'string'
          ? [accepted]
          : [];
      if (list.length === 0 && type !== 'read_aloud') {
        issues.push(
          issue(
            `${base}.accepted`,
            'question_accepted',
            'open questions need non-empty accepted[]',
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
      if (key && (isOpenWriteType(type) || skill === 'writing')) {
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
