import type { Skill } from '@/lib/v2/content/lesson';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export type PageAskPayload = {
  kind: 'page_ask';
  answer_id: string;
  day: number;
  page_id: string;
  step_index: number;
  option_index: number;
};

export type PageQuizPayload = {
  kind: 'page_quiz';
  answer_id: string;
  day: number;
  page_id: string;
  question_id: string;
  option_index: number;
};

export type OpenAnswerPayload = {
  kind: 'open';
  answer_id: string;
  day: number;
  skill: Skill;
  text: string;
  item_id?: string;
  question_id?: string;
  question_type?: string;
  accepted?: string[];
  tool_id?: string;
};

export type ClosedSkillPayload = {
  kind: 'closed';
  answer_id: string;
  day: number;
  skill: 'listening' | 'reading';
  option_index: number;
  correct_index: number;
  item_id?: string;
  question_id?: string;
  question_type?: string;
  tool_id?: string;
};

export type AnswerPayload =
  | PageAskPayload
  | PageQuizPayload
  | OpenAnswerPayload
  | ClosedSkillPayload;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function intField(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

const SKILLS = new Set(['listening', 'reading', 'speaking', 'writing']);

export function parseAnswerPayload(body: unknown): AnswerPayload | null {
  if (!isRecord(body)) return null;
  if (!isUuid(body.answer_id)) return null;
  const day = intField(body.day);
  if (day === null || day < 1) return null;
  const answer_id = body.answer_id;

  if (body.kind === 'page_ask') {
    const optionIndex = intField(body.option_index);
    const stepIndex = intField(body.step_index);
    if (optionIndex === null || optionIndex < 0) return null;
    if (stepIndex === null || stepIndex < 0) return null;
    if (typeof body.page_id !== 'string' || !body.page_id) return null;
    return {
      kind: 'page_ask',
      answer_id,
      day,
      page_id: body.page_id,
      step_index: stepIndex,
      option_index: optionIndex,
    };
  }

  if (body.kind === 'page_quiz') {
    const optionIndex = intField(body.option_index);
    if (optionIndex === null || optionIndex < 0) return null;
    if (typeof body.page_id !== 'string' || !body.page_id) return null;
    if (typeof body.question_id !== 'string' || !body.question_id) return null;
    return {
      kind: 'page_quiz',
      answer_id,
      day,
      page_id: body.page_id,
      question_id: body.question_id,
      option_index: optionIndex,
    };
  }

  if (body.kind === 'closed') {
    const optionIndex = intField(body.option_index);
    const correctIndex = intField(body.correct_index);
    if (optionIndex === null || optionIndex < 0) return null;
    if (correctIndex === null || correctIndex < 0) return null;
    if (body.skill !== 'listening' && body.skill !== 'reading') return null;
    return {
      kind: 'closed',
      answer_id,
      day,
      skill: body.skill,
      option_index: optionIndex,
      correct_index: correctIndex,
      item_id: typeof body.item_id === 'string' ? body.item_id : undefined,
      question_id:
        typeof body.question_id === 'string' ? body.question_id : undefined,
      question_type:
        typeof body.question_type === 'string' ? body.question_type : undefined,
      tool_id: typeof body.tool_id === 'string' ? body.tool_id : undefined,
    };
  }

  if (body.kind === 'open') {
    if (typeof body.text !== 'string') return null;
    if (typeof body.skill !== 'string' || !SKILLS.has(body.skill)) return null;
    const accepted = Array.isArray(body.accepted)
      ? body.accepted.filter((a): a is string => typeof a === 'string')
      : undefined;
    return {
      kind: 'open',
      answer_id,
      day,
      skill: body.skill as OpenAnswerPayload['skill'],
      text: body.text,
      item_id: typeof body.item_id === 'string' ? body.item_id : undefined,
      question_id:
        typeof body.question_id === 'string' ? body.question_id : undefined,
      question_type:
        typeof body.question_type === 'string' ? body.question_type : undefined,
      accepted,
      tool_id: typeof body.tool_id === 'string' ? body.tool_id : undefined,
    };
  }

  return null;
}
