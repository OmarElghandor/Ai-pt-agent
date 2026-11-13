import { NON_PROBLEM_IDS } from '@/lib/v2/progress/problems';

export type QwenClassifyOutput = {
  problem_id: string;
  confidence: 'low' | 'medium' | 'high';
  note_tl?: string;
};

export type QwenClient = {
  classify(args: {
    prompt: string;
    timeoutMs: number;
  }): Promise<QwenClassifyOutput>;
};

export function classifierEnv(): {
  model: string;
  baseUrl: string;
  apiKey: string;
} | null {
  const model = process.env.CLASSIFIER_MODEL?.trim();
  const baseUrl = process.env.CLASSIFIER_BASE_URL?.trim();
  const apiKey = process.env.CLASSIFIER_API_KEY?.trim();
  if (!model || !baseUrl || !apiKey) return null;
  return { model, baseUrl, apiKey };
}

export function buildClassifierPrompt(opts: {
  questionType: string;
  promptText: string;
  expected: string;
  learner: string;
  itemIds: string[];
  patternIds: string[];
  grammarFocus?: string;
  mainError?: string;
  problems: Array<{ id: string; title_tl: string; explain_eg: string }>;
}): string {
  const list = opts.problems
    .map((p) => `- ${p.id}: ${p.title_tl} — ${p.explain_eg}`)
    .join('\n');
  return `Classify the learner mistake into exactly one problem id from the list, or slip, unsure, or other.
Return JSON only: {"problem_id":"...","confidence":"low|medium|high","note_tl":"..."}

Question type: ${opts.questionType}
Prompt: ${opts.promptText}
Expected: ${opts.expected}
Learner: ${opts.learner}
Items: ${opts.itemIds.join(', ') || '—'}
Patterns: ${opts.patternIds.join(', ') || '—'}
Grammar focus: ${opts.grammarFocus ?? '—'}
Grader hint: ${opts.mainError ?? '—'}

Problems:
${list || '(none)'}
`;
}

export function sanitizeQwenOutput(
  raw: unknown,
  allowedIds: Set<string>,
): QwenClassifyOutput {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  let problem_id =
    typeof obj.problem_id === 'string' ? obj.problem_id.trim() : 'unsure';
  if (
    !allowedIds.has(problem_id) &&
    !NON_PROBLEM_IDS.has(problem_id)
  ) {
    problem_id = 'unsure';
  }
  if (problem_id === 'other') problem_id = 'unsure';
  const confidence =
    obj.confidence === 'low' ||
    obj.confidence === 'medium' ||
    obj.confidence === 'high'
      ? obj.confidence
      : 'low';
  const note_tl =
    typeof obj.note_tl === 'string' ? obj.note_tl.slice(0, 200) : undefined;
  return { problem_id, confidence, note_tl };
}

/** OpenAI-compatible chat completions client for the classifier. */
export function createHttpQwenClient(env: {
  model: string;
  baseUrl: string;
  apiKey: string;
}): QwenClient {
  return {
    async classify({ prompt, timeoutMs }) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(
          `${env.baseUrl.replace(/\/$/, '')}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.apiKey}`,
            },
            body: JSON.stringify({
              model: env.model,
              temperature: 0,
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'system',
                  content:
                    'You label Portuguese learner mistakes. Reply with JSON only.',
                },
                { role: 'user', content: prompt },
              ],
            }),
            signal: ctrl.signal,
          },
        );
        if (!res.ok) throw new Error(`classifier_http_${res.status}`);
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content ?? '{}';
        return JSON.parse(content) as QwenClassifyOutput;
      } finally {
        clearTimeout(t);
      }
    },
  };
}
