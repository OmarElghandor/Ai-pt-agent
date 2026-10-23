export type PageAskPayload = {
  kind: 'page_ask';
  day: number;
  page_id: string;
  step_index: number;
  option_index: number;
};

export type PageQuizPayload = {
  kind: 'page_quiz';
  day: number;
  page_id: string;
  question_id: string;
  option_index: number;
};

export type PageAnswerPayload = PageAskPayload | PageQuizPayload;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function intField(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/** Shape Phase 4 can keep when it replaces the stub writer. */
export function parsePageAnswerPayload(body: unknown): PageAnswerPayload | null {
  if (!isRecord(body)) return null;
  const day = intField(body.day);
  const optionIndex = intField(body.option_index);
  if (day === null || day < 1 || optionIndex === null || optionIndex < 0) return null;
  if (typeof body.page_id !== 'string' || !body.page_id) return null;

  if (body.kind === 'page_ask') {
    const stepIndex = intField(body.step_index);
    if (stepIndex === null || stepIndex < 0) return null;
    return {
      kind: 'page_ask',
      day,
      page_id: body.page_id,
      step_index: stepIndex,
      option_index: optionIndex,
    };
  }

  if (body.kind === 'page_quiz') {
    if (typeof body.question_id !== 'string' || !body.question_id) return null;
    return {
      kind: 'page_quiz',
      day,
      page_id: body.page_id,
      question_id: body.question_id,
      option_index: optionIndex,
    };
  }

  return null;
}
