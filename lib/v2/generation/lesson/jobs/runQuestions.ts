import { z } from 'zod';
import type { Question, Skill } from '@/lib/v2/content/lesson';
import type { Item } from '@/lib/v2/content/items';
import type { LessonBrief } from '../brief';
import {
  coerceToRt,
  hyphenlessNearMiss,
  stripAccentsKeepHyphen,
  stripAccentsPunct,
} from '../coerceRt';
import { transliteratePtToSay } from '@/lib/v2/content/translit';
import { stripPoliteTail } from '../patternFill';
import { buildQuestionsSystemPrompt } from '../prompts';
import type { OutlineResult } from '../stages/types';
import { minimalPairDistractors } from '../minimalPairs';
import {
  fatal,
  fix,
  formatRetryHints,
  warning,
  type TierIssue,
} from '../tiers';
import { callJobTool } from './call';
import {
  arabicOptionsAreNearDupes,
  imageFallbackType,
  IMAGE_QUESTION_TYPES,
  normalizeQuestionType,
  promptHasVariantContext,
  skillForQuestionType,
  type QuestionType,
} from '../questionTypes';
import {
  planQuestionSlots,
  validateDayQuestionQuotas,
  type PlannedSlot,
  type QuestionUse,
} from '../questionSlots';
import {
  realWorldPhrasesToItems,
  type RealWorldHandoff,
} from '../realWorldBuild';

const SlotFillSchema = z.object({
  slot_id: z.string().min(1),
  prompt_eg: z.string().optional().default(''),
  rubric_eg: z.string().optional(),
  accepted_extra: z.array(z.string()).optional(),
});

export const QuestionsSchema = z.object({
  fills: z.array(SlotFillSchema).min(1).max(20),
});

/** Bare pattern.* root (not a derived .ex.N example). */
export function isPatternRootId(id: string): boolean {
  return id.startsWith('pattern.') && !/^pattern\..+\.ex\.\d+$/.test(id);
}

/** Prefer first derived example of a pattern; else null. */
export function remapPatternTestId(
  testsId: string,
  bank: Item[],
): string | null {
  if (!isPatternRootId(testsId)) return testsId;
  const pattern = bank.find((i) => i.id === testsId && i.type === 'pattern');
  if (pattern && pattern.type === 'pattern') {
    const ex = pattern.examples?.[0];
    if (ex && bank.some((i) => i.id === ex)) return ex;
  }
  const derived = bank.find(
    (i) =>
      i.type === 'phrase' &&
      i.id.startsWith(`${testsId}.ex.`) &&
      /^pattern\..+\.ex\.\d+$/.test(i.id),
  );
  return derived?.id ?? null;
}

function itemTl(item: Item): string {
  return 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
}

function itemMeaning(item: Item): string {
  if ('ar' in item && typeof item.ar === 'string' && item.ar) return item.ar;
  if (
    'context_eg' in item &&
    typeof (item as { context_eg?: string }).context_eg === 'string'
  ) {
    return (item as { context_eg: string }).context_eg;
  }
  return itemTl(item);
}

function itemCloze(item: Item): string | null {
  if ('cloze' in item && typeof item.cloze === 'string' && item.cloze.trim()) {
    return item.cloze.trim();
  }
  return null;
}

function itemVariantGroup(item: Item): string | undefined {
  return 'variant_group' in item && typeof item.variant_group === 'string'
    ? item.variant_group
    : undefined;
}

function dedupeArabicOptions(texts: string[]): string[] {
  const out: string[] = [];
  for (const t of texts) {
    if (!t) continue;
    if (out.some((o) => arabicOptionsAreNearDupes(o, t))) continue;
    out.push(t);
  }
  return out;
}

function meaningOkVsAnswer(candidate: string, correct: string): boolean {
  if (!candidate || !correct) return false;
  if (candidate === correct) return false;
  return !arabicOptionsAreNearDupes(candidate, correct);
}

/**
 * Build MCQ options. For meaning types, exclude same variant_group (unless
 * prompt has context) and any Arabic that equals/contains the answer.
 * Rebuilds from a wider peer pool when the first pass fails; warns on rebuild.
 */
export function buildMcqOptions(
  tested: Item,
  bank: Item[],
  kind: 'meaning' | 'tl',
  egFrame: string,
): {
  options: ReturnType<typeof coerceToRt>[];
  answer: number;
  warnings: string[];
  rebuilt: boolean;
} {
  const warnings: string[] = [];
  const correct = kind === 'meaning' ? itemMeaning(tested) : itemTl(tested);
  const testedGroup = itemVariantGroup(tested);
  const allowVariantPeers =
    Boolean(testedGroup) && promptHasVariantContext(egFrame);

  const collectPeers = (strictVariant: boolean) =>
    bank.filter((i) => {
      if (i.id === tested.id) return false;
      if (strictVariant && i.type !== tested.type) return false;
      const g = itemVariantGroup(i);
      if (
        kind === 'meaning' &&
        testedGroup &&
        g === testedGroup &&
        !allowVariantPeers
      ) {
        return false;
      }
      return true;
    });

  const pickDistractors = (peers: Item[], need: number): string[] => {
    const distractors: string[] = [];
    for (const p of peers) {
      if (distractors.length >= need) break;
      if (kind === 'meaning') {
        const m = itemMeaning(p);
        if (m && meaningOkVsAnswer(m, correct) && !distractors.includes(m)) {
          distractors.push(m);
        }
      } else {
        const t = itemTl(p);
        if (t && t !== correct && !distractors.includes(t)) distractors.push(t);
      }
    }
    return distractors;
  };

  let peers = collectPeers(true);
  let distractors = pickDistractors(peers, 3);
  let rebuilt = false;

  if (kind === 'tl' && distractors.length < 2 && correct) {
    for (const pair of minimalPairDistractors(correct, 3 - distractors.length)) {
      if (!distractors.includes(pair)) distractors.push(pair);
    }
  }

  const assembleRaw = (dists: string[]): string[] => {
    if (kind === 'meaning') {
      let raw = dedupeArabicOptions(
        [correct, ...dists.slice(0, 3)].filter(Boolean),
      );
      if (raw[0] !== correct) {
        raw = [
          correct,
          ...raw.filter((t) => !arabicOptionsAreNearDupes(t, correct)),
        ];
      }
      // Drop any leftover near-dupes of the answer
      raw = raw.filter(
        (t, i) => i === 0 || meaningOkVsAnswer(t, correct) || t === correct,
      );
      // Ensure correct is unique first occurrence
      const seen = new Set<string>();
      const uniq: string[] = [];
      for (const t of raw) {
        const key = t.replace(/\s+/g, '');
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(t);
      }
      return uniq;
    }
    return [correct, ...dists.slice(0, 3)].filter(Boolean);
  };

  let raw = assembleRaw(distractors);
  const needsRebuild =
    !correct ||
    raw.length < 2 ||
    (kind === 'meaning' &&
      raw.some(
        (t, i) =>
          i > 0 && arabicOptionsAreNearDupes(t, correct),
      ));

  if (needsRebuild) {
    rebuilt = true;
    warnings.push('options_rebuilt');
    peers = collectPeers(false);
    distractors = pickDistractors(peers, 3);
    if (kind === 'tl' && distractors.length < 2 && correct) {
      for (const pair of minimalPairDistractors(
        correct,
        3 - distractors.length,
      )) {
        if (!distractors.includes(pair)) distractors.push(pair);
      }
    }
    // Last resort meaning distractors from any phrase/word ar
    if (kind === 'meaning' && distractors.length < 2) {
      for (const p of bank) {
        if (p.id === tested.id) continue;
        const m = itemMeaning(p);
        if (m && meaningOkVsAnswer(m, correct) && !distractors.includes(m)) {
          distractors.push(m);
        }
        if (distractors.length >= 3) break;
      }
    }
    raw = assembleRaw(distractors);
  }

  if (raw.length < 2 && correct) {
    // Guarantee ≥2 options so the slot never drops
    rebuilt = true;
    if (!warnings.includes('options_rebuilt')) warnings.push('options_rebuilt');
    const pad =
      kind === 'meaning'
        ? ['مع السلامة', 'من فضلك', 'شكراً']
        : ['Olá!', 'Obrigado.', 'Por favor.'];
    for (const p of pad) {
      if (kind === 'meaning' ? meaningOkVsAnswer(p, correct) : p !== correct) {
        if (!raw.includes(p)) raw.push(p);
      }
      if (raw.length >= 3) break;
    }
    raw = assembleRaw(raw.filter((t) => t !== correct));
  }

  for (let i = raw.length - 1; i > 0; i--) {
    const j = (i * 7 + tested.id.length) % (i + 1);
    [raw[i], raw[j]] = [raw[j]!, raw[i]!];
  }
  const answer = raw.indexOf(correct);
  if (answer < 0) warnings.push('correct option missing after dedupe');
  const lang = kind === 'meaning' ? 'ar' : 'tl';
  return {
    options: raw.map((t, i) => {
      const segs = coerceToRt(t, lang === 'ar' ? 'ar' : 'tl');
      if (kind === 'tl' && i !== (answer < 0 ? 0 : answer)) {
        const inBank = peers.some((p) => itemTl(p) === t);
        if (!inBank) return segs.map((s) => ({ ...s, wrong: true }));
      }
      return segs;
    }),
    answer: answer < 0 ? 0 : answer,
    warnings,
    rebuilt,
  };
}

function blankTl(tl: string, cloze: string): string {
  const re = new RegExp(cloze.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (re.test(tl)) return tl.replace(re, '____');
  const parts = tl.split(/\s+/);
  if (parts.length > 1) {
    return [...parts.slice(0, -1), '____'].join(' ');
  }
  return '____';
}

/**
 * Word-level tiles from the target sentence. Clitic splits as its own tile
 * ("Chamo" "-me" "Rita"), no punctuation tiles, plus 1–2 distractors
 * (common mistakes like "Me", "chamo").
 */
export function buildSentenceTiles(
  tl: string,
  commonMistakes?: string[],
): { tiles: string[]; answer: number[]; distractors: string[] } {
  const stripped = tl.replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  const rough = stripped.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (const tok of rough) {
    const m = tok.match(/^(.+)-((?:me|te|se|nos|vos|lhe|lhes))$/i);
    if (m) {
      const stem = m[1]!;
      const clitic = m[2]!;
      // Preserve capitalization on the stem; hyphen stays on the clitic tile
      tokens.push(stem);
      tokens.push(`-${clitic.toLowerCase()}`);
    } else {
      tokens.push(tok);
    }
  }

  const distractors: string[] = [];
  const fromMistakes = (commonMistakes ?? []).filter(Boolean);
  for (const d of fromMistakes) {
    if (distractors.length >= 2) break;
    if (tokens.some((t) => t.toLowerCase() === d.toLowerCase())) continue;
    distractors.push(d);
  }
  // Default Chamo-me mistakes when none supplied
  if (/chamo/i.test(tl) && distractors.length < 2) {
    for (const d of ['Me', 'chamo']) {
      if (distractors.length >= 2) break;
      if (tokens.some((t) => t.toLowerCase() === d.toLowerCase())) continue;
      if (!distractors.some((x) => x.toLowerCase() === d.toLowerCase())) {
        distractors.push(d);
      }
    }
  } else if (/-me\b/i.test(tl) && distractors.length < 1) {
    distractors.push('Me');
  }

  const tiles = [...tokens, ...distractors.slice(0, 2)];
  // Stable shuffle
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = (i * 5 + tl.length) % (i + 1);
    [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
  }
  const used = new Set<number>();
  const answerFixed = tokens.map((tok) => {
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === tok && !used.has(i)) {
        used.add(i);
        return i;
      }
    }
    return tiles.indexOf(tok);
  });
  return { tiles, answer: answerFixed, distractors };
}

/** Hint for fill_blank_write from the blanked word (meaning / first letter). */
export function fillBlankWriteHint(cloze: string, tested: Item): string {
  const meaning = itemMeaning(tested);
  const first = cloze.trim().charAt(0);
  if (meaning && meaning !== itemTl(tested)) {
    return `المعنى: ${meaning}${first ? ` · بتبدأ بـ ${first}` : ''}`;
  }
  if (first) return `بتبدأ بـ ${first}`;
  return 'اكتب الكلمة الناقصة';
}

/** Heard prompt id for reply_* : replies_to on the tested item, else itself. */
function replyStimulusId(tested: Item, bank: Item[]): string {
  const rt =
    'replies_to' in tested && typeof tested.replies_to === 'string'
      ? tested.replies_to
      : '';
  if (rt && bank.some((i) => i.id === rt)) return rt;
  return tested.id;
}

/** Accent-fold keeping hyphens — never put Chamome in accepted[]. */
export function buildWritingAccepted(
  answerTl: string,
  withoutTail?: string,
): string[] {
  const tail = withoutTail ?? '';
  return [
    ...new Set(
      [
        answerTl,
        stripAccentsKeepHyphen(answerTl),
        tail,
        tail ? stripAccentsKeepHyphen(tail) : '',
      ].filter(Boolean),
    ),
  ];
}

const CLITIC_FEEDBACK_EG =
  'الضمير بيتلصق بالفعل بشرطة — متكتبهاش لازقة من غير شرطة';

/** Hyphen-breaking forms → near_miss with feedback (not accepted). */
export function buildWritingNearMiss(
  answerTl: string,
  withoutTail?: string,
): { tl: string; feedback_eg: string }[] {
  const out: { tl: string; feedback_eg: string }[] = [];
  const seen = new Set<string>();
  for (const src of [answerTl, withoutTail ?? '']) {
    if (!src) continue;
    const miss = hyphenlessNearMiss(src);
    if (!miss || seen.has(miss.toLowerCase())) continue;
    seen.add(miss.toLowerCase());
    out.push({ tl: miss, feedback_eg: CLITIC_FEEDBACK_EG });
  }
  return out;
}

export function assembleSlotQuestion(
  slot: PlannedSlot,
  fill: z.infer<typeof SlotFillSchema> | undefined,
  opts: {
    bank: Item[];
    index: number;
    /** Optional common_mistakes wrong forms for build_sentence distractors. */
    commonMistakeTls?: string[];
  },
): { question: Question | null; fixes: TierIssue[]; warnings: TierIssue[] } {
  const fixes: TierIssue[] = [];
  const warnings: TierIssue[] = [];
  const qType = normalizeQuestionType(slot.type);
  let testsId = slot.tests;
  const id = `q.day.${opts.index}`;
  const egFrame = (fill?.prompt_eg ?? '').trim();

  if (isPatternRootId(testsId) && qType !== 'fill_blank_choice') {
    const remapped = remapPatternTestId(testsId, opts.bank);
    if (remapped) {
      fixes.push(fix(id, 'pattern_remap', `${testsId} → ${remapped}`));
      testsId = remapped;
    } else if (qType === 'build_sentence') {
      // keep root; we'll use pattern.tl / first example
    } else {
      warnings.push(
        warning(id, 'pattern_not_testable', `cannot test pattern root ${testsId}`),
      );
      return { question: null, fixes, warnings };
    }
  }

  let tested = opts.bank.find((i) => i.id === testsId);
  if (!tested && isPatternRootId(slot.tests)) {
    tested = opts.bank.find((i) => i.id === slot.tests);
  }
  if (!tested) {
    warnings.push(warning(id, 'unknown_item_ref', `dropped tests=${slot.tests}`));
    return { question: null, fixes, warnings };
  }

  const skill: Skill = skillForQuestionType(qType);
  const use: QuestionUse = slot.use;
  const base: Question = {
    id,
    type: qType,
    skill,
    use,
    page_index: slot.page_index,
    page_id: slot.page_id,
    tests: [testsId],
    prompt: coerceToRt(egFrame || defaultPrompt(qType), 'eg'),
    feedback_eg: fill?.rubric_eg ? coerceToRt(fill.rubric_eg, 'eg') : undefined,
  };

  // Image metadata: keep type, store image_ref + fallback_type for the player
  if (IMAGE_QUESTION_TYPES.has(qType)) {
    const image_ref = slot.image_ref ?? testsId;
    const fallback_type = slot.fallback_type ?? imageFallbackType(qType);
    (base as { image_ref?: string }).image_ref = image_ref;
    (base as { image_refs?: string[] }).image_refs = [image_ref];
    (base as { fallback_type?: string }).fallback_type = fallback_type;
    if (slot.image_fallback) {
      (base as { image_fallback?: boolean }).image_fallback = true;
    }
  }

  const tl = itemTl(tested) || (tested.type === 'pattern' ? itemTl(tested) : '');
  const answerTl =
    tl ||
    (isPatternRootId(slot.tests)
      ? (() => {
          const ex = remapPatternTestId(slot.tests, opts.bank);
          const exItem = ex ? opts.bank.find((i) => i.id === ex) : undefined;
          return exItem ? itemTl(exItem) : '';
        })()
      : '');

  if (qType === 'listen_meaning' || qType === 'listen_pick_image') {
    base.prompt =
      qType === 'listen_pick_image'
        ? {
            audio_ref: testsId,
            eg: egFrame || 'مين بيقول إيه؟',
          }
        : { audio_ref: testsId };
    const mcq = buildMcqOptions(tested, opts.bank, 'meaning', egFrame);
    base.options = mcq.options;
    base.answer = mcq.answer;
    for (const w of mcq.warnings) {
      warnings.push(warning(id, w === 'options_rebuilt' ? 'options_rebuilt' : 'mcq', w));
    }
    fixes.push(fix('listen', 'audio_ref', `set from tests ${testsId}`));
  } else if (qType === 'listen_pick_tl') {
    base.prompt = { audio_ref: testsId };
    const mcq = buildMcqOptions(tested, opts.bank, 'tl', egFrame);
    base.options = mcq.options;
    base.answer = mcq.answer;
    for (const w of mcq.warnings) {
      warnings.push(warning(id, w === 'options_rebuilt' ? 'options_rebuilt' : 'mcq', w));
    }
  } else if (qType === 'read_meaning') {
    const frame = egFrame || 'معناها إيه؟';
    base.prompt = [
      ...coerceToRt(frame, 'eg'),
      { text: ' ', lang: 'eg' as const },
      { text: itemTl(tested), lang: 'tl' as const },
    ];
    const mcq = buildMcqOptions(tested, opts.bank, 'meaning', egFrame);
    base.options = mcq.options;
    base.answer = mcq.answer;
    for (const w of mcq.warnings) {
      warnings.push(warning(id, w === 'options_rebuilt' ? 'options_rebuilt' : 'mcq', w));
    }
  } else if (qType === 'situation_choice') {
    const contextEg =
      'context_eg' in tested && typeof tested.context_eg === 'string'
        ? tested.context_eg.trim()
        : '';
    const frame =
      egFrame ||
      contextEg ||
      'في الموقف ده، ترد إزاي؟';
    base.prompt = coerceToRt(frame, 'eg');
    const mcq = buildMcqOptions(tested, opts.bank, 'tl', egFrame);
    // 3 TL options (correct + 2 distractors)
    let options = mcq.options;
    let answer = mcq.answer;
    if (options.length > 3) {
      const correct = options[answer];
      const rest = options.filter((_, i) => i !== answer).slice(0, 2);
      options = correct ? [correct, ...rest] : options.slice(0, 3);
      answer = 0;
    }
    base.options = options;
    base.answer = answer;
    for (const w of mcq.warnings) {
      warnings.push(warning(id, w === 'options_rebuilt' ? 'options_rebuilt' : 'mcq', w));
    }
  } else if (qType === 'fill_blank_choice') {
    const cloze = itemCloze(tested) ?? firstContentWord(answerTl || itemTl(tested));
    const sentence = blankTl(answerTl || itemTl(tested) || '____', cloze);
    const frame = egFrame || 'كمّل الفراغ';
    base.prompt = [
      ...coerceToRt(frame, 'eg'),
      { text: ' ', lang: 'eg' as const },
      { text: sentence, lang: 'tl' as const },
    ];
    const options = buildBlankChoiceOptions(cloze, tested, opts.bank);
    base.options = options.options;
    base.answer = options.answer;
    (base as { cloze?: string }).cloze = cloze;
  } else if (qType === 'build_sentence') {
    const line = answerTl || itemTl(tested);
    if (!line) {
      warnings.push(fatal(id, 'build_sentence', 'no tl to tile'));
      return { question: null, fixes, warnings };
    }
    const built = buildSentenceTiles(line, opts.commonMistakeTls);
    base.prompt = coerceToRt(egFrame || 'رتّب الجملة', 'eg');
    (base as { tiles?: string[] }).tiles = built.tiles;
    base.answer = built.answer;
    base.options = built.tiles.map((t) => coerceToRt(t, 'tl'));
  } else if (
    qType === 'dictation' ||
    qType === 'translate_write' ||
    qType === 'fill_blank_write' ||
    qType === 'describe_image_write' ||
    qType === 'reply_write' ||
    qType === 'say_it' ||
    qType === 'reply_speak' ||
    qType === 'describe_image_speak' ||
    qType === 'read_aloud'
  ) {
    const expected = answerTl || itemTl(tested);
    if (!expected) {
      warnings.push(fatal(id, 'open_answer', 'missing expected tl'));
      return { question: null, fixes, warnings };
    }
    const say = transliteratePtToSay(expected);
    const promptPlain = egFrame.replace(/\s+/g, '');
    const sayPlain = say.replace(/\s+/g, '');
    // Soft: strip leak instead of dropping the slot
    let safeEg = egFrame;
    if (sayPlain.length >= 3 && promptPlain.includes(sayPlain)) {
      warnings.push(
        warning(id, 'writing_say_leak', 'prompt leaked transliteration — using template'),
      );
      safeEg = '';
    }
    const meaning = itemMeaning(tested);
    if (
      meaning &&
      meaning.length >= 2 &&
      (qType === 'translate_write' || qType === 'say_it') &&
      safeEg.includes(meaning)
    ) {
      warnings.push(
        warning(id, 'answer_in_prompt', 'prompt leaked Arabic answer — using template'),
      );
      safeEg = '';
    }

    const stimulusId = replyStimulusId(tested, opts.bank);

    if (qType === 'dictation' || qType === 'reply_speak' || qType === 'read_aloud') {
      if (qType === 'reply_speak') {
        base.prompt = {
          audio_ref: stimulusId,
          eg: safeEg || defaultPrompt(qType),
        };
      } else if (qType === 'dictation') {
        base.prompt = {
          audio_ref: testsId,
          eg: safeEg || defaultPrompt(qType),
        };
      } else {
        base.prompt = [
          ...coerceToRt(safeEg || 'اقرأ بصوت عالي', 'eg'),
          { text: ' ', lang: 'eg' as const },
          { text: expected, lang: 'tl' as const },
        ];
      }
    } else if (qType === 'reply_write') {
      const heard = opts.bank.find((i) => i.id === stimulusId);
      const heardTl = heard ? itemTl(heard) : '';
      base.prompt = [
        ...coerceToRt(safeEg || 'ردّ على الرسالة', 'eg'),
        ...(heardTl
          ? [
              { text: ' ', lang: 'eg' as const },
              { text: heardTl, lang: 'tl' as const },
            ]
          : []),
      ];
      if (heardTl) {
        (base as { prompt_audio_ref?: string }).prompt_audio_ref = stimulusId;
      }
    } else if (qType === 'fill_blank_write') {
      const cloze = itemCloze(tested) ?? firstContentWord(expected);
      const sentence = blankTl(expected, cloze);
      base.prompt = [
        ...coerceToRt(safeEg || 'اكتب الكلمة الناقصة', 'eg'),
        { text: ' ', lang: 'eg' as const },
        { text: sentence, lang: 'tl' as const },
      ];
      (base as { cloze?: string }).cloze = cloze;
      (base as { hint?: string }).hint = fillBlankWriteHint(cloze, tested);
      // Don't surface model rubric as the hint
      delete (base as { feedback_eg?: unknown }).feedback_eg;
    } else if (
      qType === 'describe_image_write' ||
      qType === 'describe_image_speak'
    ) {
      base.prompt = coerceToRt(
        safeEg || 'قول اللي الشخص ده هيقوله',
        'eg',
      );
    } else {
      base.prompt = coerceToRt(safeEg || defaultPrompt(qType), 'eg');
    }

    const withoutTail = stripPoliteTail(expected);
    const extras = (fill?.accepted_extra ?? []).filter(Boolean);
    const accepted = [
      ...buildWritingAccepted(expected, withoutTail),
      ...extras.flatMap((e) => buildWritingAccepted(e)),
    ];
    if (qType === 'fill_blank_write') {
      const cloze = itemCloze(tested) ?? firstContentWord(expected);
      base.accepted = [...new Set([cloze, ...buildWritingAccepted(cloze)])];
    } else {
      base.accepted = [...new Set(accepted)];
    }
    const nearMiss = buildWritingNearMiss(expected, withoutTail);
    if (nearMiss.length) {
      (base as { near_miss?: { tl: string; feedback_eg: string }[] }).near_miss =
        nearMiss;
    }
    if (fill?.rubric_eg && qType !== 'fill_blank_write') {
      (base as { rubric?: { eg: string; must_include: string[] } }).rubric = {
        eg: fill.rubric_eg,
        must_include: [testsId],
      };
    }
  } else {
    warnings.push(warning(id, 'unknown_type', `unsupported type ${qType}`));
    return { question: null, fixes, warnings };
  }

  return { question: base, fixes, warnings };
}

function defaultPrompt(type: QuestionType): string {
  switch (type) {
    case 'listen_meaning':
    case 'listen_pick_tl':
      return 'اسمع واختار';
    case 'listen_pick_image':
      return 'مين بيقول إيه؟';
    case 'dictation':
      return 'اكتب اللي سمعته';
    case 'translate_write':
      return 'اكتب بالبرتغالي';
    case 'fill_blank_write':
    case 'fill_blank_choice':
      return 'كمّل';
    case 'reply_write':
      return 'ردّ على الرسالة';
    case 'say_it':
      return 'قول الجملة';
    case 'reply_speak':
      return 'ردّ بصوتك';
    case 'describe_image_write':
    case 'describe_image_speak':
      return 'قول اللي الشخص ده هيقوله';
    case 'read_aloud':
      return 'اقرأ بصوت عالي';
    case 'build_sentence':
      return 'رتّب الجملة';
    case 'read_meaning':
      return 'معناها إيه؟';
    case 'situation_choice':
      return 'في الموقف ده، ترد إزاي؟';
    default:
      return 'جاوب';
  }
}

function firstContentWord(tl: string): string {
  const parts = tl.split(/\s+/).filter(Boolean);
  return parts[0]?.replace(/[?!.,]/g, '') || tl;
}

function buildBlankChoiceOptions(
  cloze: string,
  tested: Item,
  bank: Item[],
): { options: ReturnType<typeof coerceToRt>[]; answer: number } {
  const distractors: string[] = [];
  // Article pairs
  if (/^(o|a|os|as)$/i.test(cloze)) {
    const pair = /^(os|as)$/i.test(cloze) ? ['os', 'as'] : ['o', 'a'];
    const answer = pair.findIndex((p) => p.toLowerCase() === cloze.toLowerCase());
    return {
      options: pair.map((t) => coerceToRt(t, 'tl')),
      answer: answer < 0 ? 0 : answer,
    };
  }
  for (const p of bank) {
    if (p.id === tested.id) continue;
    const c = itemCloze(p) || firstContentWord(itemTl(p));
    if (c && c.toLowerCase() !== cloze.toLowerCase() && !distractors.includes(c)) {
      distractors.push(c);
    }
    if (distractors.length >= 3) break;
  }
  if (/chamo-me/i.test(cloze) || /chamo-me/i.test(itemTl(tested))) {
    if (!distractors.includes('Chamo me')) distractors.unshift('Chamo me');
    if (!distractors.includes('Me chamo')) distractors.unshift('Me chamo');
  }
  const raw = [cloze, ...distractors.slice(0, 3)];
  for (let i = raw.length - 1; i > 0; i--) {
    const j = (i * 3 + cloze.length) % (i + 1);
    [raw[i], raw[j]] = [raw[j]!, raw[i]!];
  }
  return {
    options: raw.map((t) => coerceToRt(t, 'tl')),
    answer: Math.max(0, raw.indexOf(cloze)),
  };
}

/** Drop later questions that reuse an earlier exact (type, tests) pair. */
export function dedupeTypeTests(questions: Question[]): {
  questions: Question[];
  warnings: TierIssue[];
} {
  const warnings: TierIssue[] = [];
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of questions) {
    const tests = Array.isArray(q.tests) ? q.tests.map(String).join(',') : '';
    const key = `${q.type}::${tests}`;
    if (tests && seen.has(key)) {
      warnings.push(
        warning(
          q.id,
          'duplicate_type_tests',
          `dropped question with duplicate (type, tests)=(${q.type}, ${tests})`,
        ),
      );
      continue;
    }
    if (tests) seen.add(key);
    out.push(q);
  }
  return { questions: out, warnings };
}

/**
 * Warn on later questions that reuse an earlier writing/speaking answer_tl.
 * Never drop — planned slots must all ship (00 Day 1 review).
 */
export function dedupeWritingAnswers(questions: Question[]): {
  questions: Question[];
  warnings: TierIssue[];
} {
  const warnings: TierIssue[] = [];
  const seen = new Set<string>();
  for (const q of questions) {
    if (q.skill !== 'writing' && q.skill !== 'speaking') continue;
    const accepted = Array.isArray(q.accepted) ? q.accepted : [];
    const key = stripAccentsPunct(String(accepted[0] ?? '')).toLowerCase();
    if (key && seen.has(key)) {
      warnings.push(
        warning(
          q.id,
          'duplicate_answer_tl',
          `duplicate answer_tl kept (planned slot must ship)`,
        ),
      );
      continue;
    }
    if (key) seen.add(key);
  }
  return { questions, warnings };
}

/**
 * @deprecated Quotas are planned up front in planQuestionSlots. Kept as no-op
 * for assemble callers during migration.
 */
export function fillSkillQuota(questions: Question[]): {
  questions: Question[];
  warnings: TierIssue[];
} {
  return { questions, warnings: [] };
}

/** @deprecated Prefer assembleSlotQuestion. */
export function assembleQuestionFromDraft(
  draft: {
    type: string;
    skill?: string;
    tests: string;
    prompt?: string;
    answer_tl?: string;
    correct?: string;
    feedback_eg?: string;
    article_set?: 'def' | 'plural';
  },
  opts: { pageIndex: number; pageId: string; index: number; bank: Item[] },
): { question: Question | null; fixes: TierIssue[]; warnings: TierIssue[] } {
  const type = normalizeQuestionType(draft.type, draft.skill);
  const slot: PlannedSlot = {
    slot_id: `legacy${opts.index}`,
    type,
    skill: skillForQuestionType(type),
    tests: draft.tests,
    page_index: opts.pageIndex,
    page_id: opts.pageId,
    use: 'both',
  };
  return assembleSlotQuestion(
    slot,
    {
      slot_id: slot.slot_id,
      prompt_eg: draft.prompt ?? '',
      accepted_extra: draft.answer_tl ? [draft.answer_tl] : undefined,
      rubric_eg: draft.feedback_eg,
    },
    { bank: opts.bank, index: opts.index },
  );
}

export async function runQuestionsJob(opts: {
  brief: LessonBrief;
  outline: OutlineResult;
  items: Item[];
  /** Ignored — day-level job. Kept for call-site compat. */
  pageIndex?: number;
  pageId?: string;
  planSummary?: { index: number; title: string; introduces: string[] }[];
  itemDigest?: { id: string; type: string; tl: string; role?: string }[];
  storyItemOrder?: string[];
  coreItemIds?: string[];
  /** Soft real_world handoff — source of truth for extra quiz slots. */
  realWorld?: RealWorldHandoff | null;
}): Promise<{
  questions: Question[];
  issues: string[];
  fatals: TierIssue[];
  fixes: TierIssue[];
  warnings: TierIssue[];
  flagged: boolean;
  retries: number;
  auto_fix_count: number;
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
  userBody: string;
  systemModules: { name: string; version: string }[];
}> {
  const coreItemIds =
    opts.coreItemIds ?? opts.brief.core_items.map((c) => c.id);
  const rw = opts.realWorld;
  const rwHide = !rw || rw.hide || rw.phrases.length < 3;
  const rwPhrases = rwHide ? [] : rw!.phrases.map((p) => ({ id: p.id }));
  const existingIds = new Set(opts.items.map((i) => i.id));
  const rwItems = rwHide
    ? []
    : realWorldPhrasesToItems(rw!.phrases).filter((i) => !existingIds.has(i.id));
  const bank = [...opts.items, ...rwItems];
  const plan = planQuestionSlots({
    outline: opts.outline,
    items: bank,
    storyItemOrder: opts.storyItemOrder,
    priorityIds: coreItemIds,
    preferBuildSentenceFor: ['pattern.chamo_me'],
    rwPhrases,
    rwHide,
  });

  const slotsJson = plan.slots.map((s) => ({
    slot_id: s.slot_id,
    type: s.type,
    skill: s.skill,
    tests: s.tests,
    use: s.use,
  }));

  const user = `STAGE: DAY QUESTIONS (slot fill)
Return { "fills": [...] } via submit_questions — one fill per slot_id.
Each fill: slot_id, prompt_eg (Egyptian situation), optional rubric_eg, optional accepted_extra[].
Do not change type/tests. Do not write options, answer, tiles, audio_ref.

SLOTS:
${JSON.stringify(slotsJson, null, 2)}

ITEM_DIGEST:
${JSON.stringify(
  [
    ...(opts.itemDigest ??
      bank.map((i) => ({
        id: i.id,
        type: i.type,
        tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : '',
      }))),
    ...(rwHide
      ? []
      : rw!.phrases.map((p) => ({
          id: p.id,
          type: 'phrase',
          tl: p.tl,
          role: 'rw',
        }))),
  ].slice(0, 80),
)}
`;

  const systemModules = [
    { name: 'core', version: '1' },
    { name: 'questions', version: '2' },
  ];

  let call = await callJobTool({
    kind: 'questions',
    label: 'questions:day',
    systemPrompt: buildQuestionsSystemPrompt(),
    brief: opts.brief,
    userBody: user,
    toolName: 'submit_questions',
    toolDescription: 'Submit Egyptian fills for the planned day question slots.',
    schema: QuestionsSchema,
    maxTokens: 4000,
    systemModules,
  });

  let retries = 0;
  let parsed = QuestionsSchema.safeParse(call.data);
  if (!parsed.success) {
    retries = 1;
    call = await callJobTool({
      kind: 'questions',
      label: 'questions:day:retry',
      systemPrompt: buildQuestionsSystemPrompt(),
      brief: opts.brief,
      userBody: `${user}\n\n${formatRetryHints([
        fatal(
          'questions',
          'schema',
          parsed.error.issues[0]?.message ?? 'schema failed',
        ),
      ])}`,
      toolName: 'submit_questions',
      toolDescription: 'Submit Egyptian fills for the planned day question slots.',
      schema: QuestionsSchema,
      maxTokens: 4000,
    });
    parsed = QuestionsSchema.safeParse(call.data);
  }

  const fixes: TierIssue[] = [...plan.warnings.map((w) => warning('slots', 'image_fallback', w))];
  const warnings: TierIssue[] = [];
  const fatals: TierIssue[] = [];
  const questions: Question[] = [];

  const fillById = new Map<string, z.infer<typeof SlotFillSchema>>();
  if (parsed.success) {
    for (const f of parsed.data.fills) fillById.set(f.slot_id, f);
  } else {
    fatals.push(
      fatal('questions', 'schema', 'questions schema failed after retry'),
    );
  }

  for (const [i, slot] of plan.slots.entries()) {
    const built = assembleSlotQuestion(slot, fillById.get(slot.slot_id), {
      bank,
      index: i,
    });
    fixes.push(...built.fixes);
    for (const w of built.warnings) {
      if (w.tier === 'fatal') fatals.push(w);
      else warnings.push(w);
    }
    if (built.question) questions.push(built.question);
  }

  // Never ship fewer than planned — each slot must produce a question
  if (questions.length !== plan.slots.length) {
    fatals.push(
      fatal(
        'questions',
        'slot_drop',
        `shipped ${questions.length} ≠ planned ${plan.slots.length}`,
      ),
    );
  }

  const quota = validateDayQuestionQuotas(questions, coreItemIds, {
    items: bank,
    plannedCount: plan.slots.length,
  });
  if (!quota.ok) {
    for (const msg of quota.fatals) {
      fatals.push(fatal('questions', 'coverage', msg));
    }
  }
  for (const msg of quota.warnings) {
    warnings.push(warning('questions', 'skill_quota', msg));
  }

  if (!questions.length) {
    fatals.push(fatal('questions', 'empty', 'no valid questions after assemble'));
  }

  return {
    questions,
    issues: [
      ...warnings.map((w) => `${w.rule}: ${w.path}: ${w.message}`),
      ...quota.fatals.map((m) => `coverage: ${m}`),
    ],
    fatals,
    fixes,
    warnings,
    flagged: warnings.length > 0 || fixes.length > 0,
    retries,
    auto_fix_count: fixes.length,
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
    userBody: user,
    systemModules,
  };
}
