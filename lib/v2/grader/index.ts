import type { Skill } from '@/lib/v2/content/lesson';

export type GradeVerdict =
  | 'correct'
  | 'near_miss'
  | 'wrong'
  | 'off_topic'
  | 'arabic_only'
  | 'unclear';

export type GradeError = {
  category: 'grammar' | 'vocabulary' | 'spelling' | 'pronunciation';
  scope: string;
  item_id?: string;
  tool_id?: string;
  wrong: string;
  right: string;
};

export type GradeRequest = {
  skill: Skill;
  prompt_tl?: string;
  accepted?: string[];
  answer: string;
  item_ids?: string[];
  tool_id?: string;
};

export type GradeResponse = {
  verdict: GradeVerdict;
  items_used_correctly: string[];
  errors: GradeError[];
  main_error: number | null;
  corrected_tl: string;
  feedback_ar: string;
  skill: Skill;
};

/** Test hook — closed/accent paths must never increment this. */
let callCount = 0;

export function getGraderCallCount(): number {
  return callCount;
}

export function resetGraderCallCount(): void {
  callCount = 0;
}

/**
 * Phase 4 stub: no network. Always unclear.
 * Phase 6 replaces with Haiku.
 */
export async function gradeAnswer(req: GradeRequest): Promise<GradeResponse> {
  callCount += 1;
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

export function unclearGrade(skill: Skill): GradeResponse {
  return {
    verdict: 'unclear',
    items_used_correctly: [],
    errors: [],
    main_error: null,
    corrected_tl: '',
    feedback_ar: '',
    skill,
  };
}
