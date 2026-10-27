import { z } from 'zod';
import type { Question } from '@/lib/v2/content/lesson';
import type { Item } from '@/lib/v2/content/items';
import type { LessonBrief } from '../brief';
import { coerceToRt, stripAccentsPunct } from '../coerceRt';
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

const QuestionTypeSchema = z.enum([
  'read_meaning',
  'recall_tl',
  'listen',
  'writing',
  // Legacy aliases mapped in assemble
  'listening',
  'reading',
  'mcq',
  'write',
]);

const QuestionDraftSchema = z.object({
  type: QuestionTypeSchema.or(z.string().min(1)),
  /** Optional — code derives skill from type. */
  skill: z.enum(['listening', 'reading', 'speaking', 'writing']).optional(),
  tests: z.string().min(1),
  /** EG frame only; code injects stimulus from tests[0]. */
  prompt: z.string().optional().default(''),
  /** Required for writing; optional for MCQ skills. */
  answer_tl: z.string().optional(),
  correct: z.string().optional(),
  feedback_eg: z.string().optional(),
});

export const QuestionsSchema = z.object({
  questions: z.array(QuestionDraftSchema).min(2).max(4),
});

function normalizeQuestionType(
  type: string,
  skill?: string,
): 'read_meaning' | 'recall_tl' | 'listen' | 'writing' {
  const t = type.trim().toLowerCase();
  if (t === 'read_meaning' || t === 'recall_tl' || t === 'listen' || t === 'writing') {
    return t;
  }
  if (t === 'listen' || t === 'listening' || skill === 'listening') return 'listen';
  if (t === 'recall_tl' || skill === 'reading') return 'recall_tl';
  if (t === 'write' || t === 'writing' || skill === 'writing') return 'writing';
  if (t === 'read_meaning' || t === 'reading' || t === 'mcq') return 'read_meaning';
  if (skill === 'speaking') return 'writing';
  return 'read_meaning';
}

function skillForType(
  type: 'read_meaning' | 'recall_tl' | 'listen' | 'writing',
): 'listening' | 'reading' | 'writing' {
  if (type === 'listen') return 'listening';
  if (type === 'writing') return 'writing';
  return 'reading';
}

function itemTl(item: Item): string {
  return 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
}

function itemMeaning(item: Item): string {
  if ('ar' in item && typeof item.ar === 'string' && item.ar) return item.ar;
  if ('context_eg' in item && typeof (item as { context_eg?: string }).context_eg === 'string') {
    return (item as { context_eg: string }).context_eg;
  }
  return itemTl(item);
}

function buildMcqOptions(
  tested: Item,
  bank: Item[],
  kind: 'meaning' | 'tl',
): { options: ReturnType<typeof coerceToRt>[]; answer: number } {
  const correct =
    kind === 'meaning' ? itemMeaning(tested) : itemTl(tested);
  const peers = bank.filter(
    (i) => i.id !== tested.id && i.type === tested.type,
  );
  const distractors: string[] = [];
  for (const p of peers) {
    if (distractors.length >= 3) break;
    if (kind === 'meaning') {
      const m = itemMeaning(p);
      if (m && m !== correct) distractors.push(m);
    } else {
      const t = itemTl(p);
      if (t && t !== correct) distractors.push(t);
    }
  }
  if (kind === 'tl' && distractors.length < 2 && correct) {
    for (const pair of minimalPairDistractors(correct, 3 - distractors.length)) {
      distractors.push(pair);
    }
  }
  // Prefer fewer options over invented scramble.
  const raw = [correct, ...distractors.slice(0, 3)].filter(Boolean);
  for (let i = raw.length - 1; i > 0; i--) {
    const j = (i * 7 + tested.id.length) % (i + 1);
    [raw[i], raw[j]] = [raw[j]!, raw[i]!];
  }
  const answer = raw.indexOf(correct);
  const lang = kind === 'meaning' ? 'ar' : 'tl';
  return {
    options: raw.map((t, i) => {
      const segs = coerceToRt(t, lang === 'ar' ? 'ar' : 'tl');
      // Mark non-bank TL distractors (minimal pairs) as intentionally wrong
      if (kind === 'tl' && i !== (answer < 0 ? 0 : answer)) {
        const inBank = peers.some((p) => itemTl(p) === t);
        if (!inBank) {
          return segs.map((s) => ({ ...s, wrong: true }));
        }
      }
      return segs;
    }),
    answer: answer < 0 ? 0 : answer,
  };
}

export function assembleQuestionFromDraft(
  draft: z.infer<typeof QuestionDraftSchema>,
  opts: { pageIndex: number; pageId: string; index: number; bank: Item[] },
): { question: Question | null; fixes: TierIssue[]; warnings: TierIssue[] } {
  const fixes: TierIssue[] = [];
  const warnings: TierIssue[] = [];
  const tested = opts.bank.find((i) => i.id === draft.tests);
  if (!tested) {
    fixes.push(
      warning(
        `q.${opts.pageId}.${opts.index}`,
        'unknown_item_ref',
        `dropped tests=${draft.tests}`,
      ),
    );
    return { question: null, fixes, warnings };
  }

  const qType = normalizeQuestionType(draft.type, draft.skill);
  const skill = skillForType(qType);
  const id = `q.${opts.pageId}.${opts.index}`;
  const egFrame = (draft.prompt ?? '').trim();
  const base: Question = {
    id,
    type: qType,
    skill,
    page_index: opts.pageIndex,
    tests: [draft.tests],
    prompt: coerceToRt(egFrame || 'اختار الإجابة', 'eg'),
    feedback_eg: draft.feedback_eg
      ? coerceToRt(draft.feedback_eg, 'eg')
      : undefined,
  };

  if (qType === 'listen') {
    base.prompt = { audio_ref: draft.tests };
    const mcq = buildMcqOptions(tested, opts.bank, 'meaning');
    base.options = mcq.options;
    base.answer = mcq.answer;
    fixes.push(fix('listen', 'audio_ref', `set from tests ${draft.tests}`));
  } else if (qType === 'read_meaning') {
    // Show tl stimulus; options = ar
    const tl = itemTl(tested);
    const frame = egFrame || 'معناها إيه؟';
    base.prompt = [
      ...coerceToRt(frame, 'eg'),
      { text: ' ', lang: 'eg' as const },
      { text: tl, lang: 'tl' as const },
    ];
    const mcq = buildMcqOptions(tested, opts.bank, 'meaning');
    base.options = mcq.options;
    base.answer = mcq.answer;
  } else if (qType === 'recall_tl') {
    // Show ar (or icon); options = tl
    const meaning = itemMeaning(tested);
    const icon =
      tested &&
      'media' in tested &&
      tested.media &&
      typeof tested.media === 'object' &&
      typeof (tested.media as { icon?: string }).icon === 'string'
        ? (tested.media as { icon: string }).icon
        : null;
    const frame = egFrame || (icon ? 'إيه الكلمة؟' : 'بالبرتغالي؟');
    base.prompt = icon
      ? coerceToRt(`${frame} [${icon}]`, 'eg')
      : [
          ...coerceToRt(frame, 'eg'),
          { text: ' ', lang: 'eg' as const },
          { text: meaning, lang: 'ar' as const },
        ];
    const mcq = buildMcqOptions(tested, opts.bank, 'tl');
    base.options = mcq.options;
    base.answer = mcq.answer;
  } else {
    const answerTl = (draft.answer_tl ?? draft.correct ?? '').trim();
    if (!answerTl) {
      return {
        question: null,
        fixes,
        warnings: [
          fatal(
            id,
            'writing_answer_tl',
            'writing question missing answer_tl',
          ),
        ],
      };
    }
    const say = transliteratePtToSay(answerTl);
    const promptPlain = egFrame.replace(/\s+/g, '');
    const sayPlain = say.replace(/\s+/g, '');
    if (sayPlain.length >= 3 && promptPlain.includes(sayPlain)) {
      return {
        question: null,
        fixes,
        warnings: [
          fatal(
            id,
            'writing_say_leak',
            'writing prompt must not contain transliteration of the answer',
          ),
        ],
      };
    }
    base.prompt = coerceToRt(egFrame || 'اكتب بالبرتغالي', 'eg');
    const withoutTail = stripPoliteTail(answerTl);
    const accepted = [
      ...new Set(
        [
          answerTl,
          stripAccentsPunct(answerTl),
          withoutTail,
          withoutTail ? stripAccentsPunct(withoutTail) : '',
        ].filter(Boolean),
      ),
    ];
    if (!accepted.length) {
      return {
        question: null,
        fixes,
        warnings: [
          fatal(id, 'writing_accepted', 'accepted[] empty after normalize'),
        ],
      };
    }
    base.accepted = accepted;
    fixes.push(fix('writing', 'accepted', 'built from answer_tl'));
  }

  return { question: base, fixes, warnings };
}

/** Drop later questions that reuse an earlier writing answer_tl. */
export function dedupeWritingAnswers(questions: Question[]): {
  questions: Question[];
  warnings: TierIssue[];
} {
  const warnings: TierIssue[] = [];
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of questions) {
    if (q.skill !== 'writing') {
      out.push(q);
      continue;
    }
    const accepted = Array.isArray(q.accepted) ? q.accepted : [];
    const key = stripAccentsPunct(String(accepted[0] ?? '')).toLowerCase();
    if (key && seen.has(key)) {
      warnings.push(
        warning(
          q.id,
          'duplicate_answer_tl',
          `dropped writing question with duplicate answer_tl`,
        ),
      );
      continue;
    }
    if (key) seen.add(key);
    out.push(q);
  }
  return { questions: out, warnings };
}

/** Convert reading↔listening to meet day quotas (no LLM). */
export function fillSkillQuota(questions: Question[]): {
  questions: Question[];
  warnings: TierIssue[];
} {
  const warnings: TierIssue[] = [];
  const count = (skill: string) =>
    questions.filter((q) => q.skill === skill).length;
  let listening = count('listening');
  let reading = count('reading');
  let writing = count('writing');
  const out = [...questions];

  const needL = Math.max(0, 3 - listening);
  const needR = Math.max(0, 3 - reading);
  const needW = Math.max(0, 2 - writing);

  if (needL + needR + needW > 0) {
    warnings.push(
      warning(
        'questions',
        'skill_quota',
        `before convert L=${listening} R=${reading} W=${writing}`,
      ),
    );
  }

  for (let i = 0; i < out.length && listening < 3; i++) {
    if (out[i]!.skill === 'reading') {
      out[i] = {
        ...out[i]!,
        skill: 'listening',
        prompt: {
          audio_ref: Array.isArray(out[i]!.tests)
            ? String(out[i]!.tests![0])
            : '',
        },
      };
      listening += 1;
      reading -= 1;
    }
  }
  for (let i = 0; i < out.length && reading < 3; i++) {
    if (out[i]!.skill === 'listening' && listening > 3) {
      out[i] = { ...out[i]!, skill: 'reading' };
      reading += 1;
      listening -= 1;
    }
  }
  return { questions: out, warnings };
}

export async function runQuestionsJob(opts: {
  brief: LessonBrief;
  outline: OutlineResult;
  items: Item[];
  pageIndex: number;
  pageId: string;
  planSummary?: { index: number; title: string; introduces: string[] }[];
  itemDigest?: { id: string; type: string; tl: string; role?: string }[];
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
  const entry = opts.outline.pages.find((p) => p.index === opts.pageIndex);
  const introduces = entry?.introduces ?? [];
  const itemDigest =
    opts.itemDigest ??
    opts.items.map((i) => ({
      id: i.id,
      type: i.type,
      tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : '',
    }));

  const user = `STAGE: QUESTIONS FOR ONE PAGE
Return { "questions": [...] } via submit_questions — 2 to 4 questions.
Each: type, skill (listening|reading|writing), tests (one item id from INTRODUCES), prompt (plain string), answer_tl (required for writing — the expected Portuguese), optional feedback_eg.
Do not invent item ids. Do not write options, answer, accepted, audio_ref, or why_wrong_eg — code builds those.

PAGE index=${opts.pageIndex} id=${opts.pageId}
INTRODUCES: ${introduces.join(', ') || '(none)'}
ITEM_DIGEST:
${JSON.stringify(itemDigest.filter((i) => introduces.includes(i.id) || true).slice(0, 40))}
`;

  const systemModules = [
    { name: 'core', version: '1' },
    { name: 'questions', version: '1' },
  ];

  let call = await callJobTool({
    kind: 'questions',
    label: `questions:${opts.pageId}`,
    systemPrompt: buildQuestionsSystemPrompt(),
    brief: opts.brief,
    userBody: user,
    toolName: 'submit_questions',
    toolDescription: 'Submit 2–4 questions for one page.',
    schema: QuestionsSchema,
    maxTokens: 2000,
    systemModules,
  });

  let retries = 0;
  let parsed = QuestionsSchema.safeParse(call.data);
  if (!parsed.success) {
    retries = 1;
    call = await callJobTool({
      kind: 'questions',
      label: `questions:${opts.pageId}:retry`,
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
      toolDescription: 'Submit 2–4 questions for one page.',
      schema: QuestionsSchema,
      maxTokens: 2000,
    });
    parsed = QuestionsSchema.safeParse(call.data);
  }

  const fixes: TierIssue[] = [];
  const warnings: TierIssue[] = [];
  const fatals: TierIssue[] = [];
  const questions: Question[] = [];

  if (!parsed.success) {
    fatals.push(
      fatal('questions', 'schema', 'questions schema failed after retry'),
    );
  } else {
    for (const [i, draft] of parsed.data.questions.entries()) {
      const built = assembleQuestionFromDraft(draft, {
        pageIndex: opts.pageIndex,
        pageId: opts.pageId,
        index: i,
        bank: opts.items,
      });
      fixes.push(...built.fixes);
      for (const w of built.warnings) {
        if (w.tier === 'fatal') fatals.push(w);
        else warnings.push(w);
      }
      if (built.question) questions.push(built.question);
    }
    if (!questions.length) {
      fatals.push(fatal('questions', 'empty', 'no valid questions after autofix'));
    }
  }

  return {
    questions,
    issues: warnings.map((w) => `${w.rule}: ${w.path}: ${w.message}`),
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
