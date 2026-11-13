import {
  classifyByCode,
  type CodeClassifyInput,
} from '@/lib/v2/progress/classify/codeRules';
import {
  buildClassifierPrompt,
  classifierEnv,
  createHttpQwenClient,
  sanitizeQwenOutput,
  type QwenClient,
} from '@/lib/v2/progress/classify/qwen';
import {
  problemsAvailableAtDay,
  NON_PROBLEM_IDS,
} from '@/lib/v2/progress/problems';
import type { ErrorProblemLabel } from '@/lib/v2/progress/lessonProgressTypes';

export type ClassifyMistakeInput = CodeClassifyInput & {
  learnerDay: number;
  questionType?: string;
  promptText?: string;
  itemIds?: string[];
  patternIds?: string[];
  grammarFocus?: string;
  mainError?: string;
  lang?: string;
  client?: QwenClient | null;
  timeoutMs?: number;
};

export type ClassifyMistakeResult = {
  label: ErrorProblemLabel | null;
  /** true when word mix-up — no problem, cards only */
  cardsOnly: boolean;
  /** raw other → log to v2_problem_requests */
  requestOther: boolean;
  usedModel: boolean;
};

export async function classifyMistake(
  input: ClassifyMistakeInput,
): Promise<ClassifyMistakeResult> {
  const lang = input.lang ?? 'pt-PT';
  const available = problemsAvailableAtDay(input.learnerDay, lang);
  const code = classifyByCode(input, available);

  if (code.kind === 'none') {
    return { label: null, cardsOnly: true, requestOther: false, usedModel: false };
  }
  if (code.kind === 'slip') {
    return {
      label: {
        id: 'slip',
        by: 'code',
        confidence: 'high',
        at: new Date().toISOString(),
      },
      cardsOnly: false,
      requestOther: false,
      usedModel: false,
    };
  }
  if (code.kind === 'problem') {
    return {
      label: {
        id: code.id,
        by: 'code',
        confidence: code.confidence,
        at: new Date().toISOString(),
      },
      cardsOnly: false,
      requestOther: false,
      usedModel: false,
    };
  }

  const allowed = new Set(available.map((p) => p.id));
  const env = classifierEnv();
  const client =
    input.client === undefined
      ? env
        ? createHttpQwenClient(env)
        : null
      : input.client;

  if (!client) {
    return {
      label: {
        id: 'unsure',
        by: 'qwen',
        confidence: 'low',
        at: new Date().toISOString(),
      },
      cardsOnly: false,
      requestOther: false,
      usedModel: false,
    };
  }

  try {
    const prompt = buildClassifierPrompt({
      questionType: input.questionType ?? '',
      promptText: input.promptText ?? '',
      expected: input.right,
      learner: input.wrong,
      itemIds: input.itemIds ?? [],
      patternIds: input.patternIds ?? [],
      grammarFocus: input.grammarFocus,
      mainError: input.mainError,
      problems: available.map((p) => ({
        id: p.id,
        title_tl: p.title_tl,
        explain_eg: p.explain_eg,
      })),
    });
    const raw = await client.classify({
      prompt,
      timeoutMs: input.timeoutMs ?? 8000,
    });
    const out = sanitizeQwenOutput(raw, allowed);
    const requestOther =
      typeof (raw as { problem_id?: string })?.problem_id === 'string' &&
      (raw as { problem_id: string }).problem_id === 'other';

    if (NON_PROBLEM_IDS.has(out.problem_id) || out.problem_id === 'slip') {
      return {
        label: {
          id: out.problem_id === 'other' ? 'unsure' : out.problem_id,
          by: 'qwen',
          model: env?.model,
          confidence: out.confidence,
          at: new Date().toISOString(),
          note_tl: out.note_tl,
        },
        cardsOnly: false,
        requestOther,
        usedModel: true,
      };
    }

    return {
      label: {
        id: out.problem_id,
        by: 'qwen',
        model: env?.model,
        confidence: out.confidence,
        at: new Date().toISOString(),
        note_tl: out.note_tl,
      },
      cardsOnly: false,
      requestOther,
      usedModel: true,
    };
  } catch {
    return {
      label: {
        id: 'unsure',
        by: 'qwen',
        confidence: 'low',
        at: new Date().toISOString(),
      },
      cardsOnly: false,
      requestOther: false,
      usedModel: true,
    };
  }
}
