import { z } from 'zod';
import { callClaudeJson, zodToolSchema } from '@/lib/generation/claudeClient';
import {
  LessonPackSchema,
  MicroSchema,
  SpeakPromptSchema,
  type Micro,
  type Question,
  type SpeakPrompt,
} from '@/lib/v2/content/lesson';
import type { Issue } from '@/lib/v2/content/validate';
import {
  formatCompactDayHeader,
  formatQuestionsDaySlice,
} from '../buildRequest';
import { callTimingFromResult, type CallTiming } from '../cost';
import { getDayPlan } from '../plan';
import { withJsonFooter } from './jsonFooter';
import { buildCachedSystemBlocks } from './sharedPrefix';
import { MAX_TOKENS_QUESTIONS, type OutlineResult } from './types';

const QUESTIONS_DAY_JSON_SKELETON = `{
  "questions": [{
    "id": "q1",
    "type": "mcq",
    "skill": "reading",
    "page_index": 0,
    "tests": ["phrase.hello"],
    "prompt": [{ "text": "؟", "lang": "eg" }],
    "options": [
      { "label": [{ "text": "…", "lang": "ar" }], "correct": true },
      { "label": [{ "text": "…", "lang": "ar" }], "correct": false }
    ]
  }],
  "micro": {
    "morning": { "phrase": "phrase.hello", "mission_eg": "…" },
    "tool": {
      "tool_id": "series_id",
      "step": 1,
      "of": 4,
      "builds_on_eg": "…",
      "examples": ["sentence.one", "sentence.two", "sentence.three"],
      "notice": {
        "question_eg": "…",
        "options": [
          { "text": "…", "correct": true },
          { "text": "…", "correct": false },
          { "text": "…", "correct": false }
        ]
      },
      "rule_eg": "…",
      "drills": ["q1", "q2"]
    },
    "evening": { "teaser_eg": "…" }
  },
  "speak_prompts": [{
    "prompt_eg": "…",
    "answer_tl": "…",
    "ids": ["phrase.hello"]
  }]
}`;

const QuestionLooseSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    skill: z.enum(['listening', 'reading', 'speaking', 'writing']),
    page_index: z.number().int().nonnegative(),
    tests: z.array(z.string()).optional(),
  })
  .passthrough();

export const QuestionsDaySchema = z.object({
  questions: z.array(QuestionLooseSchema).min(10).max(15),
  micro: MicroSchema,
  speak_prompts: z.array(SpeakPromptSchema).min(3).max(4),
});

const SUBMIT_QUESTIONS_DAY_TOOL = {
  name: 'submit_questions_day',
  description:
    'Submit crafted questions, micro units, and speak_prompts for this day.',
  inputSchema: zodToolSchema(QuestionsDaySchema),
};

function introducedByPage(outline: OutlineResult): Map<string, number> {
  const map = new Map<string, number>();
  for (const page of outline.pages) {
    for (const id of page.introduces) {
      map.set(id, page.index);
    }
  }
  return map;
}

export function validateQuestionQuotas(questions: Question[]): Issue[] {
  const issues: Issue[] = [];
  const n = questions.length;
  if (n < 10 || n > 15) {
    issues.push({
      path: 'questions',
      rule: 'question_count',
      message: `need 10–15 questions, got ${n}`,
      severity: 'error',
    });
  }
  const bySkill = {
    listening: 0,
    reading: 0,
    speaking: 0,
    writing: 0,
  };
  for (const q of questions) {
    if (q.skill in bySkill) bySkill[q.skill as keyof typeof bySkill] += 1;
  }
  if (bySkill.listening < 3) {
    issues.push({
      path: 'questions',
      rule: 'skill_quota',
      message: `need ≥3 listening, got ${bySkill.listening}`,
      severity: 'error',
    });
  }
  if (bySkill.reading < 3) {
    issues.push({
      path: 'questions',
      rule: 'skill_quota',
      message: `need ≥3 reading, got ${bySkill.reading}`,
      severity: 'error',
    });
  }
  if (bySkill.writing < 2) {
    issues.push({
      path: 'questions',
      rule: 'skill_quota',
      message: `need ≥2 writing, got ${bySkill.writing}`,
      severity: 'error',
    });
  }
  return issues;
}

export function validateQuestionsAgainstOutline(
  questions: Question[],
  outline: OutlineResult,
): Issue[] {
  const issues: Issue[] = [];
  const intro = introducedByPage(outline);
  const maxIndex = Math.max(0, ...outline.pages.map((p) => p.index));

  for (const [qi, q] of questions.entries()) {
    const pageIndex = q.page_index;
    if (typeof pageIndex !== 'number') {
      issues.push({
        path: `questions[${qi}].page_index`,
        rule: 'missing_page_index',
        message: 'question must have page_index',
        severity: 'error',
      });
      continue;
    }
    if (pageIndex > maxIndex) {
      issues.push({
        path: `questions[${qi}].page_index`,
        rule: 'bad_page_index',
        message: `page_index ${pageIndex} out of range`,
        severity: 'error',
      });
    }
    for (const ref of q.tests ?? []) {
      if (ref.startsWith('verb.')) continue;
      const introPage = intro.get(ref);
      if (introPage == null) {
        if (!outline.items.some((i) => i.id === ref)) {
          issues.push({
            path: `questions[${qi}].tests`,
            rule: 'bad_ref',
            message: `unknown item ${ref}`,
            severity: 'error',
          });
        }
        continue;
      }
      if (introPage > pageIndex) {
        issues.push({
          path: `questions[${qi}].tests`,
          rule: 'question_before_intro',
          message: `tests ${ref} introduced on page ${introPage}`,
          severity: 'error',
        });
      }
    }
  }
  return issues;
}

export function validateMicroAndSpeak(opts: {
  micro: Micro;
  speak_prompts: SpeakPrompt[];
  questions: Question[];
  outline: OutlineResult;
}): Issue[] {
  const issues: Issue[] = [];
  const itemIds = new Set(opts.outline.items.map((i) => i.id));
  const questionIds = new Set(opts.questions.map((q) => q.id));

  if (!itemIds.has(opts.micro.morning.phrase)) {
    issues.push({
      path: 'micro.morning.phrase',
      rule: 'bad_ref',
      message: `unknown item ${opts.micro.morning.phrase}`,
      severity: 'error',
    });
  }

  const correctCount = opts.micro.tool.notice.options.filter((o) => o.correct).length;
  if (correctCount !== 1) {
    issues.push({
      path: 'micro.tool.notice.options',
      rule: 'notice_one_correct',
      message: `notice needs exactly one correct option, got ${correctCount}`,
      severity: 'error',
    });
  }

  for (const [ei, id] of opts.micro.tool.examples.entries()) {
    if (!itemIds.has(id)) {
      issues.push({
        path: `micro.tool.examples[${ei}]`,
        rule: 'bad_ref',
        message: `unknown item ${id}`,
        severity: 'error',
      });
    }
  }

  for (const [di, drill] of opts.micro.tool.drills.entries()) {
    if (typeof drill === 'string') {
      if (!questionIds.has(drill)) {
        issues.push({
          path: `micro.tool.drills[${di}]`,
          rule: 'bad_ref',
          message: `drill ${drill} not in questions`,
          severity: 'error',
        });
      }
      continue;
    }
    if (!drill || typeof drill !== 'object') {
      issues.push({
        path: `micro.tool.drills[${di}]`,
        rule: 'bad_drill',
        message: 'drill must be a quiz object or question id',
        severity: 'error',
      });
    }
  }

  for (const [si, sp] of opts.speak_prompts.entries()) {
    for (const [ii, id] of sp.ids.entries()) {
      if (!itemIds.has(id) && !id.startsWith('verb.')) {
        issues.push({
          path: `speak_prompts[${si}].ids[${ii}]`,
          rule: 'bad_ref',
          message: `unknown item ${id}`,
          severity: 'error',
        });
      }
    }
  }

  return issues;
}

export async function runQuestionsStage(opts: {
  outline: OutlineResult;
  day?: number;
}): Promise<{
  questions: Question[];
  micro: Micro;
  speak_prompts: SpeakPrompt[];
  issues: Issue[];
  timing: CallTiming;
  model: string;
}> {
  const day =
    opts.day ??
    opts.outline.lesson?.day ??
    (() => {
      throw new Error('runQuestionsStage requires day');
    })();
  const dayPlan = getDayPlan(day);
  const dayHeader = formatCompactDayHeader(dayPlan);
  const daySlice = formatQuestionsDaySlice(dayPlan);

  const outlineSummary = opts.outline.pages
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(
      (p) =>
        `${p.index}. ${p.page_id} introduces=[${p.introduces.join(', ')}] assumes=[${p.assumes.join(', ')}]`,
    )
    .join('\n');

  const user = withJsonFooter(`STAGE: CRAFTED QUESTIONS + MICRO + SPEAK_PROMPTS
Return JSON matching this skeleton (call the submit_questions_day tool):
${QUESTIONS_DAY_JSON_SKELETON}

Requirements:
- 10–15 questions total; at least 3 listening, 3 reading, 2 writing.
- Each question MUST include page_index (0-based) and may only test items introduced on that page or earlier (introduces lists below). Prefer 2–3 questions tied to early pages for «اختبرني».
- micro: morning / tool / evening per MICRO and MICRO_STEP.
- speak_prompts: 3–4 prompts per DAILY USE.
- micro.tool.drills must be ids from this questions array.
- morning.phrase and speak_prompts[].ids must be item bank ids.

DAY CONTEXT:
${daySlice}

OUTLINE:
${outlineSummary}

ITEM BANK ids: ${opts.outline.items.map((i) => i.id).join(', ')}

Use schema fields: id, type, skill, page_index, tests, prompt, options, answer, feedback_eg, why_wrong_eg as needed.
`);

  console.info(
    `[v2-gen:stage] questions starting pages=${opts.outline.pages.length}`,
  );

  const systemBlocks = buildCachedSystemBlocks({
    items: opts.outline.items,
    dayHeader,
  });

  const result = await callClaudeJson('', user, {
    label: 'questions',
    maxTokens: MAX_TOKENS_QUESTIONS,
    systemBlocks,
    tool: SUBMIT_QUESTIONS_DAY_TOOL,
  });

  let parsed = QuestionsDaySchema.safeParse(result.data);
  let timing = callTimingFromResult({
    label: 'questions',
    durationMs: result.durationMs,
    usage: result.usage,
  });
  let model = result.model;

  if (!parsed.success) {
    const retry = await callClaudeJson(
      '',
      withJsonFooter(`${user}

PREVIOUS FAILED SCHEMA:
${parsed.error.message}
Return { "questions": [...], "micro": {...}, "speak_prompts": [...] } only.`),
      {
        label: 'questions:retry',
        maxTokens: MAX_TOKENS_QUESTIONS,
        systemBlocks,
        tool: SUBMIT_QUESTIONS_DAY_TOOL,
      },
    );
    parsed = QuestionsDaySchema.safeParse(retry.data);
    timing = callTimingFromResult({
      label: 'questions',
      durationMs: result.durationMs + retry.durationMs,
      usage: {
        input_tokens:
          (result.usage?.input_tokens ?? 0) + (retry.usage?.input_tokens ?? 0),
        output_tokens:
          (result.usage?.output_tokens ?? 0) + (retry.usage?.output_tokens ?? 0),
        cache_creation_input_tokens:
          (result.usage?.cache_creation_input_tokens ?? 0) +
          (retry.usage?.cache_creation_input_tokens ?? 0),
        cache_read_input_tokens:
          (result.usage?.cache_read_input_tokens ?? 0) +
          (retry.usage?.cache_read_input_tokens ?? 0),
      },
    });
    model = retry.model;
    if (!parsed.success) {
      throw new Error(`Questions schema failed twice: ${parsed.error.message}`);
    }
  }

  const questions = parsed.data.questions as Question[];
  const micro = parsed.data.micro;
  const speak_prompts = parsed.data.speak_prompts;
  void LessonPackSchema;

  const issues = [
    ...validateQuestionQuotas(questions),
    ...validateQuestionsAgainstOutline(questions, opts.outline),
    ...validateMicroAndSpeak({
      micro,
      speak_prompts,
      questions,
      outline: opts.outline,
    }),
  ];
  return { questions, micro, speak_prompts, issues, timing, model };
}
