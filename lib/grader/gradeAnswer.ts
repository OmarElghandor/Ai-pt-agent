import { generateText } from 'ai';
import { extractJson } from '@/lib/generation/claudeClient';
import { getClassifierModel } from '@/lib/model';
import {
  GradeRequestSchema,
  GradeResponseSchema,
  unclearGrade,
  type GradeRequest,
  type GradeResponse,
} from './schema';
import { buildGraderUserMessage, GRADER_SYSTEM } from './prompt';

/**
 * Stateless LLM grader for open speaking/writing answers.
 * Never writes learner progress. Listening/reading must not call this.
 */
export async function gradeAnswer(raw: unknown): Promise<GradeResponse> {
  const parsed = GradeRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return unclearGrade('speaking');
  }
  const req = parsed.data;

  if (req.skill === 'listening' || req.skill === 'reading') {
    return {
      ...unclearGrade(req.skill),
      feedback_ar: 'السمع والقراءة بيتصحّحوا في الكود، مش هنا.',
    };
  }

  if (!req.answer.trim()) {
    return {
      verdict: 'unclear',
      items_used_correctly: [],
      errors: [],
      main_error: null,
      corrected_tl: '',
      feedback_ar: '',
      skill: req.skill,
    };
  }

  try {
    const result = await generateText({
      model: getClassifierModel(),
      system: GRADER_SYSTEM,
      prompt: buildGraderUserMessage(req),
      temperature: 0.2,
      maxOutputTokens: 600,
    });
    return parseGradeModelOutput(result.text, req);
  } catch {
    return unclearGrade(req.skill);
  }
}

export function parseGradeModelOutput(text: string, req: GradeRequest): GradeResponse {
  try {
    const json = extractJson(text);
    const out = GradeResponseSchema.safeParse({
      ...(typeof json === 'object' && json ? json : {}),
      skill: req.skill,
    });
    if (!out.success) return unclearGrade(req.skill);
    const data = out.data;
    if (data.errors.length > 3) {
      data.errors = data.errors.slice(0, 3);
    }
    if (
      data.main_error != null &&
      (data.main_error < 0 || data.main_error >= data.errors.length)
    ) {
      data.main_error = data.errors.length ? 0 : null;
    }
    if (data.verdict === 'correct') {
      data.corrected_tl = '';
      data.errors = [];
      data.main_error = null;
    }
    return data;
  } catch {
    return unclearGrade(req.skill);
  }
}
